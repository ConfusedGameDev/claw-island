import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAL, plastic, toon } from './Materials';
import { LAYOUT } from '../game/Layout';
import { LAGOON_DEPTH, lagoonProfile, type LevelDef, type ThemeDef } from '../game/Levels';
import { PhysicsWorld, FLOOR_GROUPS } from '../physics/PhysicsWorld';
import { mulberry32, randRange } from '../util/math';
import { createWaterMaterial } from './Water';
import { boneGeometry, boneMat, boneDarkMat, skullMesh, spineGeometry } from './Bones';

/** A half-cylinder lying along Z with its round side up (tombstone tops, crypt roofs). */
function archGeometry(radius: number, depth: number): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(radius, radius, depth, 18, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2);
}

interface Pool { x: number; z: number; rx: number; rz: number; depth: number; kind: 'water' | 'lava' | 'goo' | 'ice' }
interface Island { group: THREE.Group; baseY: number; phase: number }

/**
 * Builds one themed floating island (visuals + static colliders) at the
 * level's origin.
 */
export class Diorama {
  readonly root = new THREE.Group();
  private islands: Island[] = [];
  private lava: THREE.MeshStandardMaterial | null = null;
  /** Static geometry collected per material and merged into one mesh each. */
  private batch = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private rng: () => number;
  private theme: ThemeDef;
  private origin: THREE.Vector3;
  /** Factory: set by the game while the belt should move. */
  conveyorRunning = false;
  private beltTex: THREE.CanvasTexture | null = null;
  private sand: THREE.InstancedMesh | null = null;
  private sandSeeds: { x: number; y: number; z: number; s: number }[] = [];
  private sandMat: THREE.MeshBasicMaterial | null = null;

  /** Every pool on this island (island-local). All pools are carved into the slab. */
  private pools(): Pool[] {
    const out: Pool[] = [];
    const L = this.level.lagoon;
    if (L) out.push({ x: L.x, z: L.z, rx: L.rx, rz: L.rz, depth: LAGOON_DEPTH, kind: L.kind ?? 'water' });
    if (this.theme.pond !== 'none') {
      const W = LAYOUT.WATER;
      out.push({ x: W.x, z: W.z, rx: W.rx, rz: W.rz, depth: 0.2, kind: this.theme.pond });
    }
    return out;
  }

  constructor(scene: THREE.Scene, private phys: PhysicsWorld, private level: LevelDef) {
    this.theme = level.theme;
    this.origin = new THREE.Vector3(level.origin.x, 0, level.origin.z);
    this.rng = mulberry32(1234 + level.index * 977);
    this.root.position.copy(this.origin);
    scene.add(this.root);
    this.buildPlatform();
    this.buildFloorColliders();
    this.buildFenceWalls();
    this.buildFence();
    this.buildGrass();
    this.buildGantryFrame();
    this.buildSign();
    for (const pool of this.pools()) this.buildPool(pool);
    if (level.conveyor) this.buildConveyor();
    if (level.wind) this.buildSand();
    this.buildFloatingIslands();
    if (this.theme.decor) this.buildDecor(this.theme.decor);
    this.flush(this.batch, this.root);
  }

  /**
   * Collect every (non-instanced) mesh under `obj` into per-material buckets,
   * transformed by its matrix relative to `obj`'s parent frame.
   */
  private bake(obj: THREE.Object3D, into: Map<THREE.Material, THREE.BufferGeometry[]> = this.batch): void {
    obj.updateMatrixWorld(true);
    obj.traverse((m) => {
      if (!(m instanceof THREE.Mesh) || m instanceof THREE.InstancedMesh) return;
      const mat = m.material as THREE.Material;
      const geo = m.geometry.clone().applyMatrix4(m.matrixWorld);
      if (!geo.attributes.uv) {
        geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
      }
      // Merging needs every geometry indexed (or none); extrusions come unindexed.
      if (!geo.index) geo.setIndex(Array.from({ length: geo.attributes.position.count }, (_, i) => i));
      const list = into.get(mat) ?? [];
      list.push(geo);
      into.set(mat, list);
    });
  }

  /** Merge the buckets into one mesh per material and attach them to `parent`. */
  private flush(buckets: Map<THREE.Material, THREE.BufferGeometry[]>, parent: THREE.Object3D): void {
    for (const [mat, geos] of buckets) {
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
    }
    buckets.clear();
  }

  update(dt: number, t: number, wind = 0): void {
    for (const i of this.islands) {
      i.group.position.y = i.baseY + Math.sin(t * 0.5 + i.phase) * 0.08;
    }
    if (this.lava) this.lava.emissiveIntensity = 1.1 + Math.sin(t * 2.2) * 0.3;
    const C = this.level.conveyor;
    if (this.beltTex && C && this.conveyorRunning) this.beltTex.offset.x -= (C.speed * dt) / 0.4;
    if (this.sand && this.sandMat) {
      const m = new THREE.Matrix4();
      const speed = Math.sign(wind || 1) * (1.2 + Math.abs(wind) * 5);
      this.sandSeeds.forEach((sd, i) => {
        sd.x += speed * sd.s * dt;
        if (sd.x > 5.5) sd.x -= 11;
        if (sd.x < -5.5) sd.x += 11;
        m.makeScale(0.6 + Math.abs(wind) * 1.5, 1, 1).setPosition(sd.x, sd.y + Math.sin(t * 3 + i) * 0.05, sd.z);
        this.sand!.setMatrixAt(i, m);
      });
      this.sand.instanceMatrix.needsUpdate = true;
      this.sandMat.opacity = 0.2 + Math.min(0.55, Math.abs(wind) * 0.6);
    }
  }

