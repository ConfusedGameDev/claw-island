import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { PAL, plastic } from '../scene/Materials';
import { PhysicsWorld, OBJECT_GROUPS, HELD_GROUPS } from '../physics/PhysicsWorld';
import type { Grabbable, GrabDef } from './Grabbable';

export type Kind = 'rupee' | 'heart' | 'shell' | 'acorn' | 'mushroom' | 'star' | 'rock' | 'bomb' | 'weight';

/** The pool the three run targets are drawn from. */
export const COLLECTIBLE_KINDS: Kind[] = ['rupee', 'heart', 'shell', 'acorn', 'mushroom', 'star', 'rock', 'bomb'];

export interface KindDef extends GrabDef {
  name: string;
  mass: number;
  /** Bounciness override (default 0.25). */
  restitution?: number;
  buildMesh(): THREE.Group;
  collider(): RAPIER.ColliderDesc;
}

export interface BodyUserData {
  collectible: Collectible;
  grabbable: Grabbable;
}

// ------------------------------------------------------------------ shapes
function heartShape(size: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, -0.5);
  s.bezierCurveTo(-0.3, -0.25, -0.62, 0.0, -0.5, 0.27);
  s.bezierCurveTo(-0.4, 0.58, -0.05, 0.52, 0, 0.2);
  s.bezierCurveTo(0.05, 0.52, 0.4, 0.58, 0.5, 0.27);
  s.bezierCurveTo(0.62, 0.0, 0.3, -0.25, 0, -0.5);
  const pts = s.getPoints(24).map((p) => p.multiplyScalar(size));
  const out = new THREE.Shape();
  out.setFromPoints(pts);
  return out;
}

function starShape(outer: number, inner: number): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

