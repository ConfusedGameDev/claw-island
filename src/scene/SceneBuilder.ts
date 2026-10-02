import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAL, plastic, toon } from './Materials';
import { LAYOUT } from '../game/Layout';
import { LAGOON_DEPTH, lagoonProfile, type LevelDef, type ThemeDef } from '../game/Levels';
import { PhysicsWorld, FLOOR_GROUPS } from '../physics/PhysicsWorld';
import { mulberry32, randRange } from '../util/math';
import { createWaterMaterial } from './Water';

interface Pool { x: number; z: number; rx: number; rz: number; depth: number; kind: 'water' | 'lava' | 'ice' }
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

  /** Every pool on this island (island-local). All pools are carved into the slab. */
  private pools(): Pool[] {
    const out: Pool[] = [];
    const L = this.level.lagoon;
    if (L) out.push({ ...L, depth: LAGOON_DEPTH, kind: 'water' });
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
    this.buildFloatingIslands();
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

  update(dt: number, t: number): void {
    void dt;
    for (const i of this.islands) {
      i.group.position.y = i.baseY + Math.sin(t * 0.5 + i.phase) * 0.08;
    }
    if (this.lava) this.lava.emissiveIntensity = 1.1 + Math.sin(t * 2.2) * 0.3;
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

  private addBox(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, friction: number): void {
    this.phys.addFixedBox(
      { x: this.origin.x + cx, y: cy, z: this.origin.z + cz },
      { x: hx, y: hy, z: hz },
      { groups: FLOOR_GROUPS, friction },
    );
  }

  private buildFloorColliders(): void {
    if (this.level.lagoon) { this.buildCarvedFloor(); return; }
    const { SLAB, HOLE } = LAYOUT;
    const hy = 0.25;
    const y = -hy;
    const h = HOLE.half;
    const f = this.theme.floorFriction;
    this.addBox((-SLAB.hx + (HOLE.x - h)) / 2, y, 0, (HOLE.x - h + SLAB.hx) / 2, hy, SLAB.hz, f);
    this.addBox((SLAB.hx + (HOLE.x + h)) / 2, y, 0, (SLAB.hx - (HOLE.x + h)) / 2, hy, SLAB.hz, f);
    this.addBox(HOLE.x, y, (SLAB.hz + (HOLE.z + h)) / 2, h, hy, (SLAB.hz - (HOLE.z + h)) / 2, f);
    this.addBox(HOLE.x, y, (-SLAB.hz + (HOLE.z - h)) / 2, h, hy, (HOLE.z - h + SLAB.hz) / 2, f);
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
    const woodMat = plastic(T.woodLight, { roughness: 0.7 });
    const postGeo = new THREE.CylinderGeometry(0.055, 0.07, 0.52, 8);
    const capGeo = new THREE.SphereGeometry(0.06, 8, 6);
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
    const caps = new THREE.InstancedMesh(capGeo, woodMat, positions.length);
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

    const railMat = plastic(T.wood, { roughness: 0.7 });
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
    this.bake(new THREE.Mesh(bowlGeo, plastic(pool.kind === 'lava' ? T.dirtDark : T.dirt, { roughness: 0.85 })));

    let surface: THREE.Material;
    if (pool.kind === 'lava') {
      this.lava = new THREE.MeshStandardMaterial({ color: T.pondColor, emissive: T.pondEmissive ?? T.pondColor, emissiveIntensity: 1.2, roughness: 0.4 });
      surface = this.lava;
    } else if (pool.kind === 'ice') {
      surface = plastic(T.pondColor, { roughness: 0.08, metalness: 0.1 });
    } else {
      surface = createWaterMaterial(0x4fc3ff, 0x1f7fe8, 0.9, pool.rx > 0.8 ? 2.0 : 3.2);
    }
    const surfaceY = -pool.depth * 0.38;
    const top = new THREE.Mesh(new THREE.CircleGeometry(1, 56), surface);
    top.rotation.x = -Math.PI / 2;
    top.position.set(pool.x, surfaceY, pool.z);
    top.scale.set(pool.rx * 0.985, pool.rz * 0.985, 1);
    top.receiveShadow = pool.kind !== 'lava';
    this.root.add(top);
    if (pool.kind === 'water') {
      const pad = new THREE.Mesh(new THREE.CircleGeometry(Math.min(0.11, pool.rx * 0.2), 12, 0.5, 5.4), toon(T.leaf));
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(pool.x + pool.rx * 0.35, surfaceY + 0.012, pool.z - pool.rz * 0.2);
      this.root.add(pad);
    }
    if (pool.kind === 'lava') {
      const crackMat = new THREE.MeshStandardMaterial({ color: 0xff8c1a, emissive: 0xff4a00, emissiveIntensity: 1.0 });
      for (let i = 0; i < 5; i++) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, randRange(this.rng, 0.3, 0.6)), crackMat);
        const a = randRange(this.rng, 0, Math.PI * 2);
        c.position.set(pool.x + Math.cos(a) * (pool.rx * 1.5 + 0.2), 0.01, pool.z + Math.sin(a) * (pool.rz * 1.5 + 0.2));
        c.rotation.y = -a + Math.PI / 2;
        this.bake(c);
      }
    }

    // Raised stone rim: chunky blocks around the edge.
    const light = plastic(pool.kind === 'lava' ? 0x5a4d4d : T.woodLight, { roughness: 0.8 });
    const dark = plastic(pool.kind === 'lava' ? 0x3b3238 : T.dirt, { roughness: 0.8 });
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
    const defs: { x: number; y: number; z: number; r: number; tree: number; phase: number }[] = [
      { x: -6.0, y: -0.5, z: -1.6, r: 1.1, tree: 1.0, phase: 0 },
      { x: 6.1, y: -0.2, z: -2.4, r: 1.0, tree: 0.85, phase: 2 },
      { x: 5.9, y: -1.1, z: 1.6, r: 0.7, tree: 0.55, phase: 4 },
      { x: -5.6, y: -1.4, z: 1.8, r: 0.6, tree: 0, phase: 1 },
    ];
    for (const d of defs) {
      const g = this.makeIsland(d.r);
      if (d.tree > 0) g.add(this.makeTree(d.tree));
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
    }
    const { SLAB } = LAYOUT;
    const t1 = this.makeTree(0.8);
    t1.position.set(-SLAB.hx + 0.6, 0, -SLAB.hz + 0.55);
    const t2 = this.makeTree(0.7);
    t2.position.set(SLAB.hx - 0.55, 0, -SLAB.hz + 0.6);
    this.bake(t1);
    this.bake(t2);
  }
}