  // ------------------------------------------------------------ factory
  /** A raised belt along X that ends over the hatch. Items on it are pushed by the game. */
  private buildConveyor(): void {
    const C = this.level.conveyor!;
    const len = C.x1 - C.x0;
    const cx = (C.x0 + C.x1) / 2;
    const top = 0.28;
    const frame = plastic(0x3a3d42, { roughness: 0.5, metalness: 0.3 });
    const hazard = plastic(0xffc928, { roughness: 0.4 });
    const roller = plastic(0x9aa3ad, { roughness: 0.3, metalness: 0.6 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(len, top - 0.02, C.width), frame);
    base.position.set(cx, (top - 0.02) / 2, C.z);
    this.bake(base);
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.06), hazard);
      rail.position.set(cx, top + 0.1, C.z + s * (C.width / 2 + 0.03));
      this.bake(rail);
      for (let i = 0; i < 4; i++) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.05), frame);
        post.position.set(C.x0 + 0.2 + (i * (len - 0.4)) / 3, top + 0.04, C.z + s * (C.width / 2 + 0.03));
        this.bake(post);
      }
    }
    for (const x of [C.x0, C.x1]) {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, C.width - 0.02, 16), roller);
      r.rotation.x = Math.PI / 2;
      r.position.set(x, top - 0.13, C.z);
      this.bake(r);
    }
    // Moving striped belt surface (texture offset animated in update()).
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 32;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#2b2d33'; ctx.fillRect(0, 0, 64, 32);
    ctx.fillStyle = '#4a4f57';
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(34, 16); ctx.lineTo(10, 32); ctx.lineTo(22, 32); ctx.lineTo(46, 16); ctx.lineTo(22, 0); ctx.fill();
    this.beltTex = new THREE.CanvasTexture(cv);
    this.beltTex.colorSpace = THREE.SRGBColorSpace;
    this.beltTex.wrapS = this.beltTex.wrapT = THREE.RepeatWrapping;
    this.beltTex.repeat.set(len / 0.4, 1);
    const belt = new THREE.Mesh(new THREE.PlaneGeometry(len, C.width - 0.04), new THREE.MeshStandardMaterial({ map: this.beltTex, roughness: 0.8 }));
    belt.rotation.x = -Math.PI / 2;
    belt.position.set(cx, top + 0.003, C.z);
    belt.receiveShadow = true;
    this.root.add(belt);
    // Physics: belt body and side rails.
    this.addBox(cx, top / 2, C.z, len / 2, top / 2, C.width / 2, 0.6);
    for (const s of [-1, 1]) this.addBox(cx, top + 0.1, C.z + s * (C.width / 2 + 0.03), len / 2, 0.06, 0.03, 0.3);
  }

  /** Is a local point on the belt (for grass, spawning)? */
  private onBelt(x: number, z: number, pad = 0): boolean {
    const C = this.level.conveyor;
    return !!C && x > C.x0 - 0.2 - pad && x < C.x1 + pad && Math.abs(z - C.z) < C.width / 2 + 0.15 + pad;
  }

  // -------------------------------------------------------------- desert
  private buildSand(): void {
    const n = 70;
    this.sandMat = new THREE.MeshBasicMaterial({ color: 0xf2d7a0, transparent: true, opacity: 0.4, depthWrite: false });
    this.sand = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 0.012, 0.012), this.sandMat, n);
    for (let i = 0; i < n; i++) {
      this.sandSeeds.push({ x: randRange(this.rng, -5.5, 5.5), y: randRange(this.rng, 0.1, 2.2), z: randRange(this.rng, -3.8, 3.8), s: randRange(this.rng, 0.7, 1.3) });
    }
    this.root.add(this.sand);
  }

  // -------------------------------------------------------------- platform
  private roundedRect(hx: number, hz: number, r: number): THREE.Shape {
    const s = new THREE.Shape();
    s.moveTo(-hx + r, -hz);
    s.lineTo(hx - r, -hz);
    s.quadraticCurveTo(hx, -hz, hx, -hz + r);
    s.lineTo(hx, hz - r);
    s.quadraticCurveTo(hx, hz, hx - r, hz);
    s.lineTo(-hx + r, hz);
    s.quadraticCurveTo(-hx, hz, -hx, hz - r);
    s.lineTo(-hx, -hz + r);
    s.quadraticCurveTo(-hx, -hz, -hx + r, -hz);
    return s;
  }

  private squareHole(cx: number, cz: number, half: number): THREE.Path {
    // Shape Y maps to -Z after the rotation below.
    const p = new THREE.Path();
    const hz = -cz;
    p.moveTo(cx - half, hz - half);
    p.lineTo(cx + half, hz - half);
    p.lineTo(cx + half, hz + half);
    p.lineTo(cx - half, hz + half);
    p.closePath();
    return p;
  }

  private buildPlatform(): void {
    const { SLAB, HOLE } = LAYOUT;
    const T = this.theme;
    const shape = this.roundedRect(SLAB.hx, SLAB.hz, SLAB.corner);
    shape.holes.push(this.squareHole(HOLE.x, HOLE.z, HOLE.half));
    for (const pool of this.pools()) {
      const e = new THREE.Path();
      e.absellipse(pool.x, -pool.z, pool.rx, pool.rz, 0, Math.PI * 2, false, 0);
      shape.holes.push(e);
    }

    const bevel = 0.08;
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: SLAB.depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 10,
    });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, -(SLAB.depth + bevel), 0);
    this.bake(new THREE.Mesh(geo, plastic(T.slab, { roughness: T.pond === 'ice' ? 0.6 : 0.75 })));

    // Dirt layer is extruded from the same outline (with a wider hole) so the pit stays dark.
    const dirtShape = this.roundedRect(SLAB.hx - 0.25, SLAB.hz - 0.25, SLAB.corner);
    dirtShape.holes.push(this.squareHole(HOLE.x, HOLE.z, HOLE.half + 0.15));
    const dirtDepth = 1.1;
    const dirtGeo = new THREE.ExtrudeGeometry(dirtShape, {
      depth: dirtDepth, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 3, curveSegments: 10,
    });
    dirtGeo.rotateX(-Math.PI / 2);
    dirtGeo.translate(0, -(SLAB.depth + 0.05) - dirtDepth, 0);
    this.bake(new THREE.Mesh(dirtGeo, plastic(T.dirt, { roughness: 0.8 })));
    const dirt2 = new THREE.Mesh(new RoundedBoxGeometry(SLAB.hx * 2 - 1.8, 0.9, SLAB.hz * 2 - 1.8, 4, 0.35), plastic(T.dirtDark, { roughness: 0.85 }));
    dirt2.position.y = -2.15;
    this.bake(dirt2);
    const rootMat = plastic(T.dirtDark, { roughness: 0.9 });
    const rootGeo = new THREE.ConeGeometry(0.35, 1.3, 7);
    for (const [x, z, s] of [[-2.2, -1.0, 1], [1.8, 0.8, 0.8], [0.2, -1.8, 0.7], [2.8, -1.2, 0.6]]) {
      const c = new THREE.Mesh(rootGeo, rootMat);
      c.rotation.x = Math.PI;
      c.position.set(x, -2.9, z);
      c.scale.setScalar(s);
      this.bake(c);
    }

    // Dark shaft under the hole
    const shaft = new THREE.Mesh(
      new THREE.BoxGeometry(HOLE.half * 2 - 0.06, 1.6, HOLE.half * 2 - 0.06),
      new THREE.MeshBasicMaterial({ color: PAL.navyDeep, side: THREE.BackSide }),
    );
    shaft.position.set(HOLE.x, -0.8, HOLE.z);
    this.root.add(shaft);
  }

  private addBox(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, friction: number, restitution?: number): void {
    this.phys.addFixedBox(
      { x: this.origin.x + cx, y: cy, z: this.origin.z + cz },
      { x: hx, y: hy, z: hz },
      { groups: FLOOR_GROUPS, friction, restitution },
    );
  }

  private buildFloorColliders(): void {
    if (this.level.lagoon) { this.buildCarvedFloor(); return; }
    const { SLAB, HOLE } = LAYOUT;
    const hy = 0.25;
    const y = -hy;
    const h = HOLE.half;
    const f = this.theme.floorFriction;
    this.addBox((-SLAB.hx + (HOLE.x - h)) / 2, y, 0, (HOLE.x - h + SLAB.hx) / 2, hy, SLAB.hz, f, this.theme.floorRestitution);
    this.addBox((SLAB.hx + (HOLE.x + h)) / 2, y, 0, (SLAB.hx - (HOLE.x + h)) / 2, hy, SLAB.hz, f, this.theme.floorRestitution);
    this.addBox(HOLE.x, y, (SLAB.hz + (HOLE.z + h)) / 2, h, hy, (SLAB.hz - (HOLE.z + h)) / 2, f, this.theme.floorRestitution);
    this.addBox(HOLE.x, y, (-SLAB.hz + (HOLE.z - h)) / 2, h, hy, (HOLE.z - h + SLAB.hz) / 2, f, this.theme.floorRestitution);
  }

  /** Height of the island surface at a local point (0 except inside a lagoon). */
  private surfaceY(x: number, z: number): number {
    const L = this.level.lagoon;
    if (!L) return 0;
    const rn = Math.hypot((x - L.x) / L.rx, (z - L.z) / L.rz);
    return lagoonProfile(rn);
  }

  /** A triangle-mesh floor that follows the carved lagoon; the hatch is left open. */
  private buildCarvedFloor(): void {
    const { SLAB, HOLE } = LAYOUT;
    const step = 0.15;
    const nx = Math.ceil((SLAB.hx * 2) / step);
    const nz = Math.ceil((SLAB.hz * 2) / step);
    const verts = new Float32Array((nx + 1) * (nz + 1) * 3);
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        const x = -SLAB.hx + (i / nx) * SLAB.hx * 2;
        const z = -SLAB.hz + (j / nz) * SLAB.hz * 2;
        const k = (j * (nx + 1) + i) * 3;
        verts[k] = this.origin.x + x;
        verts[k + 1] = this.surfaceY(x, z);
        verts[k + 2] = this.origin.z + z;
      }
    }
    const idx: number[] = [];
    const inHole = (x: number, z: number) => Math.abs(x - HOLE.x) < HOLE.half && Math.abs(z - HOLE.z) < HOLE.half;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const cx = -SLAB.hx + ((i + 0.5) / nx) * SLAB.hx * 2;
        const cz = -SLAB.hz + ((j + 0.5) / nz) * SLAB.hz * 2;
        if (inHole(cx, cz)) continue;
        const a = j * (nx + 1) + i;
        const b = a + 1;
        const c = a + nx + 1;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    this.phys.addFixedTrimesh(verts, new Uint32Array(idx), { groups: FLOOR_GROUPS, friction: this.theme.floorFriction });
    // Keep a solid slab underneath so nothing tunnels through the thin mesh.
    const h = HOLE.half;
    const y = -LAGOON_DEPTH - 0.3;
    this.addBox((-SLAB.hx + (HOLE.x - h)) / 2, y, 0, (HOLE.x - h + SLAB.hx) / 2, 0.25, SLAB.hz, 0.9);
    this.addBox((SLAB.hx + (HOLE.x + h)) / 2, y, 0, (SLAB.hx - (HOLE.x + h)) / 2, 0.25, SLAB.hz, 0.9);
    this.addBox(HOLE.x, y, (SLAB.hz + (HOLE.z + h)) / 2, h, 0.25, (SLAB.hz - (HOLE.z + h)) / 2, 0.9);
    this.addBox(HOLE.x, y, (-SLAB.hz + (HOLE.z - h)) / 2, h, 0.25, (HOLE.z - h + SLAB.hz) / 2, 0.9);
  }

  private buildFenceWalls(): void {
    const { FENCE } = LAYOUT;
    const hy = FENCE.wallHeight / 2;
    const t = 0.08;
    this.addBox(FENCE.hx + t, hy, 0, t, hy, FENCE.hz + 0.2, 0.3);
    this.addBox(-FENCE.hx - t, hy, 0, t, hy, FENCE.hz + 0.2, 0.3);
    this.addBox(0, hy, FENCE.hz + t, FENCE.hx + 0.2, hy, t, 0.3);
    this.addBox(0, hy, -FENCE.hz - t, FENCE.hx + 0.2, hy, t, 0.3);
  }

  // ----------------------------------------------------------------- fence
  private buildFence(): void {
    const { FENCE } = LAYOUT;
    const T = this.theme;
    const style = T.fence ?? 'picket';
    const iron = plastic(0x2a2433, { roughness: 0.35, metalness: 0.5 });
    const woodMat = style === 'iron' ? iron : style === 'bone' ? boneMat() : plastic(T.woodLight, { roughness: 0.7 });
    const postGeo = style === 'bone' ? boneGeometry(0.42, 0.04) : style === 'iron' ? new THREE.CylinderGeometry(0.025, 0.03, 0.52, 6) : new THREE.CylinderGeometry(0.055, 0.07, 0.52, 8);
    const capGeo = style === 'iron' ? new THREE.ConeGeometry(0.05, 0.12, 4) : style === 'bone' ? new THREE.SphereGeometry(0.001, 3, 2) : new THREE.SphereGeometry(0.06, 8, 6);
    const capMat = style === 'iron' ? plastic(T.woodLight, { roughness: 0.35, metalness: 0.4 }) : woodMat;
    const positions: [number, number][] = [];
    const step = 0.76;
    const nx = Math.round((FENCE.hx * 2) / step);
    const nz = Math.round((FENCE.hz * 2) / step);
    for (let i = 0; i <= nx; i++) {
      const x = -FENCE.hx + (i * (FENCE.hx * 2)) / nx;
      positions.push([x, -FENCE.hz], [x, FENCE.hz]);
    }
    for (let j = 1; j < nz; j++) {
      const z = -FENCE.hz + (j * (FENCE.hz * 2)) / nz;
      positions.push([-FENCE.hx, z], [FENCE.hx, z]);
    }
    const posts = new THREE.InstancedMesh(postGeo, woodMat, positions.length);
    const caps = new THREE.InstancedMesh(capGeo, capMat, positions.length);
    const m = new THREE.Matrix4();
    positions.forEach(([x, z], i) => {
      m.makeTranslation(x, 0.26, z);
      posts.setMatrixAt(i, m);
      m.makeTranslation(x, 0.52, z);
      caps.setMatrixAt(i, m);
    });
    posts.castShadow = true;
    posts.receiveShadow = true;
    caps.castShadow = true;
    this.root.add(posts, caps);

    const railMat = style === 'iron' ? iron : style === 'bone' ? boneDarkMat() : plastic(T.wood, { roughness: 0.7 });
    const addRail = (len: number, x: number, y: number, z: number, alongX: boolean) => {
      const r = new THREE.Mesh(new THREE.BoxGeometry(alongX ? len : 0.07, 0.06, alongX ? 0.07 : len), railMat);
      r.position.set(x, y, z);
      this.bake(r);
    };
    for (const y of [0.17, 0.37]) {
      addRail(FENCE.hx * 2, 0, y, -FENCE.hz, true);
      addRail(FENCE.hx * 2, 0, y, FENCE.hz, true);
      addRail(FENCE.hz * 2, -FENCE.hx, y, 0, false);
      addRail(FENCE.hz * 2, FENCE.hx, y, 0, false);
    }
  }

  // ----------------------------------------------------------------- grass
  private inPlayArea(x: number, z: number): boolean {
    const { FENCE } = LAYOUT;
    return Math.abs(x) < FENCE.hx && Math.abs(z) < FENCE.hz;
  }

  private blocked(x: number, z: number): boolean {
    const { HOLE, BUTTON, GANTRY } = LAYOUT;
    const b = this.level.button;
    if (Math.abs(x - HOLE.x) < HOLE.half + 0.2 && Math.abs(z - HOLE.z) < HOLE.half + 0.2) return true;
    if (Math.hypot(x - b.x, z - b.z) < BUTTON.radius + 0.2) return true;
    if (Math.abs(Math.abs(x) - GANTRY.postX) < 0.2 && Math.abs(Math.abs(z) - GANTRY.postZ) < 0.2) return true;
    if (this.onBelt(x, z)) return true;
    for (const pool of this.pools()) {
      const px = (x - pool.x) / (pool.rx + 0.5);
      const pz = (z - pool.z) / (pool.rz + 0.5);
      if (px * px + pz * pz < 1) return true;
    }
    return false;
  }

  private buildGrass(): void {
    const { SLAB } = LAYOUT;
    const T = this.theme;
    const rng = this.rng;
    const tuftGeo = new THREE.CapsuleGeometry(0.055, 0.16, 2, 6);
    const tuftMat = toon(T.tuft);
    const items: { x: number; z: number; s: number; rot: number; tilt: number }[] = [];
    const step = 0.27;
    for (let x = -SLAB.hx + 0.35; x <= SLAB.hx - 0.35; x += step) {
      for (let z = -SLAB.hz + 0.35; z <= SLAB.hz - 0.35; z += step) {
        const jx = x + randRange(rng, -0.1, 0.1);
        const jz = z + randRange(rng, -0.1, 0.1);
        if (this.blocked(jx, jz)) continue;
        const inside = this.inPlayArea(jx, jz);
        if (inside && rng() > T.tuftDensity) continue;
        if (!inside && rng() > T.tuftDensity + 0.4) continue;
        const s = inside ? randRange(rng, 0.55, 0.85) : randRange(rng, 0.9, 1.4);
        items.push({ x: jx, z: jz, s, rot: rng() * Math.PI * 2, tilt: randRange(rng, -0.25, 0.25) });
      }
    }
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const sc = new THREE.Vector3();
    if (items.length > 0) {
      const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, items.length);
      items.forEach((it, i) => {
        e.set(it.tilt, it.rot, it.tilt * 0.6);
        q.setFromEuler(e);
        p.set(it.x, 0.07 * it.s, it.z);
        sc.set(it.s, it.s, it.s);
        m.compose(p, q, sc);
        tufts.setMatrixAt(i, m);
      });
      tufts.receiveShadow = true;
      this.root.add(tufts);
    }

    // Taller dark blades outside the fence
    const bladeGeo = new THREE.ConeGeometry(0.07, 0.34, 5);
    const bladeMat = toon(T.tuftDark);
    const blades: THREE.Matrix4[] = [];
    for (let i = 0; i < 90; i++) {
      const x = randRange(rng, -SLAB.hx + 0.3, SLAB.hx - 0.3);
      const z = randRange(rng, -SLAB.hz + 0.3, SLAB.hz - 0.3);
      if (this.inPlayArea(x, z) || this.blocked(x, z)) continue;
      e.set(randRange(rng, -0.2, 0.2), rng() * 6.28, randRange(rng, -0.2, 0.2));
      q.setFromEuler(e);
      const s = randRange(rng, 0.8, 1.3);
      blades.push(new THREE.Matrix4().compose(p.set(x, 0.17 * s, z), q, sc.set(s, s, s)));
    }
    if (blades.length > 0) {
      const bladeMesh = new THREE.InstancedMesh(bladeGeo, bladeMat, blades.length);
      blades.forEach((bm, i) => bladeMesh.setMatrixAt(i, bm));
      bladeMesh.castShadow = true;
      this.root.add(bladeMesh);
    }

    // Flowers
    const headGeo = new THREE.SphereGeometry(0.05, 8, 6);
    const stemGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.16, 5);
    const stemMat = toon(T.tuftDark);
    const flowerPos: [number, number, number][] = [];
    let guard = 0;
    while (flowerPos.length < 28 && guard++ < 500) {
      const x = randRange(rng, -SLAB.hx + 0.3, SLAB.hx - 0.3);
      const z = randRange(rng, -SLAB.hz + 0.3, SLAB.hz - 0.3);
      if (this.blocked(x, z)) continue;
      if (this.inPlayArea(x, z) && rng() < 0.7) continue;
      flowerPos.push([x, z, T.flowers[Math.floor(rng() * T.flowers.length)]]);
    }
    const stems = new THREE.InstancedMesh(stemGeo, stemMat, flowerPos.length);
    const heads = new THREE.InstancedMesh(headGeo, plastic(0xffffff, { roughness: 0.5 }), flowerPos.length);
    const col = new THREE.Color();
    flowerPos.forEach(([x, z, c], i) => {
      stems.setMatrixAt(i, m.makeTranslation(x, 0.08, z));
      heads.setMatrixAt(i, m.makeTranslation(x, 0.17, z));
      heads.setColorAt(i, col.setHex(c));
    });
    heads.castShadow = true;
    this.root.add(stems, heads);
  }

  /**
   * Rule: every pool is carved. The slab has a hole for it (see buildPlatform),
   * a bowl sits underneath, the surface floats below ground level, and a ring
   * of stone blocks forms a raised rim.
   */
  private buildPool(pool: Pool): void {
    const T = this.theme;
    const R = 14;
    const N = 56;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let k = 0; k <= R; k++) {
      const rn = k / R;
      for (let n = 0; n < N; n++) {
        const a = (n / N) * Math.PI * 2;
        pos.push(pool.x + Math.cos(a) * rn * pool.rx, lagoonProfile(rn, pool.depth) - 0.004, pool.z + Math.sin(a) * rn * pool.rz);
      }
    }
    for (let k = 0; k < R; k++) {
      for (let n = 0; n < N; n++) {
        const a = k * N + n;
        const b = k * N + ((n + 1) % N);
        const c = (k + 1) * N + n;
        const d = (k + 1) * N + ((n + 1) % N);
        idx.push(a, c, b, b, c, d);
      }
    }
    const bowlGeo = new THREE.BufferGeometry();
    bowlGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    bowlGeo.setIndex(idx);
    bowlGeo.computeVertexNormals();
    const glowing = pool.kind === 'lava' || pool.kind === 'goo';
    this.bake(new THREE.Mesh(bowlGeo, plastic(glowing ? T.dirtDark : T.dirt, { roughness: 0.85 })));

    let surface: THREE.Material;
    if (glowing) {
      this.lava = new THREE.MeshStandardMaterial({ color: T.pondColor, emissive: T.pondEmissive ?? T.pondColor, emissiveIntensity: 1.2, roughness: 0.4 });
      surface = this.lava;
    } else if (pool.kind === 'ice') {
      surface = plastic(T.pondColor, { roughness: 0.08, metalness: 0.1 });
    } else {
      const shallow = this.level.lagoon && pool.rx > 0.8 ? 0x4fc3ff : T.pondColor;
      const deep = new THREE.Color(shallow).multiplyScalar(0.55).getHex();
      surface = createWaterMaterial(shallow, deep, 0.9, pool.rx > 0.8 ? 2.0 : 3.2);
    }
    const surfaceY = -pool.depth * 0.38;
    const top = new THREE.Mesh(new THREE.CircleGeometry(1, 56), surface);
    top.rotation.x = -Math.PI / 2;
    top.position.set(pool.x, surfaceY, pool.z);
    top.scale.set(pool.rx * 0.985, pool.rz * 0.985, 1);
    top.receiveShadow = !glowing;
    this.root.add(top);
    if (pool.kind === 'water') {
      const pad = new THREE.Mesh(new THREE.CircleGeometry(Math.min(0.11, pool.rx * 0.2), 12, 0.5, 5.4), toon(T.leaf));
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(pool.x + pool.rx * 0.35, surfaceY + 0.012, pool.z - pool.rz * 0.2);
      this.root.add(pad);
    }
    if (pool.kind === 'lava') {
      const crackMat = new THREE.MeshStandardMaterial({ color: T.pondColor, emissive: T.pondEmissive ?? T.pondColor, emissiveIntensity: 1.0 });
      for (let i = 0; i < 5; i++) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, randRange(this.rng, 0.3, 0.6)), crackMat);
        const a = randRange(this.rng, 0, Math.PI * 2);
        c.position.set(pool.x + Math.cos(a) * (pool.rx * 1.5 + 0.2), 0.01, pool.z + Math.sin(a) * (pool.rz * 1.5 + 0.2));
        c.rotation.y = -a + Math.PI / 2;
        this.bake(c);
      }
    }

    // Raised stone rim: chunky blocks around the edge.
    const light = plastic(glowing ? 0x5a4d4d : T.woodLight, { roughness: 0.8 });
    const dark = plastic(glowing ? 0x3b3238 : T.dirt, { roughness: 0.8 });
    const rn = 1.16;
    const circ = 2 * Math.PI * ((pool.rx + pool.rz) / 2) * rn;
    const count = Math.max(10, Math.round(circ / 0.32));
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const x = pool.x + Math.cos(a) * rn * pool.rx;
      const z = pool.z + Math.sin(a) * rn * pool.rz;
      const len = circ / count;
      const block = new THREE.Mesh(new RoundedBoxGeometry(len * 1.02, 0.14, Math.min(0.26, pool.rx * 0.3), 2, 0.04), i % 2 ? light : dark);
      const tx = -Math.sin(a) * pool.rx;
      const tz = Math.cos(a) * pool.rz;
      block.rotation.y = -Math.atan2(tz, tx);
      block.position.set(x, 0.07, z);
      block.scale.y = 0.9 + ((i * 7) % 3) * 0.08;
      this.bake(block);
    }
    if (pool.kind === 'water') {
      const shell = plastic(0xffe3c4, { roughness: 0.5 });
      for (let i = 0; i < 3; i++) {
        const a = randRange(this.rng, 0, Math.PI * 2);
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), shell);
        m.scale.y = 0.5;
        m.position.set(pool.x + Math.cos(a) * rn * pool.rx, 0.16, pool.z + Math.sin(a) * rn * pool.rz);
        this.bake(m);
      }
    }
  }

  // ---------------------------------------------------------- gantry frame
  private buildGantryFrame(): void {
    if (this.theme.gantry === 'bone') {
      this.buildBoneGantry();
      return;
    }
    const { GANTRY } = LAYOUT;
    const frameMat = plastic(PAL.gantry, { roughness: 0.35 });
    const accentMat = plastic(PAL.gantryAccent, { roughness: 0.35 });
    const postGeo = new THREE.CylinderGeometry(0.07, 0.09, GANTRY.railY, 10);
    const footGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.12, 12);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const post = new THREE.Mesh(postGeo, frameMat);
        post.position.set(sx * GANTRY.postX, GANTRY.railY / 2, sz * GANTRY.postZ);
        this.bake(post);
        const foot = new THREE.Mesh(footGeo, accentMat);
        foot.position.set(sx * GANTRY.postX, 0.06, sz * GANTRY.postZ);
        this.bake(foot);
      }
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, GANTRY.postZ * 2 + 0.2), frameMat);
      rail.position.set(sx * GANTRY.postX, GANTRY.railY, 0);
      this.bake(rail);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.03, GANTRY.postZ * 2 + 0.2), accentMat);
      stripe.position.set(sx * GANTRY.postX, GANTRY.railY + 0.06, 0);
      this.bake(stripe);
    }
  }

  /** Spooky campaign: bone posts topped with little skulls, spine rails. */
  private buildBoneGantry(): void {
    const { GANTRY } = LAYOUT;
    const bone = boneMat();
    const dark = boneDarkMat();
    const postGeo = boneGeometry(GANTRY.railY - 0.1, 0.07);
    const railLen = GANTRY.postZ * 2 + 0.2;
    const railGeo = spineGeometry(railLen, 0.08);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const post = new THREE.Mesh(postGeo, bone);
        post.position.set(sx * GANTRY.postX, GANTRY.railY / 2, sz * GANTRY.postZ);
        this.bake(post);
        const foot = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), dark);
        foot.scale.y = 0.45;
        foot.position.set(sx * GANTRY.postX, 0.04, sz * GANTRY.postZ);
        this.bake(foot);
        // Below the rail so the crossbar can ride past it onto the bridges.
        const skull = skullMesh(0.34);
        skull.position.set(sx * GANTRY.postX, GANTRY.railY - 0.34, sz * GANTRY.postZ + 0.04);
        skull.rotation.y = sx * -0.35;
        this.bake(skull);
      }
      const rail = new THREE.Mesh(railGeo, bone);
      rail.position.set(sx * GANTRY.postX, GANTRY.railY, railLen / 2);
      this.bake(rail);
    }
  }

  // ------------------------------------------------------------------ sign
  private buildSign(): void {
    const T = this.theme;
    const b = this.level.button;
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.7, 8), plastic(T.wood, { roughness: 0.7 }));
    post.position.y = 0.35;
    const board = new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.32, 0.06, 3, 0.04), plastic(T.woodLight, { roughness: 0.7 }));
    board.position.y = 0.72;
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#5a3a1e';
    ctx.font = 'bold 64px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PUSH!', 128, 66);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.26), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    label.position.set(0, 0.72, 0.035);
    g.add(post, board, label);
    post.castShadow = board.castShadow = true;
    const side = b.x >= 0 ? 1 : -1;
    g.position.set(side * (LAYOUT.FENCE.hx + 0.55), 0, b.z - 0.5 * Math.sign(b.z || 1));
    g.rotation.y = side > 0 ? -Math.PI / 2 - 0.2 : Math.PI / 2 + 0.2;
    this.bake(g);
  }

  // -------------------------------------------------------- floating bits
  private makeTree(scale = 1): THREE.Group {
    const T = this.theme;
    const g = new THREE.Group();
    const leafMat = plastic(T.leaf, { roughness: 0.6 });
    const leafLight = plastic(T.leafLight, { roughness: 0.6 });
    const woodMat = plastic(T.wood, { roughness: 0.7 });
    switch (T.tree) {
      case 'blob': {
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 0.9, 8), woodMat);
        trunk.position.y = 0.45;
        trunk.castShadow = true;
        g.add(trunk);
        const blobs: [number, number, number, number, THREE.Material][] = [
          [0, 1.15, 0, 0.6, leafMat], [0.35, 1.4, 0.15, 0.45, leafMat], [-0.35, 1.35, -0.1, 0.42, leafMat],
          [0.05, 1.75, -0.05, 0.4, leafLight], [-0.1, 1.2, 0.4, 0.38, leafLight],
        ];
        for (const [x, y, z, r, mat] of blobs) {
          const b = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), mat);
          b.position.set(x, y, z);
          b.castShadow = true;
          g.add(b);
        }
        break;
      }
      case 'palm': {
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.16, 2.0, 8), woodMat);
        trunk.position.y = 1.0;
        trunk.rotation.z = 0.12;
        trunk.castShadow = true;
        g.add(trunk);
        for (let i = 0; i < 6; i++) {
          const frond = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8), i % 2 ? leafLight : leafMat);
          frond.scale.set(0.35, 0.12, 1);
          const a = (i / 6) * Math.PI * 2;
          frond.position.set(Math.cos(a) * 0.4 + 0.2, 2.0, Math.sin(a) * 0.4);
          frond.rotation.y = -a + Math.PI / 2;
          frond.rotation.x = 0.25;
          frond.castShadow = true;
          g.add(frond);
        }
        const nut = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), plastic(T.dirtDark, { roughness: 0.7 }));
        nut.position.set(0.25, 1.85, 0.05);
        g.add(nut);
        break;
      }
      case 'pine': {
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.8, 8), woodMat);
        trunk.position.y = 0.4;
        trunk.castShadow = true;
        g.add(trunk);
        const tiers: [number, number, number][] = [[0.7, 0.9, 0.8], [0.55, 0.8, 1.35], [0.4, 0.7, 1.85]];
        tiers.forEach(([r, h, y], i) => {
          const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 9), i === 2 ? leafLight : leafMat);
          cone.position.y = y;
          cone.castShadow = true;
          g.add(cone);
          const snow = new THREE.Mesh(new THREE.ConeGeometry(r * 0.72, h * 0.3, 9), plastic(0xf4f7ff, { roughness: 0.7 }));
          snow.position.y = y + h * 0.36;
          g.add(snow);
        });
        break;
      }
      case 'lollipop': {
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 8), plastic(0xffffff, { roughness: 0.5 }));
        stick.position.y = 0.65;
        g.add(stick);
        const head = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.16, 32), plastic(T.woodLight, { roughness: 0.25 }));
        head.rotation.x = Math.PI / 2;
        head.position.y = 1.55;
        g.add(head);
        for (const [r, c] of [[0.36, 0xffffff], [0.24, T.leaf], [0.12, 0xffffff]] as const) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.04, 8, 32), plastic(c, { roughness: 0.3 }));
          ring.position.set(0, 1.55, 0.085);
          g.add(ring);
        }
        break;
      }
      case 'smokestack': {
        const brick = plastic(0x9b4a3a, { roughness: 0.8 });
        const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.8, 14), brick);
        stack.position.y = 0.9;
        g.add(stack);
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.12, 14), plastic(0x3a3d42, { roughness: 0.5 }));
        rim.position.y = 1.85;
        g.add(rim);
        const smoke = plastic(0xb8bec6, { roughness: 1 });
        for (const [x, y, r] of [[0, 2.15, 0.22], [0.15, 2.45, 0.28], [0.35, 2.8, 0.33]]) {
          const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), smoke);
          puff.position.set(x, y, 0);
          g.add(puff);
        }
        break;
      }
      case 'cactus': {
        const green = plastic(0x4fae5a, { roughness: 0.55 });
        const trunk = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.2, 4, 12), green);
        trunk.position.y = 0.8;
        g.add(trunk);
        for (const [s, h] of [[-1, 0.9], [1, 1.2]] as const) {
          const out = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.25, 4, 10), green);
          out.rotation.z = Math.PI / 2;
          out.position.set(s * 0.32, h, 0);
          g.add(out);
          const up = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.35, 4, 10), green);
          up.position.set(s * 0.45, h + 0.25, 0);
          g.add(up);
        }
        const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), plastic(0xff5577, { roughness: 0.4 }));
        bloom.position.y = 1.62;
        g.add(bloom);
        break;
      }
      case 'deadtree': {
        const bark = plastic(T.wood, { roughness: 0.8 });
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.18, 1.5, 7), bark);
        trunk.position.y = 0.75;
        trunk.rotation.z = 0.08;
        g.add(trunk);
        for (const [y, a, l] of [[1.1, 0.9, 0.6], [1.3, -1.0, 0.5], [0.8, -0.6, 0.45], [1.45, 0.4, 0.4]]) {
          const br = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.05, l, 6), bark);
          br.position.set(Math.sin(a) * l * 0.45, y + Math.cos(a) * l * 0.3, 0);
          br.rotation.z = -a;
          g.add(br);
        }
        const stone = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.45, 0.1, 3, 0.05), plastic(0x8a8f99, { roughness: 0.85 }));
        stone.position.set(0.45, 0.22, 0.3);
        stone.rotation.z = 0.12;
        g.add(stone);
        break;
      }
      case 'pylon': {
        const steel = plastic(0x9aa3ad, { roughness: 0.3, metalness: 0.6 });
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 1.7, 10), steel);
        pole.position.y = 0.85;
        g.add(pole);
        for (const y of [0.6, 1.1]) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 8, 24), plastic(T.woodLight, { emissive: T.woodLight, emissiveIntensity: 0.8 }));
          ring.rotation.x = Math.PI / 2;
          ring.position.y = y;
          g.add(ring);
        }
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), plastic(T.leafLight, { emissive: T.leafLight, emissiveIntensity: 1.4 }));
        orb.position.y = 1.85;
        g.add(orb);
        break;
      }
      case 'cloudpuff': {
        const white = plastic(0xffffff, { roughness: 0.8 });
        const pink = plastic(T.leafLight, { roughness: 0.8 });
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.9, 8), plastic(T.wood, { roughness: 0.4, metalness: 0.4 }));
        stem.position.y = 0.45;
        g.add(stem);
        for (const [x, y, z, r, m] of [[0, 1.1, 0, 0.45, white], [0.35, 1.25, 0.1, 0.33, pink], [-0.35, 1.2, -0.05, 0.32, white], [0, 1.45, 0, 0.3, pink]] as const) {
          const b = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), m);
          b.position.set(x, y, z);
          g.add(b);
        }
        break;
      }
      case 'jackolantern': {
        const vine = plastic(T.leaf, { roughness: 0.6 });
        const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.0, 8), vine);
        stalk.position.y = 0.5;
        stalk.rotation.z = 0.1;
        g.add(stalk);
        // A stack of pumpkins: big one at the bottom with a face, small on top.
        for (const [y, r, face] of [[0.32, 0.42, true], [1.0, 0.28, true], [1.42, 0.16, false]] as const) {
          g.add(this.makePumpkin(r, face, y));
        }
        for (const s of [-1, 1]) {
          const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), plastic(T.leafLight, { roughness: 0.6 }));
          leaf.scale.set(1, 0.25, 0.6);
          leaf.position.set(s * 0.22, 1.6, 0);
          leaf.rotation.z = s * 0.5;
          g.add(leaf);
        }
        break;
      }
      case 'tombstone': {
        const stone = plastic(0xa9a3c4, { roughness: 0.85 });
        const dark = plastic(0x6b6488, { roughness: 0.85 });
        const stones: [number, number, number, number, number][] = [[0, 0, 0.5, 0.75, 0.05], [0.55, 0.25, 0.36, 0.5, -0.18], [-0.5, 0.2, 0.32, 0.45, 0.15]];
        for (const [x, z, w, h, tilt] of stones) {
          const slab = new THREE.Mesh(new RoundedBoxGeometry(w, h, 0.12, 3, 0.04), stone);
          slab.position.set(x, h / 2, z);
          slab.rotation.z = tilt;
          g.add(slab);
          const top = new THREE.Mesh(archGeometry(w / 2, 0.12), stone);
          top.position.set(x - Math.sin(tilt) * h / 2, h * Math.cos(tilt), z);
          top.rotation.z = tilt;
          g.add(top);
          const cross = new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, 0.04, 0.02), dark);
          cross.position.set(x - Math.sin(tilt) * h * 0.25, h * 0.7, z + 0.065);
          cross.rotation.z = tilt;
          g.add(cross);
        }
        const bark = plastic(T.wood, { roughness: 0.8 });
        const sapling = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.07, 1.2, 6), bark);
        sapling.position.set(-0.15, 0.6, -0.35);
        g.add(sapling);
        for (const [y, a, l] of [[0.9, 0.9, 0.4], [1.05, -1.0, 0.35]]) {
          const br = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.03, l, 5), bark);
          br.position.set(-0.15 + Math.sin(a) * l * 0.45, y + Math.cos(a) * l * 0.3, -0.35);
          br.rotation.z = -a;
          g.add(br);
        }
        break;
      }
      case 'mushroom': {
        const stem = plastic(0xf6ecd2, { roughness: 0.6 });
        const caps: [number, number, number, number, number][] = [[0, 0, 1.1, 0.55, T.leaf], [0.5, 0.2, 0.6, 0.32, T.woodLight], [-0.45, 0.15, 0.45, 0.26, T.leafLight]];
        for (const [x, z, h, r, c] of caps) {
          const st = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.3, r * 0.4, h, 10), stem);
          st.position.set(x, h / 2, z);
          g.add(st);
          const cap = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), plastic(c, { roughness: 0.4, emissive: c, emissiveIntensity: 0.35 }));
          cap.position.set(x, h - 0.02, z);
          cap.scale.y = 0.75;
          g.add(cap);
          for (let i = 0; i < 4; i++) {
            const a = i * 1.7 + x * 3;
            const dot = new THREE.Mesh(new THREE.SphereGeometry(r * 0.14, 8, 6), plastic(0xffffff, { roughness: 0.5 }));
            dot.position.set(x + Math.cos(a) * r * 0.6, h - 0.02 + r * 0.45, z + Math.sin(a) * r * 0.6);
            dot.scale.y = 0.5;
            g.add(dot);
          }
        }
        break;
      }
      case 'obelisk': {
        const stone = plastic(T.woodLight, { roughness: 0.85, flat: true });
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 1.6, 4), stone);
        shaft.position.y = 0.8;
        shaft.rotation.y = Math.PI / 4;
        g.add(shaft);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.3, 4), plastic(0xffc928, { metalness: 0.6, roughness: 0.25 }));
        tip.position.y = 1.75;
        tip.rotation.y = Math.PI / 4;
        g.add(tip);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshStandardMaterial({ color: 0x8ff0c0, emissive: 0x3fbf8a, emissiveIntensity: 1.4 }));
        eye.position.set(0, 1.2, 0.13);
        eye.scale.set(1.3, 0.7, 0.4);
        g.add(eye);
        const wrap = plastic(0xf2e6c9, { roughness: 0.8 });
        for (const y of [0.35, 0.6]) {
          const band = new THREE.Mesh(new THREE.TorusGeometry(0.25 - y * 0.06, 0.03, 6, 4), wrap);
          band.rotation.set(Math.PI / 2, 0, Math.PI / 4);
          band.position.y = y;
          g.add(band);
        }
        break;
      }
      case 'spire': {
        const rockMat = plastic(T.dirtDark, { roughness: 0.9, flat: true });
        const spires: [number, number, number, number][] = [[0, 0.45, 1.9, 0], [0.45, 0.3, 1.1, 0.2], [-0.4, 0.25, 0.9, -0.15]];
        for (const [x, r, h, z] of spires) {
          const s = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), rockMat);
          s.position.set(x, h / 2, z);
          s.castShadow = true;
          g.add(s);
        }
        const glow = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshStandardMaterial({ color: 0xff8c1a, emissive: 0xff4a00, emissiveIntensity: 1.3 }));
        glow.position.set(0, 1.95, 0);
        g.add(glow);
        break;
      }
    }
    g.scale.setScalar(scale);
    return g;
  }

  /** A small building that tells you where you are. */
  private makeLandmark(kind: NonNullable<ThemeDef['landmark']>): THREE.Group {
    const g = new THREE.Group();
    const T = this.theme;
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.y = ry;
      m.castShadow = true;
      g.add(m);
      return m;
    };
    const windowGlow = (hex: number) => new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: 1.2 });
    switch (kind) {
      case 'house':
      case 'gingerbread': {
        const ginger = kind === 'gingerbread';
        const wall = plastic(ginger ? 0xa0633c : 0x4a3a55, { roughness: 0.8 });
        const roof = plastic(ginger ? 0xffffff : 0x2a2230, { roughness: 0.6 });
        add(new THREE.BoxGeometry(1.1, 0.8, 0.9), wall, 0, 0.4, 0, 0.3);
        const r = add(new THREE.ConeGeometry(0.88, 0.7, 4), roof, 0, 1.15, 0, Math.PI / 4 + 0.3);
        r.scale.z = 0.85;
        add(new THREE.BoxGeometry(0.5, 0.55, 0.45), wall, 0.25, 1.05, -0.1, 0.3);
        add(new THREE.ConeGeometry(0.4, 0.5, 4), roof, 0.25, 1.55, -0.1, Math.PI / 4 + 0.3);
        const win = ginger ? plastic(0xff8fc7, { roughness: 0.3 }) : windowGlow(0xffb12b);
        for (const [x, y] of [[-0.25, 0.5], [0.22, 0.5], [0.25, 1.08]]) add(new THREE.BoxGeometry(0.18, 0.2, 0.02), win, x, y, 0.47, 0.3);
        add(new THREE.BoxGeometry(0.22, 0.36, 0.02), plastic(ginger ? 0xff5a7a : 0x241d1a), -0.02, 0.18, 0.46, 0.3);
        if (ginger) for (let i = 0; i < 6; i++) add(new THREE.SphereGeometry(0.06, 10, 8), plastic([0xff5a7a, 0x7fe3ff, 0xffe066][i % 3], { roughness: 0.3 }), -0.5 + i * 0.2, 0.82, 0.46, 0.3);
        break;
      }
      case 'factory': {
        const wall = plastic(0x7a8088, { roughness: 0.6, metalness: 0.2 });
        add(new THREE.BoxGeometry(1.4, 0.7, 0.9), wall, 0, 0.35, 0);
        for (let i = 0; i < 3; i++) {
          const saw = add(new THREE.CylinderGeometry(0.01, 0.32, 0.4, 3), plastic(0x5a5f66, { roughness: 0.6 }), -0.46 + i * 0.46, 0.88, 0);
          saw.rotation.z = Math.PI / 2;
          saw.rotation.y = Math.PI / 2;
        }
        add(new THREE.CylinderGeometry(0.12, 0.16, 1.4, 12), plastic(0x9b4a3a, { roughness: 0.8 }), 0.5, 1.0, -0.25);
        for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.2, 0.15, 0.02), windowGlow(0xffd23f), -0.5 + i * 0.33, 0.4, 0.46);
        break;
      }
      case 'pyramid': {
        const stone = plastic(T.woodLight, { roughness: 0.85, flat: true });
        add(new THREE.ConeGeometry(1.0, 1.2, 4), stone, 0, 0.6, 0, Math.PI / 4);
        add(new THREE.ConeGeometry(0.16, 0.2, 4), plastic(0xffc928, { metalness: 0.6, roughness: 0.25 }), 0, 1.15, 0, Math.PI / 4);
        add(new THREE.BoxGeometry(0.22, 0.3, 0.05), plastic(0x3a2a24), 0, 0.15, 0.7);
        break;
      }
      case 'tower': {
        const steel = plastic(0xd8e0ea, { roughness: 0.25, metalness: 0.5 });
        add(new THREE.CylinderGeometry(0.25, 0.45, 1.6, 16), steel, 0, 0.8, 0);
        const dome = add(new THREE.SphereGeometry(0.45, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), plastic(T.woodLight, { roughness: 0.1, transparent: true, opacity: 0.6, emissive: T.woodLight, emissiveIntensity: 0.4 }), 0, 1.6, 0);
        dome.castShadow = false;
        for (let i = 0; i < 3; i++) {
          const ring = add(new THREE.TorusGeometry(0.42 - i * 0.06, 0.025, 8, 28), windowGlow(T.leafLight), 0, 0.4 + i * 0.4, 0);
          ring.rotation.x = Math.PI / 2;
        }
        break;
      }
      case 'scarecrow': {
        const wood = plastic(0x7a5230, { roughness: 0.8 });
        add(new THREE.CylinderGeometry(0.05, 0.06, 1.5, 8), wood, 0, 0.75, 0);
        const arm = add(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 8), wood, 0, 1.05, 0);
        arm.rotation.z = Math.PI / 2;
        add(new THREE.CylinderGeometry(0.2, 0.28, 0.5, 10), plastic(0x8a6bbf, { roughness: 0.7 }), 0, 1.0, 0);
        for (const s of [-1, 1]) add(new THREE.ConeGeometry(0.06, 0.16, 6), plastic(0xffd23f, { roughness: 0.8 }), s * 0.58, 1.0, 0).rotation.z = s * Math.PI / 2;
        const head = this.makePumpkin(0.24, true, 1.48);
        g.add(head);
        add(new THREE.ConeGeometry(0.32, 0.36, 12), plastic(0x2a2230, { roughness: 0.7 }), 0, 1.86, 0);
        add(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 16), plastic(0x2a2230, { roughness: 0.7 }), 0, 1.7, 0);
        for (let i = 0; i < 5; i++) g.add(this.makePumpkin(0.12 + (i % 2) * 0.05, i % 2 === 0, 0.1, -0.7 + i * 0.35, 0.6 - (i % 3) * 0.15));
        break;
      }
      case 'chapel': {
        const wall = plastic(0x6b6488, { roughness: 0.8 });
        const roof = plastic(0x2a2230, { roughness: 0.6 });
        add(new THREE.BoxGeometry(0.8, 0.8, 1.1), wall, 0, 0.4, 0);
        const r = add(new THREE.ConeGeometry(0.75, 0.55, 4), roof, 0, 1.07, 0, Math.PI / 4);
        r.scale.z = 1.35;
        add(new THREE.BoxGeometry(0.34, 0.9, 0.34), wall, 0, 0.95, 0.5);
        add(new THREE.ConeGeometry(0.3, 0.6, 4), roof, 0, 1.7, 0.5, Math.PI / 4);
        add(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 16), windowGlow(0xb48cff), 0, 1.15, 0.68).rotation.x = Math.PI / 2;
        add(new THREE.BoxGeometry(0.24, 0.4, 0.02), plastic(0x241d1a), 0, 0.2, 0.56);
        for (const z of [-0.25, 0.15]) for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.02, 0.24, 0.12), windowGlow(0xffb12b), s * 0.41, 0.48, z);
        break;
      }
      case 'crypt': {
        const stone = plastic(0xb8c0e0, { roughness: 0.75 });
        const dark = plastic(0x3c3c5e, { roughness: 0.8 });
        add(new THREE.BoxGeometry(1.2, 0.7, 0.9), stone, 0, 0.35, 0);
        add(archGeometry(0.6, 0.9), stone, 0, 0.7, 0);
        add(new THREE.BoxGeometry(0.42, 0.5, 0.04), dark, 0, 0.25, 0.46);
        add(new THREE.SphereGeometry(0.05, 8, 6), windowGlow(0x9fe0ff), 0, 0.62, 0.47);
        for (const s of [-1, 1]) {
          add(new THREE.CylinderGeometry(0.07, 0.08, 0.75, 10), stone, s * 0.48, 0.37, 0.5);
          add(new THREE.ConeGeometry(0.1, 0.16, 4), plastic(0xeaf2ff, { roughness: 0.3 }), s * 0.48, 0.82, 0.5);
        }
        for (let i = 0; i < 5; i++) add(new THREE.ConeGeometry(0.03, 0.14, 5), plastic(0xd9f2ff, { roughness: 0.1, transparent: true, opacity: 0.8 }), -0.4 + i * 0.2, 0.64, 0.46).rotation.x = Math.PI;
        break;
      }
      case 'cauldron': {
        const iron = plastic(0x2a2433, { roughness: 0.4, metalness: 0.3 });
        const pot = add(new THREE.SphereGeometry(0.62, 22, 16, 0, Math.PI * 2, Math.PI * 0.25, Math.PI * 0.75), iron, 0, 0.6, 0);
        pot.castShadow = true;
        add(new THREE.TorusGeometry(0.46, 0.08, 10, 28), iron, 0, 1.03, 0).rotation.x = Math.PI / 2;
        add(new THREE.CircleGeometry(0.44, 24), windowGlow(0x8ff0c0), 0, 1.0, 0).rotation.x = -Math.PI / 2;
        const bubbleMat = windowGlow(0xd9fff0);
        for (const [x, y, z, r] of [[0.1, 1.08, 0.1, 0.08], [-0.15, 1.12, -0.05, 0.1], [0.05, 1.3, -0.1, 0.06], [-0.05, 1.5, 0.05, 0.05]]) add(new THREE.SphereGeometry(r, 10, 8), bubbleMat, x, y, z);
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2;
          add(new THREE.CylinderGeometry(0.06, 0.05, 0.2, 8), iron, Math.cos(a) * 0.38, 0.08, Math.sin(a) * 0.38);
        }
        const fire = windowGlow(0xff9a3c);
        for (let i = 0; i < 4; i++) add(new THREE.ConeGeometry(0.09, 0.22, 6), fire, -0.2 + i * 0.13, 0.11, 0.3 - (i % 2) * 0.1);
        break;
      }
      case 'vampcastle': {
        const stone = plastic(0x4a3a5a, { roughness: 0.7 });
        const roof = plastic(0x7a2e45, { roughness: 0.5 });
        add(new THREE.BoxGeometry(1.0, 0.6, 0.7), stone, 0, 0.3, 0);
        for (const x of [-0.5, 0.5]) {
          add(new THREE.CylinderGeometry(0.2, 0.22, 1.1, 14), stone, x, 0.55, 0);
          add(new THREE.ConeGeometry(0.26, 0.55, 14), roof, x, 1.37, 0);
        }
        add(new THREE.CylinderGeometry(0.24, 0.26, 1.5, 14), stone, 0, 0.75, -0.15);
        add(new THREE.ConeGeometry(0.3, 0.7, 14), roof, 0, 1.85, -0.15);
        add(new THREE.BoxGeometry(0.24, 0.32, 0.02), plastic(0x1e1824), 0, 0.16, 0.36);
        for (const [x, y] of [[-0.5, 0.75], [0.5, 0.75], [0, 1.1]]) add(new THREE.BoxGeometry(0.1, 0.16, 0.02), windowGlow(0xd9304f), x, y, x === 0 ? 0.1 : 0.21);
        break;
      }
      case 'witchhut': {
        const wood = plastic(0x6b4a7a, { roughness: 0.75 });
        const roof = plastic(0x2a2230, { roughness: 0.6 });
        const hut = add(new THREE.CylinderGeometry(0.42, 0.5, 0.8, 8), wood, 0, 0.4, 0);
        hut.rotation.z = 0.06;
        const hat = add(new THREE.ConeGeometry(0.62, 1.1, 10), roof, 0.05, 1.32, 0);
        hat.rotation.z = -0.18;
        add(new THREE.CylinderGeometry(0.8, 0.8, 0.04, 20), roof, 0, 0.82, 0);
        add(new THREE.TorusGeometry(0.5, 0.04, 6, 20), plastic(0xff9a3c, { roughness: 0.5 }), 0, 0.92, 0).rotation.x = Math.PI / 2;
        add(new THREE.BoxGeometry(0.2, 0.32, 0.02), plastic(0x241d1a), 0, 0.16, 0.48);
        add(new THREE.SphereGeometry(0.08, 10, 8), windowGlow(0xffd23f), 0.25, 0.5, 0.4);
        const broom = add(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 6), plastic(0x9b6a3c), 0.6, 0.45, 0.2);
        broom.rotation.z = 0.35;
        add(new THREE.ConeGeometry(0.1, 0.25, 8), plastic(0xffd23f, { roughness: 0.8 }), 0.74, 0.08, 0.2);
        break;
      }
      case 'castle': {
        const stone = plastic(0xf6f8ff, { roughness: 0.6 });
        const gold = plastic(T.wood, { roughness: 0.3, metalness: 0.5 });
        add(new THREE.BoxGeometry(1.0, 0.6, 0.7), stone, 0, 0.3, 0);
        for (const x of [-0.5, 0.5]) {
          add(new THREE.CylinderGeometry(0.2, 0.22, 1.1, 14), stone, x, 0.55, 0);
          add(new THREE.ConeGeometry(0.26, 0.45, 14), plastic(0xff9fcf, { roughness: 0.4 }), x, 1.32, 0);
          add(new THREE.SphereGeometry(0.05, 8, 6), gold, x, 1.58, 0);
        }
        add(new THREE.CylinderGeometry(0.24, 0.26, 1.4, 14), stone, 0, 0.7, -0.15);
        add(new THREE.ConeGeometry(0.3, 0.55, 14), plastic(0xff9fcf, { roughness: 0.4 }), 0, 1.68, -0.15);
        add(new THREE.BoxGeometry(0.24, 0.32, 0.02), gold, 0, 0.16, 0.36);
        break;
      }
    }
    return g;
  }

  /** A kawaii jack-o'-lantern (glowing face optional), sitting on `y`. */
  private makePumpkin(r: number, face: boolean, y: number, x = 0, z = 0): THREE.Group {
    const g = new THREE.Group();
    const orange = plastic(0xff9a3c, { roughness: 0.45 });
    for (let i = 0; i < 5; i++) {
      const lobe = new THREE.Mesh(new THREE.SphereGeometry(r * 0.62, 14, 10), orange);
      const a = (i / 5) * Math.PI * 2;
      lobe.position.set(Math.cos(a) * r * 0.42, 0, Math.sin(a) * r * 0.42);
      lobe.scale.y = 1.1;
      g.add(lobe);
    }
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.08, r * 0.12, r * 0.4, 6), plastic(0x4fae5a, { roughness: 0.6 }));
    stem.position.y = r * 0.75;
    stem.rotation.z = 0.25;
    g.add(stem);
    if (face) {
      const lit = new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffb12b, emissiveIntensity: 1.3 });
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.ConeGeometry(r * 0.16, r * 0.22, 3), lit);
        eye.position.set(s * r * 0.3, r * 0.15, r * 0.94);
        eye.rotation.x = Math.PI / 2;
        g.add(eye);
      }
      const mouth = new THREE.Mesh(new THREE.TorusGeometry(r * 0.25, r * 0.06, 6, 12, Math.PI), lit);
      mouth.position.set(0, -r * 0.12, r * 0.95);
      mouth.rotation.z = Math.PI;
      g.add(mouth);
    }
    g.position.set(x, y, z);
    return g;
  }

  /** Small themed props on the slab rim outside the fence. */
  private buildDecor(kind: NonNullable<ThemeDef['decor']>): void {
    const { SLAB, FENCE } = LAYOUT;
    const rng = mulberry32(777 + this.level.index * 31);
    const spots: [number, number][] = [];
    const rimX = (FENCE.hx + SLAB.hx) / 2 + 0.05;
    const rimZ = (FENCE.hz + SLAB.hz) / 2 + 0.05;
    for (let i = 0; i < 9; i++) spots.push([-SLAB.hx + 1.2 + i * ((SLAB.hx * 2 - 2.4) / 8), rimZ]);
    for (let i = 0; i < 6; i++) {
      const z = -FENCE.hz + 0.3 + i * ((FENCE.hz * 2 - 0.6) / 5);
      spots.push([-rimX, z], [rimX, z]);
    }
    const b = this.level.button;
    const signX = (b.x >= 0 ? 1 : -1) * (FENCE.hx + 0.55);
    const ok = (x: number, z: number) => {
      if (Math.hypot(x - signX, z - b.z) < 0.9) return false;
      if (Math.abs(Math.abs(x) - LAYOUT.GANTRY.postX) < 0.35 && Math.abs(Math.abs(z) - LAYOUT.GANTRY.postZ) < 0.35) return false;
      for (const p of this.pools()) if (Math.hypot((x - p.x) / (p.rx + 0.45), (z - p.z) / (p.rz + 0.45)) < 1) return false;
      return true;
    };
    for (const [x0, z0] of spots) {
      if (rng() < 0.35) continue;
      const x = x0 + (rng() - 0.5) * 0.25;
      const z = z0 + (rng() - 0.5) * 0.15;
      if (!ok(x, z)) continue;
      const prop = this.makeDecor(kind, rng);
      prop.position.set(x, 0, z);
      prop.rotation.y = (rng() - 0.5) * 0.8;
      this.bake(prop);
    }
  }

  private makeDecor(kind: NonNullable<ThemeDef['decor']>, rng: () => number): THREE.Group {
    const g = new THREE.Group();
    switch (kind) {
      case 'pumpkins':
        g.add(this.makePumpkin(0.12 + rng() * 0.06, rng() < 0.5, 0.1));
        break;
      case 'tombstones': {
        const h = 0.22 + rng() * 0.12;
        const stone = plastic(0xa9a3c4, { roughness: 0.85 });
        const slab = new THREE.Mesh(new RoundedBoxGeometry(0.2, h, 0.06, 2, 0.02), stone);
        slab.position.y = h / 2;
        slab.rotation.z = (rng() - 0.5) * 0.3;
        const top = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), stone);
        top.scale.z = 0.3;
        top.position.y = h;
        g.add(slab, top);
        break;
      }
      case 'candles': {
        const n = 1 + Math.floor(rng() * 3);
        for (let i = 0; i < n; i++) {
          const h = 0.1 + rng() * 0.12;
          const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, h, 8), plastic(0xf6ecd2, { roughness: 0.5 }));
          const x = (i - (n - 1) / 2) * 0.08;
          wax.position.set(x, h / 2, (i % 2) * 0.05);
          const flame = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.05, 6), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffb12b, emissiveIntensity: 2 }));
          flame.position.set(x, h + 0.03, (i % 2) * 0.05);
          g.add(wax, flame);
        }
        break;
      }
      case 'mushrooms': {
        const c = [0xb48cff, 0x8ff0c0, 0xff9fcf][Math.floor(rng() * 3)];
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.12, 8), plastic(0xf6ecd2, { roughness: 0.6 }));
        stem.position.y = 0.06;
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), plastic(c, { roughness: 0.4, emissive: c, emissiveIntensity: 0.5 }));
        cap.position.y = 0.11;
        cap.scale.y = 0.7;
        g.add(stem, cap);
        break;
      }
      case 'bones': {
        const bone = new THREE.Mesh(boneGeometry(0.22, 0.025), boneMat());
        bone.rotation.z = Math.PI / 2;
        bone.position.y = 0.045;
        g.add(bone);
        if (rng() < 0.4) {
          const sk = skullMesh(0.16);
          sk.position.set(0.1, 0.08, 0.05);
          g.add(sk);
        }
        break;
      }
    }
    return g;
  }

  private makeIsland(radius: number): THREE.Group {
    const T = this.theme;
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.92, 0.3, 24), plastic(T.slab, { roughness: 0.75 }));
    top.position.y = -0.15;
    top.receiveShadow = true;
    top.castShadow = true;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.9, radius * 0.55, 0.7, 24), plastic(T.dirt, { roughness: 0.8 }));
    body.position.y = -0.65;
    body.castShadow = true;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.55, 0.6, 24), plastic(T.dirtDark, { roughness: 0.85 }));
    tip.rotation.x = Math.PI;
    tip.position.y = -1.3;
    g.add(top, body, tip);
    return g;
  }

  private buildFloatingIslands(): void {
    const lm = this.theme.landmark;
    const defs: { x: number; y: number; z: number; r: number; tree: number; phase: number }[] = [
      { x: lm ? -6.3 : -6.0, y: -0.5, z: -1.6, r: lm ? 1.4 : 1.1, tree: 1.0, phase: 0 },
      { x: 6.1, y: -0.2, z: -2.4, r: 1.0, tree: 0.85, phase: 2 },
      { x: 5.9, y: -1.1, z: 1.6, r: 0.7, tree: 0.55, phase: 4 },
      { x: -5.6, y: -1.4, z: 1.8, r: 0.6, tree: 0, phase: 1 },
    ];
    defs.forEach((d, i) => {
      const g = this.makeIsland(d.r);
      if (i === 0 && lm) g.add(this.makeLandmark(lm));
      else if (d.tree > 0) g.add(this.makeTree(d.tree));
      else {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), plastic(PAL.stone, { roughness: 0.8, flat: true }));
        rock.position.y = 0.2;
        rock.castShadow = true;
        g.add(rock);
      }
      const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
      this.bake(g, buckets);
      const merged = new THREE.Group();
      this.flush(buckets, merged);
      merged.position.set(d.x, d.y, d.z);
      this.root.add(merged);
      this.islands.push({ group: merged, baseY: d.y, phase: d.phase });
    });
    const { SLAB } = LAYOUT;
    const t1 = this.makeTree(0.8);
    t1.position.set(-SLAB.hx + 0.6, 0, -SLAB.hz + 0.55);
    const t2 = this.makeTree(0.7);
    t2.position.set(SLAB.hx - 0.55, 0, -SLAB.hz + 0.6);
    this.bake(t1);
    this.bake(t2);
  }
}
