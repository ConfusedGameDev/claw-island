import * as THREE from 'three';
import { plastic } from '../scene/Materials';
import { boneGeometry, BONE, BONE_DARK } from '../scene/Bones';
import { mulberry32 } from '../util/math';

/**
 * Frankenstein's monster, built from ten body pieces. Every cleared Spooky
 * Night island awards the next slot, taken from a random monster.
 *
 * Art direction: little vinyl toy figures (soft matte plastic, chunky
 * rounded forms, bead eyes, sculpted details) standing on a display base.
 */
export const SLOTS = ['head', 'torso', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg', 'eyes', 'mouth', 'hair', 'extra'] as const;
export type Slot = typeof SLOTS[number];

export const MONSTER_IDS = ['vampire', 'werewolf', 'mummy', 'zombie', 'ghost', 'witch', 'skeleton', 'pumpkin', 'cyclops', 'slime'] as const;
export type MonsterId = typeof MONSTER_IDS[number];

/** The pieces so far, plus a per-run seed that gives each monster its own proportions and tints. */
export type MonsterBuild = Partial<Record<Slot, MonsterId>> & { seed?: number };

interface MonsterStyle {
  name: string;
  /** Main colour, also used as the UI swatch for this monster's pieces. */
  skin: number;
  cloth: number;
  accent: number;
  /** See-through body parts (ghost, slime). */
  clear?: boolean;
  hairName: string;
  extraName: string;
  /** Name syllables: [start, end]. */
  syllables: [string, string];
}

export const MONSTERS: Record<MonsterId, MonsterStyle> = {
  vampire: { name: 'Vampire', skin: 0xeee2f7, cloth: 0x2b1d3a, accent: 0xc8283f, hairName: 'slick hair', extraName: 'bat wings', syllables: ['Drac', 'ula'] },
  werewolf: { name: 'Werewolf', skin: 0x8f6e52, cloth: 0x4f6286, accent: 0xf2b84b, hairName: 'wolf ears', extraName: 'bushy tail', syllables: ['Wolf', 'fang'] },
  mummy: { name: 'Mummy', skin: 0xeadcbc, cloth: 0xd9c9a4, accent: 0x7fe0b0, hairName: 'loose wrappings', extraName: 'trailing ribbons', syllables: ['Mum', 'wrap'] },
  zombie: { name: 'Zombie', skin: 0x93c98a, cloth: 0x5f73a6, accent: 0xe8768f, hairName: 'messy hair', extraName: 'tattered cape', syllables: ['Zom', 'bie'] },
  ghost: { name: 'Ghost', skin: 0xf2f3ff, cloth: 0xf2f3ff, accent: 0xa9b8ff, clear: true, hairName: 'wispy curl', extraName: 'ghostly tail', syllables: ['Boo', 'ghost'] },
  witch: { name: 'Witch', skin: 0xa3d99a, cloth: 0x5e3a8f, accent: 0xf28a35, hairName: 'pointy hat', extraName: 'broomstick', syllables: ['Hex', 'witch'] },
  skeleton: { name: 'Skeleton', skin: BONE, cloth: BONE, accent: 0xe8768f, hairName: 'ribbon', extraName: 'bone wings', syllables: ['Bone', 'bones'] },
  pumpkin: { name: 'Pumpkin', skin: 0xf28a35, cloth: 0x4e9a55, accent: 0xffcf4a, hairName: 'curly stem', extraName: 'leaf wings', syllables: ['Pump', 'kin'] },
  cyclops: { name: 'Cyclops', skin: 0xb898e8, cloth: 0xe8768f, accent: 0xfff6ea, hairName: 'horn', extraName: 'pointed tail', syllables: ['Cy', 'clops'] },
  slime: { name: 'Slime', skin: 0x86e8bb, cloth: 0x86e8bb, accent: 0x3aa87a, clear: true, hairName: 'antenna', extraName: 'slime puddle', syllables: ['Goo', 'slime'] },
};

/** CSS colour for a monster's swatch dot. */
export const swatchCss = (id: MonsterId): string => `#${MONSTERS[id].skin.toString(16).padStart(6, '0')}`;

const SLOT_NAMES: Record<Slot, string> = {
  head: 'head', torso: 'body', leftArm: 'left arm', rightArm: 'right arm', leftLeg: 'left leg', rightLeg: 'right leg',
  eyes: 'eyes', mouth: 'mouth', hair: 'hair', extra: 'extra',
};

/** e.g. "Werewolf's left arm", "Witch's pointy hat". */
export function pieceLabel(slot: Slot, id: MonsterId): string {
  const m = MONSTERS[id];
  const part = slot === 'hair' ? m.hairName : slot === 'extra' ? m.extraName : SLOT_NAMES[slot];
  return `${m.name}'s ${part}`;
}

/** A random monster for the next piece, preferring ones not in `used` (a run never repeats one until all ten are in). */
export function rollPiece(rng: () => number, used: readonly (MonsterId | undefined)[] = []): MonsterId {
  const fresh = MONSTER_IDS.filter((id) => !used.includes(id));
  const pool = fresh.length ? fresh : MONSTER_IDS;
  return pool[Math.floor(rng() * pool.length) % pool.length];
}

/** A fresh seed for a new monster's look. */
export const newMonsterSeed = (): number => (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;

/** A default name: the head's first syllable plus the body's last. */
export function monsterName(build: MonsterBuild): string {
  const a = MONSTERS[build.head ?? 'zombie'].syllables[0];
  const b = MONSTERS[build.torso ?? 'zombie'].syllables[1];
  const name = a + b.toLowerCase();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function isComplete(build: MonsterBuild): boolean {
  return SLOTS.every((s) => build[s]);
}

// -------------------------------------------------------------- materials
const INK = 0x2a2230;
const SOCKET = 0x231a2b;
/** Soft matte vinyl, the toy-figure finish. */
const vinyl = (hex: number, roughness = 0.6) => plastic(hex, { roughness });
const glossy = (hex: number) => plastic(hex, { roughness: 0.18 });
const glow = (hex: number, i = 1.4) => plastic(hex, { emissive: hex, emissiveIntensity: i, roughness: 0.3 });
const skinMat = (id: MonsterId) => {
  const m = MONSTERS[id];
  return m.clear ? plastic(m.skin, { roughness: 0.25, transparent: true, opacity: 0.9 }) : vinyl(m.skin);
};
const clothMat = (id: MonsterId) => {
  const m = MONSTERS[id];
  return m.clear ? plastic(m.cloth, { roughness: 0.25, transparent: true, opacity: 0.9 }) : vinyl(m.cloth, 0.7);
};
const wrapMat = () => vinyl(0xf6ecd4, 0.8);
const ghostly = () => plastic(0xb9a8e6, { roughness: 0.6, transparent: true, opacity: 0.22 });

function add(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** A mesh the face features may sit on (raycast target). */
function surface(m: THREE.Mesh): THREE.Mesh {
  m.userData.surface = true;
  return m;
}

/** A smooth solid of revolution from (radius, y) pairs. */
function lathe(points: [number, number][], segments = 28): THREE.LatheGeometry {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

/** Wrap a part in raised bandage bands (horizontal, gently tilted). */
function bandages(parent: THREE.Object3D, radius: number, y0: number, y1: number, count: number, tilt = 0.18): void {
  const mat = wrapMat();
  for (let i = 0; i < count; i++) {
    const y = y0 + ((i + 0.5) / count) * (y1 - y0);
    const b = add(parent, new THREE.TorusGeometry(radius, radius * 0.11, 6, 24), mat, 0, y, 0);
    b.rotation.x = Math.PI / 2 + (i % 2 ? tilt : -tilt);
  }
}

/** A stitched seam ring: a dark groove with cross ticks. */
function seam(parent: THREE.Object3D, radius: number, axis: 'x' | 'y', at: THREE.Vector3): void {
  const mat = vinyl(INK, 0.7);
  const g = new THREE.Group();
  g.position.copy(at);
  const ring = add(g, new THREE.TorusGeometry(radius, 0.011, 4, 28), mat);
  ring.rotation.x = Math.PI / 2;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const t = add(g, new THREE.CapsuleGeometry(0.008, 0.045, 2, 4), mat, Math.cos(a) * radius, 0, Math.sin(a) * radius);
    t.rotation.y = -a;
  }
  if (axis === 'x') g.rotation.z = Math.PI / 2;
  parent.add(g);
}

// ---------------------------------------------------------------- layout
// Feet at y = 0; the head sits on top of a short body (toy proportions).
const HEAD = new THREE.Vector3(0, 1.64, 0);
const HEAD_R = 0.46;
const TORSO_Y = 0.84;
const SHOULDER = 0.31;
const HIP = 0.15;

/** Where a feature sits on the head: a point on its surface and the outward normal there. */
interface Anchor { point: THREE.Vector3; normal: THREE.Vector3 }

const raycaster = new THREE.Raycaster();

function surfaceMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => { if (o instanceof THREE.Mesh && o.userData.surface) out.push(o); });
  return out;
}

/** Cast a ray at the head and return the hit, in monster space (the root is at the origin, unrotated, while building). */
function castAt(targets: THREE.Mesh[], from: THREE.Vector3, dir: THREE.Vector3): Anchor | null {
  raycaster.set(from, dir);
  const hit = raycaster.intersectObjects(targets, false)[0];
  if (!hit || !hit.face) return null;
  const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
  return { point: hit.point.clone(), normal };
}

/** Front of the head at (x, y) relative to its centre. */
function frontAnchor(targets: THREE.Mesh[], x: number, y: number): Anchor {
  const hit = castAt(targets, new THREE.Vector3(HEAD.x + x, HEAD.y + y, 3), new THREE.Vector3(0, 0, -1));
  if (hit) return hit;
  const z = Math.sqrt(Math.max(0, HEAD_R * HEAD_R - x * x - y * y));
  const n = new THREE.Vector3(x, y, z).normalize();
  return { point: HEAD.clone().add(new THREE.Vector3(x, y, z)), normal: n };
}

/** Top of the head at (x, z) relative to its centre. */
function topAnchor(targets: THREE.Mesh[], x = 0, z = 0): Anchor {
  const hit = castAt(targets, new THREE.Vector3(HEAD.x + x, HEAD.y + 3, HEAD.z + z), new THREE.Vector3(0, -1, 0));
  if (hit) return hit;
  return { point: new THREE.Vector3(HEAD.x + x, HEAD.y + HEAD_R, HEAD.z + z), normal: new THREE.Vector3(0, 1, 0) };
}

/** Seat a feature (built facing +Z) on an anchor, `inset` along the normal (negative sinks it in). */
function seat(obj: THREE.Object3D, a: Anchor, inset = 0): THREE.Object3D {
  obj.position.copy(a.point).addScaledVector(a.normal, inset);
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), a.normal);
  return obj;
}