function shadowed(m: THREE.Mesh): THREE.Mesh {
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function weightLabel(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffd23f';
  ctx.font = 'bold 64px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('10t', 64, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ----------------------------------------------------------------- catalog
export const KINDS: Record<Kind, KindDef> = {
  rupee: {
    name: 'Rupee', mass: 0.3, grip: 0.8, top: 0.26, bottom: 0.26,
    buildMesh() {
      const g = new THREE.Group();
      const pts = [new THREE.Vector2(0, -0.26), new THREE.Vector2(0.15, -0.09), new THREE.Vector2(0.15, 0.09), new THREE.Vector2(0, 0.26)];
      const geo = new THREE.LatheGeometry(pts, 6);
      g.add(shadowed(new THREE.Mesh(geo, plastic(PAL.rupee, { roughness: 0.2, flat: true, emissive: 0x0a3a1e, emissiveIntensity: 0.6 }))));
      return g;
    },
    collider: () => RAPIER.ColliderDesc.capsule(0.1, 0.15),
  },
  heart: {
    name: 'Heart', mass: 0.35, grip: 0.75, top: 0.22, bottom: 0.22,
    buildMesh() {
      const g = new THREE.Group();
      const geo = new THREE.ExtrudeGeometry(heartShape(0.42), { depth: 0.12, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 4, curveSegments: 12 });
      geo.center();
      g.add(shadowed(new THREE.Mesh(geo, plastic(PAL.heart, { roughness: 0.3 }))));
      return g;
    },
    collider: () => RAPIER.ColliderDesc.ball(0.2),
  },
  shell: {
    name: 'Seashell', mass: 0.25, grip: 0.55, top: 0.12, bottom: 0.11,
    buildMesh() {
      const g = new THREE.Group();
      const body = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 14), plastic(PAL.shell, { roughness: 0.4 })));
      body.scale.set(1, 0.5, 0.9);
      g.add(body);
      const hinge = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), plastic(PAL.shellRidge, { roughness: 0.4 })));
      hinge.position.set(0, 0.0, -0.18);
      g.add(hinge);
      const ridgeGeo = new THREE.CapsuleGeometry(0.018, 0.2, 2, 6);
      for (let i = -2; i <= 2; i++) {
        const ridge = new THREE.Mesh(ridgeGeo, plastic(PAL.shellRidge, { roughness: 0.4 }));
        const a = i * 0.42;
        ridge.position.set(Math.sin(a) * 0.1, 0.085 - Math.abs(i) * 0.012, -0.02 + Math.cos(a) * 0.1);
        ridge.rotation.set(Math.PI / 2 - 0.3, 0, -a);
        g.add(ridge);
      }
      return g;
    },
    collider: () => RAPIER.ColliderDesc.cuboid(0.21, 0.1, 0.2),
  },
  acorn: {
    name: 'Acorn', mass: 0.3, grip: 0.75, top: 0.27, bottom: 0.25,
    buildMesh() {
      const g = new THREE.Group();
      const nut = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), plastic(PAL.acornBody, { roughness: 0.45 })));
      nut.scale.set(1, 1.15, 1);
      nut.position.y = -0.04;
      g.add(nut);
      const cap = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), plastic(PAL.acornCap, { roughness: 0.6 })));
      cap.position.y = 0.04;
      g.add(cap);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.08, 6), plastic(PAL.acornCap, { roughness: 0.6 }));
      stem.position.y = 0.25;
      g.add(stem);
      return g;
    },
    collider: () => RAPIER.ColliderDesc.capsule(0.08, 0.17),
  },
  mushroom: {
    name: 'Mushroom', mass: 0.3, grip: 0.7, top: 0.2, bottom: 0.3,
    buildMesh() {
      const g = new THREE.Group();
      const stem = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.22, 10), plastic(PAL.mushroomStem, { roughness: 0.5 })));
      stem.position.y = -0.09;
      g.add(stem);
      const cap = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), plastic(PAL.mushroomCap, { roughness: 0.35 })));
      cap.position.y = 0.02;
      cap.scale.y = 0.8;
      g.add(cap);
      const dotGeo = new THREE.SphereGeometry(0.035, 8, 6);
      const dotMat = plastic(0xffffff, { roughness: 0.5 });
      for (const [x, y, z] of [[0.1, 0.14, 0.08], [-0.12, 0.1, 0.06], [0.0, 0.17, -0.1], [0.08, 0.08, -0.14]]) {
        const d = new THREE.Mesh(dotGeo, dotMat);
        d.position.set(x, y, z);
        g.add(d);
      }
      return g;
    },
    collider: () => RAPIER.ColliderDesc.capsule(0.1, 0.2),
  },
  star: {
    name: 'Star', mass: 0.3, grip: 0.5, top: 0.07, bottom: 0.07,
    buildMesh() {
      const g = new THREE.Group();
      const geo = new THREE.ExtrudeGeometry(starShape(0.26, 0.12), { depth: 0.08, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 3 });
      geo.center();
      geo.rotateX(-Math.PI / 2);
      g.add(shadowed(new THREE.Mesh(geo, plastic(PAL.star, { roughness: 0.3, emissive: 0x4a3400, emissiveIntensity: 0.4 }))));
      return g;
    },
    collider: () => RAPIER.ColliderDesc.cylinder(0.07, 0.25),
  },
  rock: {
    name: 'Rock', mass: 0.7, grip: 0.45, top: 0.17, bottom: 0.19,
    buildMesh() {
      const g = new THREE.Group();
      const m = shadowed(new THREE.Mesh(new THREE.DodecahedronGeometry(0.2, 0), plastic(PAL.rock, { roughness: 0.85, flat: true })));
      m.scale.set(1.2, 0.8, 1);
      g.add(m);
      return g;
    },
    collider: () => RAPIER.ColliderDesc.ball(0.19),
  },
  bomb: {
    name: 'Bomb', mass: 0.5, grip: 0.65, top: 0.3, bottom: 0.2,
    buildMesh() {
      const g = new THREE.Group();
      g.add(shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 14), plastic(PAL.bomb, { roughness: 0.3 }))));
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 10), plastic(PAL.clawDark, { roughness: 0.4 }));
      neck.position.y = 0.2;
      g.add(neck);
      const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 6), plastic(PAL.fuse, { roughness: 0.7 }));
      fuse.position.set(0.03, 0.28, 0);
      fuse.rotation.z = -0.5;
      g.add(fuse);
      const spark = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), plastic(PAL.spark, { emissive: PAL.spark, emissiveIntensity: 1.5 }));
      spark.position.set(0.07, 0.34, 0);
      g.add(spark);
      return g;
    },
    collider: () => RAPIER.ColliderDesc.ball(0.2),
  },
  weight: {
    name: 'Weight', mass: 8, grip: 0.7, top: 0.43, bottom: 0.23, restitution: 0.02,
    buildMesh() {
      const g = new THREE.Group();
      const body = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.44, 0.45, 4), plastic(PAL.weight, { roughness: 0.35 })));
      body.rotation.y = Math.PI / 4;
      g.add(body);
      const handle = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.04, 10, 18, Math.PI), plastic(PAL.weightHandle, { roughness: 0.35 })));
      handle.position.y = 0.225;
      g.add(handle);
      const label = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ map: weightLabel(), transparent: true }));
      label.position.set(0, -0.02, 0.265);
      label.rotation.x = -0.3;
      g.add(label);
      return g;
    },
    collider: () => RAPIER.ColliderDesc.cuboid(0.31, 0.33, 0.31).setTranslation(0, 0.1, 0),
  },
};

// -------------------------------------------------------------- instances
export class Collectible implements Grabbable {
  readonly def: KindDef;
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly mesh: THREE.Group;
  delivered = false;
  held = false;
  removed = false;