// ------------------------------------------------------------------ head
function buildHead(id: MonsterId): THREE.Group {
  const g = new THREE.Group();
  const s = skinMat(id);
  const R = HEAD_R;
  switch (id) {
    case 'pumpkin': {
      // Ribbed gourd: lobes around a core, one lobe centred on the face.
      surface(add(g, new THREE.SphereGeometry(R * 0.86, 24, 16), s)).scale.set(1.05, 0.88, 1);
      for (let i = 0; i < 8; i++) {
        const a = Math.PI / 2 + (i / 8) * Math.PI * 2;
        const lobe = surface(add(g, new THREE.SphereGeometry(R * 0.52, 18, 14), s, Math.cos(a) * R * 0.46, 0, Math.sin(a) * R * 0.46));
        lobe.scale.set(0.78, 1.32, 0.78);
        lobe.rotation.y = -a;
      }
      break;
    }
    case 'skeleton': {
      surface(add(g, new THREE.SphereGeometry(R, 28, 20), s)).scale.set(1, 0.96, 0.94);
      surface(add(g, new THREE.SphereGeometry(R * 0.64, 20, 14), s, 0, -R * 0.52, R * 0.2)).scale.set(1, 0.62, 0.9);
      // Cheekbones.
      for (const sx of [-1, 1]) add(g, new THREE.SphereGeometry(R * 0.2, 12, 8), s, sx * R * 0.55, -R * 0.2, R * 0.62).scale.set(1, 0.7, 0.6);
      break;
    }
    case 'werewolf': {
      surface(add(g, new THREE.SphereGeometry(R, 28, 20), s));
      // A real muzzle: the mouth lands on it because it is a raycast surface.
      surface(add(g, new THREE.SphereGeometry(R * 0.44, 20, 14), vinyl(0xe0c7a6), 0, -R * 0.36, R * 0.74)).scale.set(1.25, 0.8, 0.9);
      add(g, new THREE.SphereGeometry(R * 0.11, 12, 10), glossy(INK), 0, -R * 0.2, R * 1.12).scale.set(1.3, 0.85, 0.9);
      for (const sx of [-1, 1]) {
        const tuft = add(g, new THREE.ConeGeometry(0.1, 0.2, 7), s, sx * R * 0.97, -R * 0.25, 0.04);
        tuft.rotation.z = sx * -2.0;
      }
      break;
    }
    case 'mummy': {
      surface(add(g, new THREE.SphereGeometry(R, 28, 20), s));
      // Bands kept clear of the eye line (y ≈ 0.04) and the mouth line (y ≈ -0.17).
      const mat = wrapMat();
      for (const [y, tilt] of [[0.3, 0.16], [0.17, -0.12], [-0.06, 0.08], [-0.31, -0.1]] as const) {
        const r = Math.sqrt(R * R - y * y) + 0.012;
        const b = add(g, new THREE.TorusGeometry(r, 0.03, 6, 32), mat, 0, y, 0);
        b.rotation.x = Math.PI / 2 + tilt;
      }
      break;
    }
    case 'ghost':
      surface(add(g, new THREE.SphereGeometry(R, 28, 20), s)).scale.set(1, 1.07, 1);
      break;
    case 'witch': {
      surface(add(g, new THREE.SphereGeometry(R, 28, 20), s)).scale.set(1, 1.02, 0.97);
      add(g, new THREE.SphereGeometry(R * 0.2, 12, 10), s, -R * 0.62, R * 0.05, R * 0.5).scale.set(0.6, 1, 0.6);
      break;
    }
    case 'zombie': {
      surface(add(g, new THREE.SphereGeometry(R, 28, 20), s)).scale.set(1.02, 0.98, 0.98);
      // A darker grafted patch on the crown.
      const patch = add(g, new THREE.SphereGeometry(R * 1.008, 18, 12, 0.3, 1.0, 0.25, 0.55), vinyl(0x74a86b));
      patch.rotation.y = -0.4;
      break;
    }
    case 'slime': {
      surface(add(g, new THREE.SphereGeometry(R, 28, 20), s)).scale.set(1.1, 0.9, 1);
      for (const [x, z, sc] of [[-0.26, 0.32, 1.7], [0.3, 0.26, 1.4], [0.06, 0.38, 2.0]] as const) {
        add(g, new THREE.SphereGeometry(0.06, 10, 8), s, x, -R * 0.78, z).scale.y = sc;
      }
      break;
    }
    case 'vampire': {
      surface(add(g, new THREE.SphereGeometry(R, 28, 20), s)).scale.set(0.97, 1.05, 0.96);
      for (const sx of [-1, 1]) {
        const ear = add(g, new THREE.ConeGeometry(0.075, 0.24, 8), s, sx * R * 0.95, 0.04, -0.02);
        ear.rotation.z = sx * -1.25;
        ear.scale.z = 0.5;
      }
      break;
    }
    case 'cyclops':
      surface(add(g, new THREE.SphereGeometry(R, 28, 20), s)).scale.set(1.07, 0.95, 1);
      break;
  }
  g.position.copy(HEAD);
  return g;
}

/** Features shared by every head, seated after the face pieces: the stitched forehead seam and the nose. */
function headDetails(root: THREE.Object3D, targets: THREE.Mesh[], headId: MonsterId): void {
  // Frankenstein forehead seam, sculpted as a groove with ticks following the head.
  if (headId !== 'ghost' && headId !== 'slime') {
    const mat = vinyl(INK, 0.7);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 6; i++) {
      const x = -0.05 + i * 0.045;
      const a = frontAnchor(targets, x, 0.27 - i * 0.012);
      pts.push(a.point.clone().addScaledVector(a.normal, 0.004));
      if (i > 0 && i < 6) {
        const tick = new THREE.Mesh(new THREE.CapsuleGeometry(0.007, 0.04, 2, 4), mat);
        root.add(seat(tick, a, 0.004));
        tick.rotateX(Math.PI / 2);
      }
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    root.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.009, 5), mat));
  }
  const nose = frontAnchor(targets, 0, -0.06);
  switch (headId) {
    case 'witch': {
      const n = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 12), skinMat('witch'));
      n.geometry.rotateX(Math.PI / 2).translate(0, -0.03, 0.09);
      n.castShadow = true;
      root.add(seat(n, nose, -0.02));
      n.rotateX(0.35);
      break;
    }
    case 'skeleton': {
      const n = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.075, 3), vinyl(SOCKET));
      n.geometry.rotateZ(Math.PI);
      root.add(seat(n, nose, -0.012));
      break;
    }
    case 'vampire':
    case 'zombie':
    case 'cyclops': {
      const n = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), skinMat(headId));
      n.scale.set(1.2, 0.9, 0.8);
      root.add(seat(n, nose, 0.0));
      break;
    }
  }
}

// ----------------------------------------------------------------- torso
function buildTorso(id: MonsterId): THREE.Group {
  const g = new THREE.Group();
  const c = clothMat(id);
  const s = skinMat(id);
  const m = MONSTERS[id];
  // A soft barrel: wider hips, rounded shoulders.
  const barrel = lathe([[0.001, -0.34], [0.2, -0.33], [0.3, -0.24], [0.33, -0.06], [0.31, 0.14], [0.25, 0.3], [0.13, 0.37], [0.001, 0.38]]);
  switch (id) {
    case 'skeleton': {
      const bone = vinyl(BONE, 0.55);
      add(g, boneGeometry(0.62, 0.042), bone, 0, 0.02, -0.06);
      for (let i = 0; i < 4; i++) {
        const r = add(g, new THREE.TorusGeometry(0.25 - i * 0.025, 0.03, 8, 22, Math.PI * 1.55), bone, 0, 0.24 - i * 0.105, -0.01);
        r.rotation.set(Math.PI / 2, 0, Math.PI * 0.72);
      }
      add(g, new THREE.SphereGeometry(0.22, 16, 10), bone, 0, -0.3, -0.01).scale.set(1.25, 0.48, 0.8);
      break;
    }
    case 'pumpkin':
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        add(g, new THREE.SphereGeometry(0.22, 16, 12), s, Math.cos(a) * 0.14, 0, Math.sin(a) * 0.14).scale.set(0.85, 1.45, 0.85);
      }
      add(g, new THREE.TorusGeometry(0.3, 0.035, 8, 24), vinyl(m.cloth), 0, -0.22, 0).rotation.x = Math.PI / 2;
      break;
    case 'witch': {
      add(g, lathe([[0.001, -0.36], [0.42, -0.35], [0.38, -0.2], [0.28, 0.05], [0.22, 0.25], [0.14, 0.37], [0.001, 0.38]]), c);
      add(g, new THREE.TorusGeometry(0.26, 0.04, 8, 24), vinyl(m.accent), 0, 0.02, 0).rotation.x = Math.PI / 2;
      add(g, new THREE.BoxGeometry(0.08, 0.08, 0.03), plastic(0xffcf4a, { metalness: 0.4, roughness: 0.3 }), 0, 0.02, 0.27);
      break;
    }
    case 'ghost': {
      add(g, lathe([[0.001, 0.38], [0.14, 0.37], [0.24, 0.25], [0.32, -0.05], [0.38, -0.3], [0.001, -0.31]]), s);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        add(g, new THREE.SphereGeometry(0.1, 10, 8), s, Math.cos(a) * 0.32, -0.34, Math.sin(a) * 0.32);
      }
      break;
    }
    case 'slime':
      add(g, new THREE.SphereGeometry(0.36, 22, 16), s).scale.set(1, 1.1, 0.9);
      add(g, new THREE.SphereGeometry(0.06, 10, 8), glow(m.accent, 0.5), 0.1, 0.05, 0.14);
      add(g, new THREE.SphereGeometry(0.04, 10, 8), glow(m.accent, 0.5), -0.08, -0.12, 0.12);
      break;
    default: {
      add(g, barrel, c).scale.z = 0.86;
      if (id === 'vampire') {
        // Shirt front, a little cravat and a tall collar.
        add(g, new THREE.BoxGeometry(0.16, 0.42, 0.04), vinyl(0xf4eef8), 0, 0.04, 0.25).rotation.x = -0.08;
        add(g, new THREE.SphereGeometry(0.05, 10, 8), vinyl(m.accent), 0, 0.27, 0.28).scale.set(1.4, 0.8, 0.6);
        for (const sx of [-1, 1]) {
          const collar = add(g, lathe([[0.001, 0], [0.14, 0.02], [0.18, 0.2], [0.001, 0.22]], 10), vinyl(m.accent, 0.5), sx * 0.19, 0.3, -0.08);
          collar.scale.z = 0.25;
          collar.rotation.set(-0.35, sx * 0.55, sx * 0.25);
        }
      } else if (id === 'werewolf') {
        add(g, new THREE.SphereGeometry(0.2, 14, 10), vinyl(0xe0c7a6, 0.8), 0, 0.04, 0.16).scale.set(1, 1.25, 0.55);
        for (const sx of [-1, 0, 1]) add(g, new THREE.ConeGeometry(0.06, 0.13, 5), c, sx * 0.17, -0.33, 0.14).rotation.x = Math.PI;
      } else if (id === 'mummy') {
        bandages(g, 0.31, -0.26, 0.3, 5);
      } else if (id === 'zombie') {
        add(g, new THREE.SphereGeometry(0.1, 12, 8), s, 0.12, 0.05, 0.23).scale.z = 0.4;
        add(g, new THREE.CapsuleGeometry(0.007, 0.12, 2, 4), vinyl(INK), -0.08, -0.1, 0.27).rotation.z = Math.PI / 2;
        for (const sx of [-1, 1]) add(g, new THREE.ConeGeometry(0.05, 0.12, 4), c, sx * 0.18, -0.38, 0.13).rotation.x = Math.PI;
      } else if (id === 'cyclops') {
        for (const sx of [-1, 1]) add(g, new THREE.BoxGeometry(0.05, 0.42, 0.03), vinyl(0x5e3a8f), sx * 0.12, 0.08, 0.255).rotation.z = sx * 0.1;
        add(g, new THREE.BoxGeometry(0.3, 0.2, 0.03), vinyl(0x5e3a8f), 0, -0.12, 0.26);
        for (const sx of [-1, 1]) add(g, new THREE.CylinderGeometry(0.022, 0.022, 0.02, 10), plastic(0xffcf4a, { metalness: 0.4, roughness: 0.3 }), sx * 0.12, 0.25, 0.27).rotation.x = Math.PI / 2;
      }
    }
  }
  g.position.set(0, TORSO_Y, 0);
  return g;
}