  constructor(
    readonly kind: Kind,
    pos: THREE.Vector3Like,
    rotY: number,
    private phys: PhysicsWorld,
    private scene: THREE.Scene,
    readonly isTarget: boolean,
  ) {
    this.def = KINDS[kind];
    this.mesh = this.def.buildMesh();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setLinearDamping(0.2)
      .setAngularDamping(this.def.mass > 2 ? 2.0 : 0.6)
      .setCcdEnabled(true);
    this.body = phys.world.createRigidBody(bodyDesc);
    const colDesc = this.def.collider()
      .setMass(this.def.mass)
      .setFriction(0.8)
      .setRestitution(this.def.restitution ?? 0.25)
      .setCollisionGroups(OBJECT_GROUPS);
    this.collider = phys.world.createCollider(colDesc, this.body);
    this.body.userData = { collectible: this, grabbable: this } satisfies BodyUserData;
    scene.add(this.mesh);
    phys.register(this.body, this.mesh);
  }

  get name(): string {
    return this.def.name;
  }

  get position(): THREE.Vector3 {
    return this.mesh.position;
  }

  /** The claw closed on it: ride along kinematically and ignore the fingers. */
  onGrab(): void {
    this.held = true;
    this.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    this.collider.setCollisionGroups(HELD_GROUPS);
  }

  /** Let go: back to a free body carrying the claw's velocity. */
  onRelease(vel: THREE.Vector3Like): void {
    this.held = false;
    if (this.removed) return;
    this.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    this.body.setLinvel(vel, true);
    const spin = Math.min(1, 0.5 / this.def.mass);
    this.body.setAngvel({ x: (Math.random() - 0.5) * spin, y: (Math.random() - 0.5) * spin, z: (Math.random() - 0.5) * spin }, true);
    // Fingers may still overlap it while they open; restore claw contact shortly after.
    setTimeout(() => { if (!this.removed) this.collider.setCollisionGroups(OBJECT_GROUPS); }, 500);
  }

  /** Teleport (used when something falls off the island). */
  teleport(pos: THREE.Vector3Like): void {
    this.body.setTranslation(pos, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.phys.snap(this.body);
  }

  dispose(): void {
    if (this.removed) return;
    this.removed = true;
    this.phys.removeBody(this.body);
    this.scene.remove(this.mesh);
  }
}

export function collectibleOf(body: RAPIER.RigidBody | null): Collectible | null {
  const ud = body?.userData as BodyUserData | undefined;
  return ud?.collectible ?? null;
}

// ---------------------------------------------------------------- spawning
export interface Zone { x: number; z: number; r: number }

export function pickSpawnPoints(
  count: number,
  rng: () => number,
  bounds: { hx: number; hz: number },
  exclusions: Zone[],
  minDist = 0.6,
): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  let guard = 0;
  while (pts.length < count && guard++ < 4000) {
    const x = (rng() * 2 - 1) * bounds.hx;
    const z = (rng() * 2 - 1) * bounds.hz;
    if (exclusions.some((e) => Math.hypot(x - e.x, z - e.z) < e.r)) continue;
    if (pts.some((p) => Math.hypot(p.x - x, p.y - z) < minDist)) continue;
    pts.push(new THREE.Vector2(x, z));
  }
  return pts;
}

// ------------------------------------------------------------------- icons
export interface IconEntry { key: string; build: () => THREE.Object3D }

/** Renders each entry once with an offscreen renderer; returns data URLs by key. */
export function renderIcons(entries: IconEntry[]): Record<string, string> {
  const out: Record<string, string> = {};
  let renderer: THREE.WebGLRenderer | null = null;
  try {
    const canvas = document.createElement('canvas');
    const size = 160;
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(size, size, false);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.4));
    const key = new THREE.DirectionalLight(0xfff1dc, 2.4);
    key.position.set(2, 3, 2.5);
    scene.add(key);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    const box = new THREE.Box3();
    const sphere = new THREE.Sphere();
    for (const entry of entries) {
      const mesh = entry.build();
      mesh.rotation.y = -0.5;
      scene.add(mesh);
      box.setFromObject(mesh).getBoundingSphere(sphere);
      const dist = (sphere.radius / Math.sin(THREE.MathUtils.degToRad(15))) * 1.05;
      camera.position.set(sphere.center.x + dist * 0.55, sphere.center.y + dist * 0.5, sphere.center.z + dist * 0.68);
      camera.lookAt(sphere.center);
      renderer.render(scene, camera);
      out[entry.key] = canvas.toDataURL('image/png');
      scene.remove(mesh);
    }
  } catch (err) {
    console.warn('Icon rendering failed, falling back to emoji', err);
  } finally {
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
  return out;
}

export const EMOJI_FALLBACK: Record<string, string> = {
  rupee: '💎', heart: '❤️', shell: '🐚', acorn: '🌰', mushroom: '🍄', star: '⭐', rock: '🪨', bomb: '💣', weight: '🏋️', diamondcrab: '🦀',
};