// ----------------------------------------------------------------- limbs
/** An arm from the shoulder at `side` (-1 left, +1 right): upper arm, a slight elbow bend, a chunky hand. */
function buildArm(id: MonsterId, side: number): THREE.Group {
  const g = new THREE.Group();
  const s = skinMat(id);
  const c = clothMat(id);
  const elbow = new THREE.Group();
  elbow.position.y = -0.2;
  elbow.rotation.set(-0.35, 0, side * -0.18);
  const hand = (mat: THREE.Material) => {
    const h = add(elbow, new THREE.SphereGeometry(0.095, 14, 10), mat, 0, -0.2, 0.01);
    h.scale.set(0.92, 1.05, 0.75);
    add(elbow, new THREE.SphereGeometry(0.04, 10, 8), mat, -side * 0.07, -0.17, 0.04);
  };
  switch (id) {
    case 'skeleton': {
      const bone = vinyl(BONE, 0.55);
      add(g, boneGeometry(0.17, 0.032), bone, 0, -0.1, 0);
      add(elbow, boneGeometry(0.14, 0.028), bone, 0, -0.08, 0);
      for (let i = -1; i <= 1; i++) add(elbow, boneGeometry(0.07, 0.012), bone, i * 0.032, -0.2, 0.01).rotation.z = i * 0.25;
      break;
    }
    case 'ghost': {
      const wisp = add(g, new THREE.ConeGeometry(0.1, 0.42, 14), s, 0, -0.2, 0);
      wisp.rotation.x = Math.PI;
      add(g, new THREE.SphereGeometry(0.1, 12, 10), s);
      break;
    }
    case 'pumpkin': {
      add(g, new THREE.CapsuleGeometry(0.042, 0.17, 4, 8), c, 0, -0.1, 0);
      add(elbow, new THREE.CapsuleGeometry(0.038, 0.12, 4, 8), c, 0, -0.07, 0);
      const leaf = add(elbow, new THREE.SphereGeometry(0.11, 12, 8), vinyl(0x6fbf5a), 0, -0.2, 0.01);
      leaf.scale.set(1, 1.25, 0.3);
      break;
    }
    default: {
      const sleeve = id === 'vampire' || id === 'witch' || id === 'zombie' || id === 'werewolf' || id === 'cyclops';
      add(g, new THREE.CapsuleGeometry(0.08, 0.15, 4, 12), sleeve ? c : s, 0, -0.1, 0);
      add(g, new THREE.SphereGeometry(0.09, 12, 10), sleeve ? c : s);
      if (id === 'witch') {
        add(elbow, lathe([[0.06, 0.05], [0.1, -0.02], [0.14, -0.12], [0.001, -0.12]], 14), c);
        add(elbow, new THREE.CapsuleGeometry(0.06, 0.06, 4, 10), s, 0, -0.1, 0);
      } else if (id === 'zombie' || id === 'werewolf' || id === 'cyclops') {
        add(elbow, new THREE.CapsuleGeometry(0.07, 0.11, 4, 10), s, 0, -0.08, 0);
      } else {
        add(elbow, new THREE.CapsuleGeometry(0.07, 0.11, 4, 10), sleeve ? c : s, 0, -0.08, 0);
      }
      if (id === 'mummy') { bandages(g, 0.085, -0.2, 0, 3, 0.3); bandages(elbow, 0.075, -0.15, 0, 2, 0.3); }
      hand(s);
      if (id === 'werewolf') for (let i = -1; i <= 1; i++) add(elbow, new THREE.ConeGeometry(0.016, 0.06, 5), vinyl(0xfff6ea), i * 0.035, -0.29, 0.04).rotation.x = Math.PI;
      if (id === 'slime') add(elbow, new THREE.SphereGeometry(0.04, 8, 6), s, 0.03, -0.33, 0).scale.y = 1.6;
      if (id === 'vampire') add(elbow, new THREE.TorusGeometry(0.075, 0.02, 6, 16), vinyl(0xf4eef8), 0, -0.13, 0).rotation.x = Math.PI / 2;
    }
  }
  g.add(elbow);
  g.position.set(side * SHOULDER, TORSO_Y + 0.22, 0);
  g.rotation.z = side * 0.42;
  return g;
}

function buildLeg(id: MonsterId, side: number): THREE.Group {
  const g = new THREE.Group();
  const s = skinMat(id);
  const c = clothMat(id);
  const len = 0.24;
  const foot = (mat: THREE.Material) => add(g, new THREE.SphereGeometry(0.12, 14, 10), mat, 0, -len - 0.07, 0.05).scale.set(0.95, 0.55, 1.35);
  switch (id) {
    case 'skeleton': {
      const bone = vinyl(BONE, 0.55);
      add(g, boneGeometry(len + 0.06, 0.04), bone, 0, -len / 2, 0);
      add(g, boneGeometry(0.15, 0.03), bone, 0, -len - 0.08, 0.05).rotation.x = Math.PI / 2;
      break;
    }
    case 'ghost': {
      const tail = add(g, new THREE.ConeGeometry(0.12, len + 0.18, 14), s, 0, -len / 2 - 0.06, 0);
      tail.rotation.x = Math.PI;
      tail.rotation.z = side * 0.2;
      break;
    }
    case 'witch': {
      for (let i = 0; i < 4; i++) add(g, new THREE.CylinderGeometry(0.072, 0.072, len / 4, 14), vinyl(i % 2 ? INK : 0xb48cff), 0, -(i + 0.5) * (len / 4), 0);
      const boot = add(g, new THREE.ConeGeometry(0.09, 0.32, 12), glossy(INK), 0, -len - 0.05, 0.11);
      boot.rotation.x = Math.PI / 2;
      break;
    }
    case 'pumpkin':
      add(g, new THREE.CapsuleGeometry(0.05, len, 4, 8), c, 0, -len / 2, 0);
      add(g, new THREE.SphereGeometry(0.12, 12, 8), vinyl(0x6fbf5a), 0, -len - 0.05, 0.04).scale.set(0.9, 0.35, 1.3);
      break;
    default: {
      const pants = id === 'vampire' || id === 'zombie' || id === 'cyclops';
      add(g, new THREE.CapsuleGeometry(0.095, len, 4, 12), pants ? c : s, 0, -len / 2, 0);
      if (id === 'mummy') bandages(g, 0.1, -len, 0, 3, 0.3);
      foot(id === 'vampire' ? glossy(INK) : id === 'zombie' ? vinyl(0x6b4a3a) : s);
      if (id === 'werewolf') for (let i = -1; i <= 1; i++) add(g, new THREE.ConeGeometry(0.016, 0.06, 5), vinyl(0xfff6ea), i * 0.045, -len - 0.06, 0.2).rotation.x = Math.PI / 2;
    }
  }
  g.position.set(side * HIP, 0.42, 0);
  return g;
}

// ------------------------------------------------------------------ face
/** A glossy bead eye with a single small highlight, built facing +Z. */
function bead(w: number, h: number, color = INK): THREE.Group {
  const g = new THREE.Group();
  const eye = add(g, new THREE.SphereGeometry(1, 18, 14), glossy(color));
  eye.scale.set(w, h, Math.min(w, h) * 0.5);
  add(g, new THREE.SphereGeometry(Math.min(w, h) * 0.24, 8, 6), plastic(0xffffff, { roughness: 0.1 }), w * 0.32, h * 0.38, Math.min(w, h) * 0.42);
  return g;
}

/**
 * A heavy upper lid in the head's skin colour: the top cap of a shell just
 * larger than the eye, covering it down to `droop` (0 = open, 0.5 = half shut).
 */
function lid(g: THREE.Object3D, w: number, h: number, mat: THREE.Material, droop: number, tilt = 0): void {
  const theta = Math.acos(THREE.MathUtils.clamp(1 - 2 * droop, -1, 1));
  const l = add(g, new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, theta), mat);
  l.scale.set(w * 1.14, h * 1.14, Math.min(w, h) * 0.62);
  l.rotation.z = tilt;
}

/** A recessed, dark socket (skeleton, carved pumpkin, hollow ghost eyes). */
function socket(w: number, h: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), vinyl(SOCKET, 0.85));
  m.scale.set(w, h, Math.min(w, h) * 0.45);
  return m;
}

function buildEyes(id: MonsterId, targets: THREE.Mesh[], headSkin: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const ex = 0.165;
  const ey = 0.04;
  const pair = (make: (side: number) => THREE.Object3D, inset = 0.0, y = ey, x = ex) => {
    for (const side of [-1, 1]) g.add(seat(make(side), frontAnchor(targets, side * x, y), inset));
  };
  switch (id) {
    case 'vampire':
      pair((side) => {
        const e = bead(0.07, 0.05, 0x8a1426);
        lid(e, 0.07, 0.05, headSkin, 0.42, side * 0.25);
        return e;
      }, 0.0);
      break;
    case 'werewolf':
      pair((side) => {
        const e = new THREE.Group();
        add(e, new THREE.SphereGeometry(1, 16, 12), glossy(0xf2b84b)).scale.set(0.07, 0.05, 0.03);
        add(e, new THREE.SphereGeometry(1, 10, 8), glossy(INK), 0, 0, 0.018).scale.set(0.016, 0.042, 0.012);
        const brow = add(e, new THREE.CapsuleGeometry(0.022, 0.1, 4, 8), vinyl(0x6b5040, 0.8), 0, 0.065, 0.01);
        brow.rotation.z = Math.PI / 2 + side * 0.3;
        return e;
      });
      break;
    case 'witch':
      pair((side) => {
        const e = bead(0.065, 0.075, 0x2f6b3a);
        lid(e, 0.065, 0.075, headSkin, 0.35, side * -0.1);
        for (const k of [0, 1]) {
          const lash = add(e, new THREE.CapsuleGeometry(0.006, 0.035, 2, 4), vinyl(INK), side * (0.07 + k * 0.012), 0.035 + k * 0.02, 0.01);
          lash.rotation.z = side * -(0.9 + k * 0.35);
        }
        return e;
      });
      break;
    case 'zombie': {
      g.add(seat(bead(0.085, 0.09), frontAnchor(targets, -ex, ey + 0.02)));
      const shut = new THREE.Group();
      const lidDisc = add(shut, new THREE.SphereGeometry(1, 14, 10), headSkin);
      lidDisc.scale.set(0.06, 0.045, 0.02);
      for (const k of [-1, 1]) add(shut, new THREE.CapsuleGeometry(0.006, 0.07, 2, 4), vinyl(INK), 0, 0, 0.018).rotation.z = Math.PI / 2 + k * 0.6;
      g.add(seat(shut, frontAnchor(targets, ex, ey - 0.01), 0.0));
      break;
    }
    case 'mummy': {
      const lit = new THREE.Group();
      lit.add(socket(0.06, 0.04));
      add(lit, new THREE.SphereGeometry(0.022, 10, 8), glow(0x7fe0b0, 1.6), 0, 0, 0.012);
      g.add(seat(lit, frontAnchor(targets, ex, ey), -0.004));
      // The other eye hides under a loose wrap.
      const wrap = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.2, 4, 8), wrapMat());
      wrap.castShadow = true;
      g.add(seat(wrap, frontAnchor(targets, -ex, ey), 0.012));
      wrap.rotateZ(Math.PI / 2 - 0.3);
      break;
    }
    case 'ghost':
      pair(() => socket(0.06, 0.095), -0.006, ey + 0.01, 0.15);
      break;
    case 'skeleton':
      pair(() => {
        const e = new THREE.Group();
        e.add(socket(0.1, 0.105));
        add(e, new THREE.SphereGeometry(0.02, 10, 8), glow(0x7fe0b0, 1.8), 0, -0.01, 0.025);
        return e;
      }, -0.02);
      break;
    case 'pumpkin':
      pair((side) => {
        const e = new THREE.Group();
        const tri = (r: number, mat: THREE.Material, z: number) => {
          const t = add(e, new THREE.CylinderGeometry(r, r, 0.02, 3), mat, 0, 0, z);
          t.rotation.x = Math.PI / 2;
          t.rotation.y = side * 0.25;
        };
        tri(0.08, vinyl(SOCKET, 0.9), 0);
        tri(0.05, glow(0xffcf4a, 1.3), 0.008);
        return e;
      }, -0.004, ey + 0.02);
      break;
    case 'cyclops': {
      const e = new THREE.Group();
      add(e, new THREE.SphereGeometry(1, 22, 16), glossy(0xfffaf4)).scale.set(0.16, 0.15, 0.06);
      add(e, new THREE.SphereGeometry(1, 18, 14), glossy(0x4fb6e8), 0, -0.01, 0.035).scale.set(0.085, 0.085, 0.03);
      add(e, new THREE.SphereGeometry(1, 14, 10), glossy(INK), 0, -0.01, 0.05).scale.set(0.045, 0.045, 0.02);
      add(e, new THREE.SphereGeometry(0.02, 8, 6), plastic(0xffffff, { roughness: 0.1 }), 0.03, 0.02, 0.06);
      lid(e, 0.16, 0.15, headSkin, 0.3);
      for (let k = -1; k <= 1; k++) {
        const lash = add(e, new THREE.CapsuleGeometry(0.008, 0.05, 2, 4), vinyl(INK), k * 0.06, 0.14, 0.02);
        lash.rotation.z = -k * 0.4;
      }
      g.add(seat(e, frontAnchor(targets, 0, ey + 0.05)));
      break;
    }
    case 'slime':
      // Eyes on stalks, growing out of the top-front of the head.
      for (const side of [-1, 1]) {
        const a = topAnchor(targets, side * 0.15, 0.18);
        const stalk = new THREE.Group();
        stalk.position.copy(a.point);
        stalk.rotation.z = side * -0.2;
        add(stalk, new THREE.CylinderGeometry(0.02, 0.028, 0.16, 10), skinMat('slime'), 0, 0.08, 0);
        add(stalk, new THREE.SphereGeometry(0.07, 16, 12), glossy(0xfffaf4), 0, 0.19, 0);
        add(stalk, new THREE.SphereGeometry(0.032, 12, 8), glossy(INK), 0, 0.19, 0.055);
        g.add(stalk);
      }
      break;
  }
  return g;
}

function buildMouth(id: MonsterId, targets: THREE.Mesh[]): THREE.Group {
  const g = new THREE.Group();
  const ink = vinyl(SOCKET, 0.8);
  const my = id === 'cyclops' ? -0.2 : -0.17;
  const a = frontAnchor(targets, 0, my);
  const m = new THREE.Group();
  /** A curved slot: a flattened torus arc lying on the face. */
  const arc = (r: number, tube: number, mat: THREE.Material, y = 0, open = Math.PI) => {
    const t = add(m, new THREE.TorusGeometry(r, tube, 8, 20, open), mat, 0, y + r * 0.55, 0);
    t.rotation.z = Math.PI + (Math.PI - open) / 2;
    t.scale.z = 0.5;
    return t;
  };
  switch (id) {
    case 'vampire':
      arc(0.065, 0.013, ink);
      for (const sx of [-1, 1]) add(m, new THREE.ConeGeometry(0.016, 0.05, 8), vinyl(0xfffaf4, 0.4), sx * 0.04, -0.03, 0.006).rotation.x = Math.PI;
      break;
    case 'werewolf': {
      arc(0.095, 0.02, ink, -0.01);
      for (let i = -2; i <= 2; i++) {
        const t = add(m, new THREE.ConeGeometry(0.014, 0.04, 6), vinyl(0xfffaf4, 0.4), i * 0.034, -0.025 - (2 - Math.abs(i)) * 0.006, 0.012);
        t.rotation.x = Math.PI;
      }
      break;
    }
    case 'mummy':
      add(m, new THREE.CapsuleGeometry(0.012, 0.08, 4, 8), ink).rotation.z = Math.PI / 2;
      break;
    case 'zombie':
      add(m, new THREE.CapsuleGeometry(0.01, 0.15, 4, 8), ink).rotation.z = Math.PI / 2 + 0.08;
      for (let i = -1; i <= 1; i++) add(m, new THREE.CapsuleGeometry(0.007, 0.045, 2, 4), ink, i * 0.05, i * 0.004, 0.006);
      break;
    case 'ghost':
      add(m, new THREE.SphereGeometry(1, 16, 12), ink).scale.set(0.04, 0.055, 0.02);
      break;
    case 'witch': {
      const s = arc(0.06, 0.012, ink);
      s.rotation.z += 0.35;
      s.position.x += 0.025;
      add(m, new THREE.BoxGeometry(0.022, 0.026, 0.01), vinyl(0xfffaf4, 0.4), 0.045, -0.006, 0.008);
      break;
    }
    case 'skeleton':
      add(m, new THREE.SphereGeometry(1, 16, 10), ink).scale.set(0.15, 0.04, 0.02);
      for (let i = -3; i <= 3; i++) add(m, new THREE.BoxGeometry(0.032, 0.05, 0.02), vinyl(0xfffaf4, 0.45), i * 0.038, 0, 0.012);
      break;
    case 'pumpkin': {
      // Carved jagged grin: a dark recess with a glowing inner cut.
      const grin = (scale: number) => {
        const s = new THREE.Shape();
        s.moveTo(-0.13, 0.03);
        const teeth = [[-0.08, -0.01], [-0.05, 0.02], [0.0, -0.02], [0.05, 0.02], [0.08, -0.01], [0.13, 0.03]];
        for (const [x, y] of teeth) s.lineTo(x, y);
        s.quadraticCurveTo(0.06, -0.09, 0, -0.08);
        s.quadraticCurveTo(-0.06, -0.09, -0.13, 0.03);
        const geo = new THREE.ShapeGeometry(s);
        geo.scale(scale, scale, 1);
        return geo;
      };
      add(m, grin(1), vinyl(SOCKET, 0.9), 0, 0.02, 0.004);
      add(m, grin(0.8), glow(0xffcf4a, 1.3), 0, 0.02, 0.008);
      break;
    }
    case 'cyclops': {
      add(m, new THREE.SphereGeometry(1, 18, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), ink).scale.set(0.1, 0.07, 0.025);
      add(m, new THREE.SphereGeometry(1, 14, 10), vinyl(0xe8768f, 0.5), 0.02, -0.045, 0.012).scale.set(0.045, 0.03, 0.02);
      break;
    }
    case 'slime':
      for (const sx of [-1, 1]) {
        const t = add(m, new THREE.TorusGeometry(0.024, 0.009, 6, 12, Math.PI), ink, sx * 0.024, 0.012, 0);
        t.rotation.z = Math.PI;
      }
      break;
  }
  g.add(seat(m, a, 0.002));
  return g;
}

// -------------------------------------------------------------- headwear
function buildHair(id: MonsterId, targets: THREE.Mesh[]): THREE.Group {
  const g = new THREE.Group();
  const m = MONSTERS[id];
  const top = topAnchor(targets).point;
  const crown = top.y - HEAD.y;
  switch (id) {
    case 'vampire': {
      const hair = plastic(0x2a1c38, { roughness: 0.42 });
      const cap = add(g, new THREE.SphereGeometry(HEAD_R * 1.04, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.42), hair, 0, crown - HEAD_R * 1.0, -0.02);
      cap.scale.y = 1.02;
      const peak = add(g, new THREE.ConeGeometry(0.075, 0.18, 4), hair, 0, crown * 0.62, HEAD_R * 0.74);
      peak.rotation.x = Math.PI + 0.7;
      break;
    }
    case 'werewolf': {
      const fur = vinyl(m.skin, 0.75);
      for (const sx of [-1, 1]) {
        const ear = add(g, new THREE.ConeGeometry(0.13, 0.3, 8), fur, sx * 0.28, crown * 0.82, 0);
        ear.rotation.z = sx * -0.45;
        ear.scale.z = 0.6;
        const inner = add(g, new THREE.ConeGeometry(0.065, 0.17, 8), vinyl(0xf0a8b8, 0.6), sx * 0.27, crown * 0.8, 0.05);
        inner.rotation.z = sx * -0.45;
        inner.scale.z = 0.4;
      }
      for (let i = -1; i <= 1; i++) add(g, new THREE.ConeGeometry(0.06, 0.15, 6), fur, i * 0.07, crown + 0.02, 0.12).rotation.x = 0.55;
      break;
    }
    case 'mummy': {
      const wrap = wrapMat();
      const knot = add(g, new THREE.SphereGeometry(0.05, 10, 8), wrap, 0.12, crown + 0.01, -0.12);
      knot.scale.set(1, 0.8, 1);
      for (const [rx, rz] of [[0.6, 0.4], [0.9, -0.3]]) {
        const tail = add(g, new THREE.CapsuleGeometry(0.03, 0.2, 4, 8), wrap, 0.16, crown - 0.06, -0.2);
        tail.rotation.set(rx, 0, rz);
        tail.scale.z = 0.35;
      }
      break;
    }
    case 'zombie': {
      const hair = vinyl(0x3c6436, 0.7);
      for (let i = 0; i < 7; i++) {
        const t = -0.6 + i * 0.2;
        const spike = add(g, new THREE.ConeGeometry(0.065, 0.2, 6), hair, Math.sin(t) * 0.24, crown + 0.02 - Math.abs(t) * 0.12, Math.cos(t) * 0.06 - 0.04);
        spike.rotation.z = -t * 0.9;
        spike.rotation.x = -0.25;
      }
      break;
    }
    case 'ghost': {
      const s = skinMat('ghost');
      const curl = add(g, new THREE.TorusGeometry(0.06, 0.028, 10, 18, Math.PI * 1.5), s, 0, crown + 0.1, 0);
      curl.rotation.y = Math.PI / 2;
      add(g, new THREE.ConeGeometry(0.05, 0.12, 12), s, 0, crown + 0.02, 0);
      break;
    }
    case 'witch': {
      const hat = vinyl(0x2a2230, 0.55);
      const brimY = crown * 0.6;
      add(g, new THREE.CylinderGeometry(0.62, 0.64, 0.035, 32), hat, 0, brimY, 0);
      const cone = add(g, lathe([[0.001, 0.75], [0.06, 0.6], [0.16, 0.35], [0.3, 0.08], [0.34, 0], [0.001, 0]], 24), hat, 0, brimY, 0);
      cone.rotation.z = -0.12;
      add(g, new THREE.CylinderGeometry(0.335, 0.335, 0.08, 24), vinyl(m.accent), 0, brimY + 0.05, 0);
      add(g, new THREE.BoxGeometry(0.1, 0.08, 0.025), plastic(0xffcf4a, { metalness: 0.4, roughness: 0.3 }), 0, brimY + 0.05, 0.34);
      break;
    }
    case 'skeleton': {
      const bow = vinyl(m.accent, 0.5);
      const b = new THREE.Group();
      for (const sx of [-1, 1]) {
        const loop = add(b, new THREE.SphereGeometry(0.08, 12, 10), bow, sx * 0.08, 0, 0);
        loop.scale.set(1.1, 0.75, 0.45);
      }
      add(b, new THREE.SphereGeometry(0.035, 10, 8), bow);
      const at = topAnchor(targets, 0.2, 0.08);
      b.position.copy(at.point).sub(HEAD);
      b.rotation.z = -0.5;
      g.add(b);
      break;
    }
    case 'pumpkin': {
      add(g, new THREE.CylinderGeometry(0.035, 0.055, 0.18, 8), vinyl(0x4e7a3a, 0.8), 0, crown + 0.07, 0).rotation.z = 0.25;
      const leaf = add(g, new THREE.SphereGeometry(0.12, 12, 8), vinyl(0x6fbf5a), 0.14, crown + 0.04, 0);
      leaf.scale.set(1, 0.22, 0.6);
      leaf.rotation.z = -0.3;
      const vine = add(g, new THREE.TorusGeometry(0.055, 0.011, 6, 18, Math.PI * 1.6), vinyl(0x4e7a3a), -0.1, crown + 0.08, 0);
      vine.rotation.y = 0.5;
      break;
    }
    case 'cyclops': {
      const horn = add(g, new THREE.ConeGeometry(0.065, 0.22, 12), vinyl(0xfff1c9, 0.45), 0, crown + 0.1, 0.03);
      horn.rotation.x = 0.2;
      for (let i = 0; i < 3; i++) add(g, new THREE.TorusGeometry(0.055 - i * 0.014, 0.009, 4, 14), vinyl(0xd9c4a3), 0, crown + 0.03 + i * 0.05, 0.03 + i * 0.01).rotation.x = Math.PI / 2;
      break;
    }
    case 'slime': {
      const s = skinMat('slime');
      add(g, new THREE.CylinderGeometry(0.014, 0.024, 0.24, 8), s, 0, crown + 0.11, -0.05);
      add(g, new THREE.SphereGeometry(0.055, 12, 10), glow(m.accent, 0.7), 0, crown + 0.25, -0.05);
      break;
    }
  }
  g.position.copy(HEAD);
  return g;
}

function buildExtra(id: MonsterId): THREE.Group {
  const g = new THREE.Group();
  const m = MONSTERS[id];
  const back = -0.27;
  switch (id) {
    case 'vampire':
    case 'pumpkin': {
      const wing = new THREE.Shape();
      if (id === 'vampire') {
        wing.moveTo(0, 0);
        wing.lineTo(0.55, 0.25);
        wing.quadraticCurveTo(0.5, 0.05, 0.48, -0.05);
        wing.quadraticCurveTo(0.38, 0.02, 0.32, -0.08);
        wing.quadraticCurveTo(0.22, -0.02, 0.15, -0.1);
        wing.quadraticCurveTo(0.08, -0.03, 0, -0.08);
      } else {
        wing.moveTo(0, 0);
        wing.quadraticCurveTo(0.25, 0.35, 0.5, 0.15);
        wing.quadraticCurveTo(0.35, -0.1, 0, -0.06);
      }
      wing.closePath();
      const geo = new THREE.ExtrudeGeometry(wing, { depth: 0.025, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2 });
      const mat = vinyl(id === 'vampire' ? 0x3b2a4a : 0x6fbf5a, 0.6);
      for (const sx of [-1, 1]) {
        const w = add(g, geo, mat, sx * 0.1, TORSO_Y + 0.2, back);
        w.scale.x = sx;
        w.rotation.y = sx * 0.4;
      }
      break;
    }
    case 'werewolf': {
      const fur = vinyl(m.skin, 0.75);
      const tail = add(g, new THREE.CapsuleGeometry(0.1, 0.3, 4, 12), fur, 0, TORSO_Y - 0.25, back - 0.15);
      tail.rotation.x = -0.9;
      add(g, new THREE.SphereGeometry(0.1, 12, 10), vinyl(0xe0c7a6, 0.8), 0, TORSO_Y - 0.07, back - 0.32);
      break;
    }
    case 'mummy': {
      const wrap = wrapMat();
      for (const sx of [-1, 1]) {
        const r = add(g, new THREE.BoxGeometry(0.08, 0.5, 0.015), wrap, sx * 0.12, TORSO_Y - 0.1, back);
        r.rotation.set(0.3, 0, sx * 0.25);
      }
      break;
    }
    case 'zombie': {
      const cape = add(g, new THREE.CylinderGeometry(0.3, 0.45, 0.75, 16, 1, true, Math.PI * 0.6, Math.PI * 0.8), plastic(0x5e3a8f, { roughness: 0.7, side: THREE.DoubleSide }), 0, TORSO_Y - 0.05, 0);
      cape.rotation.y = Math.PI;
      for (let i = 0; i < 4; i++) add(g, new THREE.ConeGeometry(0.05, 0.12, 4), vinyl(0x5e3a8f, 0.7), -0.24 + i * 0.16, TORSO_Y - 0.45, -0.38 + Math.abs(i - 1.5) * 0.03).rotation.x = Math.PI;
      break;
    }
    case 'ghost': {
      const s = skinMat('ghost');
      const tail = add(g, new THREE.ConeGeometry(0.2, 0.6, 16), s, 0, TORSO_Y - 0.2, back - 0.2);
      tail.rotation.x = -2.2;
      add(g, new THREE.SphereGeometry(0.06, 10, 8), s, 0, TORSO_Y - 0.48, back - 0.52);
      break;
    }
    case 'witch': {
      const stick = add(g, new THREE.CylinderGeometry(0.025, 0.025, 1.3, 10), vinyl(0x8a5a32, 0.7), 0, TORSO_Y + 0.1, back - 0.05);
      stick.rotation.z = 0.7;
      const bristle = add(g, new THREE.ConeGeometry(0.14, 0.32, 12), vinyl(0xe8c060, 0.85), -0.52, TORSO_Y - 0.34, back - 0.05);
      bristle.rotation.z = 0.7 + Math.PI;
      add(g, new THREE.TorusGeometry(0.06, 0.015, 6, 14), vinyl(m.accent), -0.42, TORSO_Y - 0.24, back - 0.05).rotation.set(Math.PI / 2, 0, 0.7);
      break;
    }
    case 'skeleton': {
      const bone = vinyl(BONE, 0.55);
      for (const sx of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const ang = 0.3 + i * 0.32;
          const b = add(g, boneGeometry(0.36 - i * 0.04, 0.022), bone, sx * (0.12 + Math.sin(ang) * 0.18), TORSO_Y + 0.22 + Math.cos(ang) * 0.18, back);
          b.rotation.z = -sx * ang;
        }
      }
      break;
    }
    case 'cyclops': {
      const tailMat = vinyl(m.cloth, 0.5);
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, TORSO_Y - 0.3, back), new THREE.Vector3(0.1, TORSO_Y - 0.4, back - 0.25),
        new THREE.Vector3(0.3, TORSO_Y - 0.25, back - 0.35), new THREE.Vector3(0.4, TORSO_Y + 0.02, back - 0.3),
      ]);
      add(g, new THREE.TubeGeometry(curve, 24, 0.03, 10), tailMat);
      const tip = add(g, new THREE.ConeGeometry(0.08, 0.14, 3), tailMat, 0.41, TORSO_Y + 0.1, back - 0.3);
      tip.scale.z = 0.4;
      break;
    }
    case 'slime': {
      const s = skinMat('slime');
      add(g, new THREE.SphereGeometry(0.26, 18, 14), s, 0, TORSO_Y - 0.05, back - 0.1).scale.set(1, 1.2, 0.6);
      add(g, new THREE.SphereGeometry(0.06, 10, 8), s, 0.12, TORSO_Y - 0.35, back - 0.1).scale.y = 1.6;
      add(g, new THREE.SphereGeometry(0.05, 10, 8), glow(m.accent, 0.5), -0.05, TORSO_Y + 0.05, back - 0.22);
      break;
    }
  }
  return g;
}

/**
 * Assemble the monster. Missing body parts show as faint ghostly
 * silhouettes (when `placeholders` is on) so you can see what is left.
 * Face features and headwear are seated by raycasting against whichever
 * head is present, so they sit flush on lobed, squashed or stretched heads.
 */
/** Stable per-monster tweaks (no seed: the plain sculpt). */
interface Variation { head: number; torsoW: number; torsoH: number; arm: number[]; armTilt: number[]; leg: number[]; legSplay: number[]; tint: () => [number, number, number] }

function variation(seed?: number): Variation {
  if (!seed) return { head: 1, torsoW: 1, torsoH: 1, arm: [1, 1], armTilt: [0, 0], leg: [1, 1], legSplay: [0, 0], tint: () => [0, 0, 0] };
  const r = mulberry32(seed);
  const span = (a: number, b: number) => a + r() * (b - a);
  const armLen = span(0.88, 1.15);
  const legW = span(0.88, 1.18);
  const tilt = span(-0.12, 0.2);
  const splay = span(0, 0.09);
  // A touch of asymmetry: a stitched-together monster is never quite even.
  return {
    head: span(0.94, 1.12),
    torsoW: span(0.9, 1.15),
    torsoH: span(0.95, 1.1),
    arm: [armLen * span(0.94, 1.06), armLen * span(0.94, 1.06)],
    armTilt: [tilt + span(-0.06, 0.06), tilt + span(-0.06, 0.06)],
    leg: [legW, legW * span(0.95, 1.05)],
    legSplay: [splay, splay],
    tint: () => [span(-0.03, 0.03), span(-0.08, 0.08), span(-0.05, 0.05)],
  };
}

/** Give each material of the figure its own slight colour shift (shared materials stay matched). */
function tintFigure(root: THREE.Object3D, v: Variation): void {
  const swapped = new Map<THREE.Material, THREE.Material>();
  const hsl = { h: 0, s: 0, l: 0 };
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !(o.material instanceof THREE.MeshStandardMaterial)) return;
    const m = o.material;
    let next = swapped.get(m);
    if (!next) {
      m.color.getHSL(hsl);
      // Leave ink, glossy black and see-through stand-ins alone.
      if (hsl.l < 0.18 || (m.transparent && m.opacity < 0.5)) next = m;
      else {
        const c = m.clone();
        const [dh, ds, dl] = v.tint();
        c.color.offsetHSL(dh, ds, dl);
        c.userData.owned = true;
        next = c;
      }
      swapped.set(m, next);
    }
    o.material = next;
  });
}

export function buildMonster(build: MonsterBuild, placeholders = true): THREE.Group {
  const root = new THREE.Group();
  const v = variation(build.seed);
  const ph = ghostly();
  const placeholder = (geo: THREE.BufferGeometry, x: number, y: number, z = 0, rz = 0, isSurface = false) => {
    if (!placeholders && !isSurface) return;
    const m = add(root, geo, ph, x, y, z);
    m.rotation.z = rz;
    m.castShadow = false;
    if (isSurface) {
      surface(m);
      m.visible = placeholders;
    }
  };
  if (build.head) {
    const head = buildHead(build.head);
    head.scale.setScalar(v.head);
    root.add(head);
  }
  // Without a head the features still need something to sit on.
  else placeholder(new THREE.SphereGeometry(HEAD_R, 24, 16), HEAD.x, HEAD.y, 0, 0, true);
  if (build.torso) {
    const t = buildTorso(build.torso);
    t.scale.set(v.torsoW, v.torsoH, v.torsoW);
    root.add(t);
  }
  else placeholder(new THREE.CapsuleGeometry(0.3, 0.22, 6, 12), 0, TORSO_Y);
  ([['leftArm', -1], ['rightArm', 1]] as const).forEach(([slot, side]) => {
    const id = build[slot];
    if (id) {
      const k = side < 0 ? 0 : 1;
      const arm = buildArm(id, side);
      arm.position.x *= v.torsoW;
      arm.scale.setScalar(v.arm[k]);
      arm.rotation.z += side * v.armTilt[k];
      root.add(arm);
    }
    else placeholder(new THREE.CapsuleGeometry(0.085, 0.34, 4, 8), side * (SHOULDER + 0.1), TORSO_Y + 0.05, 0, side * 0.42);
  });
  ([['leftLeg', -1], ['rightLeg', 1]] as const).forEach(([slot, side]) => {
    const id = build[slot];
    if (id) {
      const k = side < 0 ? 0 : 1;
      const leg = buildLeg(id, side);
      leg.scale.set(v.leg[k], 1, v.leg[k]);
      leg.rotation.z = side * v.legSplay[k];
      root.add(leg);
    }
    else placeholder(new THREE.CapsuleGeometry(0.1, 0.26, 4, 8), side * HIP, 0.29);
  });

  const targets = surfaceMeshes(root);
  const headSkin = build.head ? skinMat(build.head) : ph;
  if (build.head) headDetails(root, targets, build.head);
  if (build.eyes) root.add(buildEyes(build.eyes, targets, headSkin));
  if (build.mouth) root.add(buildMouth(build.mouth, targets));
  if (build.hair) root.add(buildHair(build.hair, targets));
  if (build.extra) root.add(buildExtra(build.extra));

  // Frankenstein hardware: neck bolts and stitched seams where pieces meet.
  if (build.head || build.torso) {
    const bolt = plastic(0x8d93a8, { roughness: 0.3, metalness: 0.6 });
    for (const sx of [-1, 1]) {
      const b = add(root, new THREE.CylinderGeometry(0.028, 0.028, 0.1, 12), bolt, sx * 0.2, TORSO_Y + 0.37, 0);
      b.rotation.z = Math.PI / 2;
      add(root, new THREE.CylinderGeometry(0.045, 0.045, 0.035, 6), bolt, sx * 0.255, TORSO_Y + 0.37, 0).rotation.z = Math.PI / 2;
    }
  }
  if (build.torso) {
    for (const sx of [-1, 1]) {
      if (build[sx < 0 ? 'leftArm' : 'rightArm']) seam(root, 0.095, 'x', new THREE.Vector3(sx * (SHOULDER - 0.01) * v.torsoW, TORSO_Y + 0.22, 0));
      if (build[sx < 0 ? 'leftLeg' : 'rightLeg']) seam(root, 0.105, 'y', new THREE.Vector3(sx * HIP, 0.43, 0));
    }
  }
  if (build.seed) tintFigure(root, v);
  return root;
}

// ---------------------------------------------------------------- render
/** A round, bevelled display base with a name band, like a collectible figure. */
export function buildPlinth(name?: string): THREE.Group {
  const g = new THREE.Group();
  const base = add(g, lathe([[0.001, -0.2], [0.9, -0.2], [0.95, -0.17], [0.96, -0.06], [0.92, -0.02], [0.86, 0], [0.001, 0]], 48), vinyl(0x3a2a4f, 0.5));
  base.castShadow = false;
  add(g, new THREE.TorusGeometry(0.93, 0.018, 8, 64), vinyl(BONE_DARK, 0.45), 0, -0.11, 0).rotation.x = Math.PI / 2;
  // Grass-like top with a few grave-dirt speckles.
  const top = add(g, new THREE.CylinderGeometry(0.86, 0.86, 0.02, 48), vinyl(0x6a5a8f, 0.75), 0, 0.0, 0);
  top.receiveShadow = true;
  if (name) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 64;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#f6ecd4';
    ctx.fillRect(0, 0, 512, 64);
    ctx.fillStyle = '#3a2a4f';
    ctx.font = '700 40px Fredoka, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.toUpperCase(), 256, 34, 480);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.965, 0.965, 0.09, 48, 1, true, -0.55, 1.1), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
    band.position.y = -0.1;
    g.add(band);
  }
  return g;
}

/** Toy-photo lighting: warm key from above-front, cool lavender rim, soft fill. */
export function addToyLights(scene: THREE.Scene): void {
  scene.add(new THREE.HemisphereLight(0xfff4ea, 0x4a3a6a, 1.25));
  const key = new THREE.DirectionalLight(0xffe8cc, 2.6);
  key.position.set(1.6, 4.5, 3.2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 4;
  key.shadow.bias = -0.0005;
  const sc = key.shadow.camera as THREE.OrthographicCamera;
  sc.left = -2; sc.right = 2; sc.top = 3; sc.bottom = -1;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xb9a0ff, 2.0);
  rim.position.set(-3, 2.5, -3);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffd0e0, 0.5);
  fill.position.set(-2.5, 1, 3);
  scene.add(fill);
}

/** Free a figure built for a one-off render (shared bone geometry stays alive). */
export function disposeFigure(figure: THREE.Object3D): void {
  figure.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (!o.geometry.userData.shared) o.geometry.dispose();
    const mat = o.material as THREE.MeshStandardMaterial;
    if (mat.map) { mat.map.dispose(); mat.dispose(); }
    else if (mat.userData.owned) mat.dispose();
  });
}

/** Renders monsters to images with a private offscreen renderer. */
export class MonsterPortrait {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  private canvas = document.createElement('canvas');

  constructor() {
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.0;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    } catch (err) {
      console.warn('Monster portrait renderer unavailable', err);
    }
    addToyLights(this.scene);
  }

  /** Square transparent canvas of the monster, `size` px. Returns null without WebGL. */
  render(build: MonsterBuild, size: number, opts: { placeholders?: boolean; yaw?: number; name?: string; plinth?: boolean } = {}): HTMLCanvasElement | null {
    if (!this.renderer) return null;
    const figure = new THREE.Group();
    const monster = buildMonster(build, opts.placeholders ?? true);
    figure.add(monster);
    if (opts.plinth ?? true) figure.add(buildPlinth(opts.name));
    figure.rotation.y = opts.yaw ?? -0.35;
    this.scene.add(figure);
    this.renderer.setSize(size, size, false);
    // Frame the whole figure (hats, wings and the base) with a little margin.
    const box = new THREE.Box3().setFromObject(figure);
    const center = box.getCenter(new THREE.Vector3());
    const dims = box.getSize(new THREE.Vector3());
    const half = Math.max(dims.y, dims.x) / 2 * 1.06;
    const dist = half / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) + dims.z / 2;
    this.camera.position.set(center.x, center.y + dist * 0.2, center.z + dist);
    this.camera.lookAt(center);
    this.renderer.render(this.scene, this.camera);
    this.scene.remove(figure);
    disposeFigure(figure);
    const out = document.createElement('canvas');
    out.width = out.height = size;
    out.getContext('2d')!.drawImage(this.canvas, 0, 0);
    return out;
  }
}
