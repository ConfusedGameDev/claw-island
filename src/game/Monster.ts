import * as THREE from 'three';
import { plastic } from '../scene/Materials';
import { boneGeometry, BONE } from '../scene/Bones';

/**
 * Frankenstein's monster, built from ten body pieces. Every cleared Spooky
 * Night island awards the next slot, taken from a random monster.
 */
export const SLOTS = ['head', 'torso', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg', 'eyes', 'mouth', 'hair', 'extra'] as const;
export type Slot = typeof SLOTS[number];

export const MONSTER_IDS = ['vampire', 'werewolf', 'mummy', 'zombie', 'ghost', 'witch', 'skeleton', 'pumpkin', 'cyclops', 'slime'] as const;
export type MonsterId = typeof MONSTER_IDS[number];

export type MonsterBuild = Partial<Record<Slot, MonsterId>>;

interface MonsterStyle {
  name: string;
  emoji: string;
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
  vampire: { name: 'Vampire', emoji: '🧛', skin: 0xf3e6ff, cloth: 0x2b1d3a, accent: 0xd9304f, hairName: 'slick hair', extraName: 'bat wings', syllables: ['Drac', 'ula'] },
  werewolf: { name: 'Werewolf', emoji: '🐺', skin: 0x9a7a5c, cloth: 0x5b6b8c, accent: 0xffd23f, hairName: 'wolf ears', extraName: 'fluffy tail', syllables: ['Wolf', 'fang'] },
  mummy: { name: 'Mummy', emoji: '🧻', skin: 0xf2e6c9, cloth: 0xe2d3b0, accent: 0x6fe3a0, hairName: 'bandage bow', extraName: 'ribbons', syllables: ['Mum', 'wrap'] },
  zombie: { name: 'Zombie', emoji: '🧟', skin: 0x9fd98a, cloth: 0x6a7fb0, accent: 0xff7f9e, hairName: 'messy hair', extraName: 'tattered cape', syllables: ['Zom', 'bie'] },
  ghost: { name: 'Ghost', emoji: '👻', skin: 0xf7f8ff, cloth: 0xf7f8ff, accent: 0x9fb4ff, clear: true, hairName: 'wispy curl', extraName: 'ghostly tail', syllables: ['Boo', 'ghost'] },
  witch: { name: 'Witch', emoji: '🧙', skin: 0xa8e6a0, cloth: 0x6b3fa0, accent: 0xff9a3c, hairName: 'pointy hat', extraName: 'broomstick', syllables: ['Hex', 'witch'] },
  skeleton: { name: 'Skeleton', emoji: '💀', skin: BONE, cloth: BONE, accent: 0xff7fb0, hairName: 'cute bow', extraName: 'bone wings', syllables: ['Bone', 'bones'] },
  pumpkin: { name: 'Pumpkin', emoji: '🎃', skin: 0xff9a3c, cloth: 0x4fae5a, accent: 0xffd23f, hairName: 'stem', extraName: 'leaf wings', syllables: ['Pump', 'kin'] },
  cyclops: { name: 'Cyclops', emoji: '👁️', skin: 0xc9a0ff, cloth: 0xff7fb0, accent: 0xffffff, hairName: 'horn', extraName: 'devil tail', syllables: ['Cy', 'clops'] },
  slime: { name: 'Slime', emoji: '🟢', skin: 0x8ff0c0, cloth: 0x8ff0c0, accent: 0x3fbf8a, clear: true, hairName: 'antenna', extraName: 'slime puddle', syllables: ['Goo', 'slime'] },
};

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

export function rollPiece(rng: () => number): MonsterId {
  return MONSTER_IDS[Math.floor(rng() * MONSTER_IDS.length) % MONSTER_IDS.length];
}

/** A cute default name: the head's first syllable plus the body's last. */
export function monsterName(build: MonsterBuild): string {
  const a = MONSTERS[build.head ?? 'zombie'].syllables[0];
  const b = MONSTERS[build.torso ?? 'zombie'].syllables[1];
  const name = a + b.toLowerCase();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function isComplete(build: MonsterBuild): boolean {
  return SLOTS.every((s) => build[s]);
}

// ------------------------------------------------------------------ build
const INK = 0x2a2230;
const glowMat = (hex: number, i = 1.4) => plastic(hex, { emissive: hex, emissiveIntensity: i, roughness: 0.3 });
const skinMat = (id: MonsterId) => {
  const m = MONSTERS[id];
  return m.clear ? plastic(m.skin, { roughness: 0.15, transparent: true, opacity: 0.9 }) : plastic(m.skin, { roughness: 0.5 });
};
const clothMat = (id: MonsterId) => {
  const m = MONSTERS[id];
  return m.clear ? plastic(m.cloth, { roughness: 0.15, transparent: true, opacity: 0.9 }) : plastic(m.cloth, { roughness: 0.6 });
};
const ghostly = () => plastic(0xb9a8e6, { roughness: 0.6, transparent: true, opacity: 0.22 });

function add(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

/** Wrap a capsule-ish part in bandage bands. */
function bandages(parent: THREE.Object3D, radius: number, y0: number, y1: number, count: number, tilt = 0.25): void {
  const mat = plastic(0xfff6e0, { roughness: 0.7 });
  for (let i = 0; i < count; i++) {
    const y = y0 + ((i + 0.5) / count) * (y1 - y0);
    const b = add(parent, new THREE.TorusGeometry(radius, radius * 0.12, 6, 20), mat, 0, y, 0);
    b.rotation.x = Math.PI / 2 + (i % 2 ? tilt : -tilt);
  }
}

/** A stitched seam: a dark ring with little cross ticks. */
function stitches(parent: THREE.Object3D, radius: number, axis: 'x' | 'y', at: THREE.Vector3): void {
  const mat = plastic(INK, { roughness: 0.6 });
  const g = new THREE.Group();
  g.position.copy(at);
  const ring = add(g, new THREE.TorusGeometry(radius, 0.012, 4, 24), mat);
  ring.rotation.x = Math.PI / 2;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const t = add(g, new THREE.BoxGeometry(0.014, 0.07, 0.014), mat, Math.cos(a) * radius, 0, Math.sin(a) * radius);
    t.rotation.y = -a;
  }
  if (axis === 'x') g.rotation.z = Math.PI / 2;
  parent.add(g);
}

// Body layout (feet at y = 0).
const HEAD = new THREE.Vector3(0, 1.72, 0);
const HEAD_R = 0.48;
const TORSO_Y = 0.86;
const SHOULDER = 0.36;
const HIP = 0.16;

function buildHead(id: MonsterId): THREE.Group {
  const g = new THREE.Group();
  const s = skinMat(id);
  switch (id) {
    case 'pumpkin':
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const lobe = add(g, new THREE.SphereGeometry(HEAD_R * 0.62, 16, 12), s, Math.cos(a) * HEAD_R * 0.4, 0, Math.sin(a) * HEAD_R * 0.4);
        lobe.scale.y = 1.25;
      }
      break;
    case 'skeleton': {
      add(g, new THREE.SphereGeometry(HEAD_R, 22, 16), s).scale.set(1, 0.95, 0.95);
      add(g, new THREE.SphereGeometry(HEAD_R * 0.66, 16, 12), s, 0, -HEAD_R * 0.55, HEAD_R * 0.18).scale.set(1, 0.6, 0.9);
      const nose = add(g, new THREE.ConeGeometry(0.05, 0.08, 3), plastic(INK), 0, -0.07, HEAD_R * 0.97);
      nose.rotation.x = Math.PI;
      break;
    }
    case 'werewolf': {
      add(g, new THREE.SphereGeometry(HEAD_R, 22, 16), s);
      add(g, new THREE.SphereGeometry(HEAD_R * 0.45, 16, 12), plastic(0xe6cfb0, { roughness: 0.6 }), 0, -0.16, HEAD_R * 0.78).scale.set(1.2, 0.75, 0.8);
      add(g, new THREE.SphereGeometry(0.06, 10, 8), plastic(INK, { roughness: 0.3 }), 0, -0.06, HEAD_R * 1.12);
      // Fluffy cheek tufts.
      for (const sx of [-1, 1]) add(g, new THREE.ConeGeometry(0.1, 0.18, 6), s, sx * HEAD_R * 0.95, -0.12, 0.1).rotation.z = sx * -1.9;
      break;
    }
    case 'mummy':
      add(g, new THREE.SphereGeometry(HEAD_R, 22, 16), s);
      bandages(g, HEAD_R * 1.0, -HEAD_R * 0.6, HEAD_R * 0.7, 4, 0.18);
      break;
    case 'ghost':
      add(g, new THREE.SphereGeometry(HEAD_R, 22, 16), s).scale.set(1, 1.08, 1);
      break;
    case 'witch': {
      add(g, new THREE.SphereGeometry(HEAD_R, 22, 16), s);
      const nose = add(g, new THREE.ConeGeometry(0.07, 0.24, 10), s, 0, -0.08, HEAD_R * 1.02);
      nose.rotation.x = Math.PI / 2 + 0.3;
      add(g, new THREE.SphereGeometry(0.025, 8, 6), plastic(0x6fbf6a), 0.04, -0.02, HEAD_R * 1.12);
      break;
    }
    case 'zombie': {
      add(g, new THREE.SphereGeometry(HEAD_R, 22, 16), s);
      const patch = add(g, new THREE.SphereGeometry(HEAD_R * 1.005, 16, 12, 0.2, 0.9, 0.5, 0.7), plastic(0x7fbf6a, { roughness: 0.6 }));
      patch.rotation.y = 0.2;
      break;
    }
    case 'slime': {
      add(g, new THREE.SphereGeometry(HEAD_R, 22, 16), s).scale.set(1.08, 0.92, 1);
      for (const [x, z] of [[-0.25, 0.32], [0.3, 0.25], [0.05, 0.4]]) add(g, new THREE.SphereGeometry(0.07, 10, 8), s, x, -HEAD_R * 0.8, z).scale.y = 1.6;
      break;
    }
    case 'vampire': {
      add(g, new THREE.SphereGeometry(HEAD_R, 22, 16), s);
      for (const sx of [-1, 1]) {
        const ear = add(g, new THREE.ConeGeometry(0.08, 0.22, 8), s, sx * HEAD_R * 0.98, 0.02, 0);
        ear.rotation.z = sx * -1.3;
      }
      break;
    }
    case 'cyclops':
      add(g, new THREE.SphereGeometry(HEAD_R, 22, 16), s).scale.set(1.05, 0.95, 1);
      break;
  }
  // Rosy cheeks on anything with a face.
  if (id !== 'skeleton' && id !== 'pumpkin') {
    for (const sx of [-1, 1]) {
      const blush = add(g, new THREE.SphereGeometry(0.07, 10, 8), plastic(0xff9fb0, { roughness: 0.6, transparent: true, opacity: 0.8 }), sx * 0.27, -0.12, HEAD_R * 0.83);
      blush.scale.z = 0.35;
    }
  }
  // Frankenstein forehead scar.
  if (id !== 'ghost' && id !== 'slime') {
    const scar = new THREE.Group();
    scar.position.set(0.12, 0.24, HEAD_R * 0.86);
    scar.rotation.x = -0.5;
    const mat = plastic(INK, { roughness: 0.6 });
    add(scar, new THREE.BoxGeometry(0.2, 0.012, 0.012), mat);
    for (let i = -2; i <= 2; i++) add(scar, new THREE.BoxGeometry(0.012, 0.05, 0.012), mat, i * 0.04, 0, 0);
    scar.rotation.z = -0.15;
    g.add(scar);
  }
  g.position.copy(HEAD);
  return g;
}

function buildTorso(id: MonsterId): THREE.Group {
  const g = new THREE.Group();
  const c = clothMat(id);
  const s = skinMat(id);
  const m = MONSTERS[id];
  switch (id) {
    case 'skeleton': {
      const bone = plastic(BONE, { roughness: 0.55 });
      add(g, boneGeometry(0.6, 0.045), bone, 0, 0.02, -0.05);
      for (let i = 0; i < 4; i++) {
        const r = add(g, new THREE.TorusGeometry(0.24 - i * 0.025, 0.028, 6, 20, Math.PI * 1.6), bone, 0, 0.22 - i * 0.1, 0);
        r.rotation.set(Math.PI / 2, 0, Math.PI * 0.7);
      }
      add(g, new THREE.SphereGeometry(0.22, 14, 10), bone, 0, -0.3, 0).scale.set(1.2, 0.5, 0.8);
      break;
    }
    case 'pumpkin':
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        add(g, new THREE.SphereGeometry(0.24, 14, 10), s, Math.cos(a) * 0.13, 0, Math.sin(a) * 0.13).scale.y = 1.3;
      }
      add(g, new THREE.TorusGeometry(0.3, 0.03, 6, 20), plastic(m.cloth), 0, -0.22, 0).rotation.x = Math.PI / 2;
      break;
    case 'witch': {
      add(g, new THREE.ConeGeometry(0.42, 0.75, 16), c, 0, -0.05, 0);
      add(g, new THREE.TorusGeometry(0.25, 0.04, 6, 20), plastic(m.accent), 0, 0.02, 0).rotation.x = Math.PI / 2;
      add(g, new THREE.BoxGeometry(0.08, 0.08, 0.02), plastic(0xffd23f, { metalness: 0.4, roughness: 0.3 }), 0, 0.02, 0.27);
      break;
    }
    case 'ghost': {
      add(g, new THREE.CylinderGeometry(0.22, 0.38, 0.75, 18), s, 0, 0, 0);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        add(g, new THREE.SphereGeometry(0.1, 10, 8), s, Math.cos(a) * 0.32, -0.38, Math.sin(a) * 0.32);
      }
      break;
    }
    case 'slime':
      add(g, new THREE.SphereGeometry(0.36, 18, 14), s).scale.set(1, 1.15, 0.9);
      add(g, new THREE.SphereGeometry(0.06, 10, 8), glowMat(m.accent, 0.6), 0.1, 0.05, 0.12);
      add(g, new THREE.SphereGeometry(0.04, 10, 8), glowMat(m.accent, 0.6), -0.08, -0.12, 0.1);
      break;
    default: {
      add(g, new THREE.CapsuleGeometry(0.3, 0.22, 6, 16), c).scale.set(1, 1, 0.82);
      if (id === 'vampire') {
        add(g, new THREE.BoxGeometry(0.16, 0.4, 0.04), plastic(0xffffff, { roughness: 0.5 }), 0, 0.05, 0.24);
        for (const sx of [-1, 1]) add(g, new THREE.ConeGeometry(0.06, 0.12, 4), plastic(m.accent), sx * 0.06, 0.24, 0.27).rotation.z = sx * Math.PI / 2;
        // A tall cape collar.
        for (const sx of [-1, 1]) add(g, new THREE.BoxGeometry(0.22, 0.28, 0.03), plastic(m.accent, { roughness: 0.5 }), sx * 0.2, 0.36, -0.1).rotation.set(-0.3, sx * 0.5, sx * 0.3);
      } else if (id === 'werewolf') {
        add(g, new THREE.SphereGeometry(0.2, 14, 10), plastic(0xe6cfb0, { roughness: 0.7 }), 0, 0.05, 0.16).scale.set(1, 1.2, 0.5);
        for (const sx of [-1, 1]) add(g, new THREE.ConeGeometry(0.06, 0.14, 4), plastic(m.skin, { roughness: 0.7 }), sx * 0.22, -0.28, 0.12).rotation.x = Math.PI;
      } else if (id === 'mummy') {
        bandages(g, 0.3, -0.25, 0.3, 5);
      } else if (id === 'zombie') {
        add(g, new THREE.SphereGeometry(0.1, 10, 8), s, 0.12, 0.05, 0.22).scale.z = 0.4;
        add(g, new THREE.BoxGeometry(0.12, 0.012, 0.012), plastic(INK), -0.08, -0.1, 0.25);
        for (const sx of [-1, 1]) add(g, new THREE.ConeGeometry(0.05, 0.12, 4), c, sx * 0.18, -0.36, 0.12).rotation.x = Math.PI;
      } else if (id === 'cyclops') {
        for (const sx of [-1, 1]) add(g, new THREE.BoxGeometry(0.05, 0.45, 0.02), plastic(0x6b3fa0), sx * 0.12, 0.08, 0.25).rotation.z = sx * 0.1;
        add(g, new THREE.BoxGeometry(0.3, 0.2, 0.02), plastic(0x6b3fa0), 0, -0.12, 0.25);
      }
    }
  }
  g.position.set(0, TORSO_Y, 0);
  return g;
}

/** An arm hanging from the shoulder at `side` (-1 left, +1 right). */
function buildArm(id: MonsterId, side: number): THREE.Group {
  const g = new THREE.Group();
  const s = skinMat(id);
  const c = clothMat(id);
  const len = 0.34;
  switch (id) {
    case 'skeleton': {
      const bone = plastic(BONE, { roughness: 0.55 });
      add(g, boneGeometry(len, 0.035), bone, 0, -len / 2, 0);
      for (let i = -1; i <= 1; i++) add(g, boneGeometry(0.08, 0.014), bone, i * 0.035, -len - 0.07, 0.02).rotation.z = i * 0.3;
      break;
    }
    case 'ghost':
      add(g, new THREE.ConeGeometry(0.11, len + 0.08, 12), s, 0, -len / 2, 0).rotation.x = Math.PI;
      break;
    case 'pumpkin': {
      add(g, new THREE.CapsuleGeometry(0.045, len, 4, 8), c, 0, -len / 2, 0);
      const leaf = add(g, new THREE.SphereGeometry(0.1, 10, 8), plastic(0x7fd36a, { roughness: 0.6 }), 0, -len - 0.04, 0);
      leaf.scale.set(1, 1.2, 0.35);
      break;
    }
    default: {
      const sleeve = id === 'vampire' || id === 'witch' || id === 'zombie' || id === 'werewolf';
      add(g, new THREE.CapsuleGeometry(0.085, len, 4, 10), sleeve ? c : s, 0, -len / 2, 0);
      if (id === 'witch') add(g, new THREE.ConeGeometry(0.14, 0.18, 12), c, 0, -len + 0.02, 0);
      if (id === 'zombie') add(g, new THREE.CapsuleGeometry(0.075, len * 0.5, 4, 10), s, 0, -len * 0.75, 0);
      if (id === 'mummy') bandages(g, 0.09, -len, 0, 4, 0.35);
      if (id === 'werewolf') add(g, new THREE.CapsuleGeometry(0.075, len * 0.45, 4, 10), s, 0, -len * 0.78, 0);
      add(g, new THREE.SphereGeometry(0.1, 12, 10), s, 0, -len - 0.05, 0);
      if (id === 'werewolf') for (let i = -1; i <= 1; i++) add(g, new THREE.ConeGeometry(0.018, 0.06, 5), plastic(0xfff6ea), i * 0.04, -len - 0.13, 0.04).rotation.x = Math.PI;
      if (id === 'slime') add(g, new THREE.SphereGeometry(0.045, 8, 6), s, 0.03, -len - 0.17, 0).scale.y = 1.5;
      if (id === 'cyclops') for (let i = -1; i <= 1; i++) add(g, new THREE.SphereGeometry(0.035, 8, 6), s, i * 0.05, -len - 0.13, 0.02);
    }
  }
  g.position.set(side * SHOULDER, TORSO_Y + 0.22, 0);
  g.rotation.z = side * 0.45;
  return g;
}

function buildLeg(id: MonsterId, side: number): THREE.Group {
  const g = new THREE.Group();
  const s = skinMat(id);
  const c = clothMat(id);
  const len = 0.26;
  switch (id) {
    case 'skeleton': {
      const bone = plastic(BONE, { roughness: 0.55 });
      add(g, boneGeometry(len + 0.08, 0.04), bone, 0, -len / 2, 0);
      add(g, boneGeometry(0.14, 0.03), bone, 0, -len - 0.08, 0.05).rotation.x = Math.PI / 2;
      break;
    }
    case 'ghost': {
      const tail = add(g, new THREE.ConeGeometry(0.13, len + 0.15, 12), s, 0, -len / 2 - 0.05, 0);
      tail.rotation.x = Math.PI;
      tail.rotation.z = side * 0.2;
      break;
    }
    case 'witch': {
      for (let i = 0; i < 4; i++) add(g, new THREE.CylinderGeometry(0.075, 0.075, len / 4, 12), plastic(i % 2 ? INK : 0xb48cff, { roughness: 0.5 }), 0, -(i + 0.5) * (len / 4), 0);
      const boot = add(g, new THREE.ConeGeometry(0.09, 0.3, 10), plastic(INK, { roughness: 0.5 }), 0, -len - 0.04, 0.1);
      boot.rotation.x = Math.PI / 2;
      break;
    }
    case 'pumpkin':
      add(g, new THREE.CapsuleGeometry(0.05, len, 4, 8), c, 0, -len / 2, 0);
      add(g, new THREE.SphereGeometry(0.12, 10, 8), plastic(0x7fd36a, { roughness: 0.6 }), 0, -len - 0.04, 0.04).scale.set(0.9, 0.35, 1.3);
      break;
    default: {
      const pants = id === 'vampire' || id === 'zombie' || id === 'cyclops';
      add(g, new THREE.CapsuleGeometry(0.1, len, 4, 10), pants ? c : s, 0, -len / 2, 0);
      if (id === 'mummy') bandages(g, 0.105, -len, 0, 3, 0.3);
      const shoe = id === 'vampire' ? plastic(INK, { roughness: 0.2, metalness: 0.2 }) : s;
      add(g, new THREE.SphereGeometry(0.13, 12, 10), shoe, 0, -len - 0.04, 0.05).scale.set(0.9, 0.55, 1.3);
      if (id === 'werewolf') for (let i = -1; i <= 1; i++) add(g, new THREE.ConeGeometry(0.018, 0.06, 5), plastic(0xfff6ea), i * 0.045, -len - 0.04, 0.2).rotation.x = Math.PI / 2;
    }
  }
  g.position.set(side * HIP, 0.42, 0);
  return g;
}

/** Point on the front of the head at (x, y) relative to its centre. */
const face = (x: number, y: number, lift = 0.01) => new THREE.Vector3(x, y, Math.sqrt(Math.max(0, HEAD_R * HEAD_R - x * x - y * y)) + lift);

function kawaiiEye(parent: THREE.Object3D, at: THREE.Vector3, r: number, iris: number, opts: { lashes?: boolean; slit?: boolean } = {}): void {
  const g = new THREE.Group();
  g.position.copy(at);
  g.lookAt(at.clone().multiplyScalar(2));
  add(g, new THREE.SphereGeometry(r, 16, 12), plastic(INK, { roughness: 0.25 })).scale.z = 0.4;
  add(g, new THREE.SphereGeometry(r * 0.75, 14, 10), plastic(iris, { roughness: 0.25 }), 0, -r * 0.18, r * 0.12).scale.z = 0.35;
  if (opts.slit) add(g, new THREE.BoxGeometry(r * 0.2, r * 1.2, 0.01), plastic(INK), 0, -r * 0.1, r * 0.32);
  add(g, new THREE.SphereGeometry(r * 0.3, 8, 6), plastic(0xffffff, { roughness: 0.1 }), r * 0.32, r * 0.35, r * 0.34);
  add(g, new THREE.SphereGeometry(r * 0.13, 6, 4), plastic(0xffffff, { roughness: 0.1 }), -r * 0.3, -r * 0.35, r * 0.34);
  if (opts.lashes) for (let i = -1; i <= 1; i++) add(g, new THREE.BoxGeometry(0.012, 0.06, 0.01), plastic(INK), i * r * 0.55 + r * 0.6 * Math.sign(at.x || 1), r * 1.0, 0).rotation.z = -i * 0.4;
  parent.add(g);
}

function buildEyes(id: MonsterId): THREE.Group {
  const g = new THREE.Group();
  const ex = 0.17;
  const ey = 0.02;
  switch (id) {
    case 'vampire': for (const sx of [-1, 1]) kawaiiEye(g, face(sx * ex, ey), 0.09, 0xd9304f); break;
    case 'werewolf': for (const sx of [-1, 1]) kawaiiEye(g, face(sx * ex, ey + 0.04), 0.08, 0xffd23f, { slit: true }); break;
    case 'witch': for (const sx of [-1, 1]) kawaiiEye(g, face(sx * ex, ey), 0.085, 0x6fe36b, { lashes: true }); break;
    case 'zombie':
      kawaiiEye(g, face(-ex, ey + 0.02), 0.11, 0x8ff0c0);
      kawaiiEye(g, face(ex, ey - 0.01), 0.065, 0xff7f9e);
      break;
    case 'mummy': {
      kawaiiEye(g, face(ex, ey), 0.085, 0x6fe3a0);
      const wrap = add(g, new THREE.BoxGeometry(0.26, 0.07, 0.04), plastic(0xfff6e0, { roughness: 0.7 }), -ex, ey, face(-ex, ey).z);
      wrap.rotation.set(0, -0.35, 0.2);
      break;
    }
    case 'ghost':
      for (const sx of [-1, 1]) {
        const e = add(g, new THREE.SphereGeometry(0.075, 12, 10), plastic(INK, { roughness: 0.2 }), sx * ex, ey, face(sx * ex, ey).z);
        e.scale.set(0.8, 1.4, 0.35);
        add(g, new THREE.SphereGeometry(0.022, 8, 6), plastic(0xffffff), sx * ex + 0.02, ey + 0.05, face(sx * ex, ey).z + 0.03);
      }
      break;
    case 'skeleton':
      for (const sx of [-1, 1]) {
        const at = face(sx * ex, ey, 0);
        add(g, new THREE.SphereGeometry(0.12, 14, 10), plastic(INK, { roughness: 0.5 }), at.x, at.y, at.z - 0.02).scale.set(1, 1.1, 0.45);
        add(g, new THREE.SphereGeometry(0.03, 8, 6), glowMat(0x8ff0c0), at.x, at.y, at.z + 0.04);
      }
      break;
    case 'pumpkin':
      for (const sx of [-1, 1]) {
        const at = face(sx * ex, ey + 0.03);
        const t = add(g, new THREE.ConeGeometry(0.09, 0.13, 3), glowMat(0xffd23f, 1.2), at.x, at.y, at.z);
        t.rotation.x = Math.PI / 2;
        t.lookAt(at.clone().multiplyScalar(2));
        t.rotateX(Math.PI / 2);
      }
      break;
    case 'cyclops':
      kawaiiEye(g, face(0, ey + 0.04), 0.17, 0x5fe1ff);
      break;
    case 'slime':
      for (const sx of [-1, 1]) {
        const base = face(sx * ex, 0.22, 0);
        add(g, new THREE.CylinderGeometry(0.02, 0.025, 0.14, 8), skinMat('slime'), base.x, base.y + 0.07, base.z - 0.05);
        add(g, new THREE.SphereGeometry(0.075, 14, 10), plastic(0xffffff, { roughness: 0.2 }), base.x, base.y + 0.16, base.z - 0.02);
        add(g, new THREE.SphereGeometry(0.035, 10, 8), plastic(INK), base.x + sx * 0.01, base.y + 0.15, base.z + 0.04);
      }
      break;
  }
  g.position.copy(HEAD);
  return g;
}

function buildMouth(id: MonsterId): THREE.Group {
  const g = new THREE.Group();
  const ink = plastic(INK, { roughness: 0.4 });
  const my = -0.17;
  const at = face(0, my);
  const smile = (r: number, mat: THREE.Material = ink, tube = 0.016) => {
    const m = add(g, new THREE.TorusGeometry(r, tube, 6, 16, Math.PI), mat, at.x, at.y + r * 0.6, at.z);
    m.rotation.z = Math.PI;
    return m;
  };
  switch (id) {
    case 'vampire':
      smile(0.07);
      for (const sx of [-1, 1]) add(g, new THREE.ConeGeometry(0.018, 0.05, 6), plastic(0xffffff), sx * 0.04, at.y - 0.03, at.z + 0.005).rotation.x = Math.PI;
      break;
    case 'werewolf': {
      smile(0.1);
      for (let i = -2; i <= 2; i++) add(g, new THREE.ConeGeometry(0.014, 0.035, 5), plastic(0xffffff), i * 0.035, at.y - 0.02 - (2 - Math.abs(i)) * 0.004, at.z + 0.01).rotation.x = Math.PI;
      break;
    }
    case 'mummy':
      add(g, new THREE.BoxGeometry(0.1, 0.015, 0.015), ink, at.x, at.y, at.z);
      break;
    case 'zombie':
      add(g, new THREE.BoxGeometry(0.16, 0.015, 0.015), ink, at.x, at.y, at.z).rotation.z = 0.1;
      for (let i = -1; i <= 1; i++) add(g, new THREE.BoxGeometry(0.012, 0.05, 0.012), ink, i * 0.05, at.y + i * 0.005, at.z + 0.005);
      break;
    case 'ghost':
      add(g, new THREE.TorusGeometry(0.035, 0.016, 8, 16), ink, at.x, at.y, at.z).scale.y = 1.3;
      break;
    case 'witch': {
      const m = smile(0.065);
      m.rotation.z = Math.PI + 0.35;
      m.position.x += 0.03;
      break;
    }
    case 'skeleton':
      for (let i = -3; i <= 3; i++) add(g, new THREE.BoxGeometry(0.035, 0.05, 0.02), plastic(0xffffff, { roughness: 0.4 }), i * 0.04, at.y - 0.06, at.z - 0.05);
      add(g, new THREE.BoxGeometry(0.3, 0.012, 0.012), ink, 0, at.y - 0.06, at.z - 0.035);
      break;
    case 'pumpkin': {
      const lit = glowMat(0xffd23f, 1.2);
      smile(0.11, lit, 0.03);
      for (let i = -1; i <= 1; i += 2) add(g, new THREE.BoxGeometry(0.03, 0.035, 0.02), plastic(0xff9a3c), i * 0.04, at.y - 0.03, at.z + 0.02);
      break;
    }
    case 'cyclops': {
      smile(0.08);
      const tongue = add(g, new THREE.SphereGeometry(0.035, 10, 8), plastic(0xff7f9e, { roughness: 0.4 }), 0.02, at.y - 0.04, at.z + 0.005);
      tongue.scale.set(1, 1.2, 0.5);
      break;
    }
    case 'slime':
      for (const sx of [-1, 1]) {
        const m = add(g, new THREE.TorusGeometry(0.025, 0.012, 6, 12, Math.PI), ink, sx * 0.025, at.y + 0.015, at.z);
        m.rotation.z = Math.PI;
      }
      break;
  }
  g.position.copy(HEAD);
  return g;
}

function buildHair(id: MonsterId): THREE.Group {
  const g = new THREE.Group();
  const m = MONSTERS[id];
  const top = HEAD_R * 0.92;
  switch (id) {
    case 'vampire': {
      const hair = plastic(0x1e1428, { roughness: 0.25 });
      add(g, new THREE.SphereGeometry(HEAD_R * 1.04, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.42), hair, 0, 0.02, -0.02);
      const peak = add(g, new THREE.ConeGeometry(0.08, 0.16, 4), hair, 0, top * 0.62, HEAD_R * 0.72);
      peak.rotation.x = Math.PI + 0.7;
      break;
    }
    case 'werewolf': {
      const fur = plastic(m.skin, { roughness: 0.7 });
      for (const sx of [-1, 1]) {
        add(g, new THREE.ConeGeometry(0.14, 0.3, 8), fur, sx * 0.3, top * 0.82, 0).rotation.z = sx * -0.45;
        add(g, new THREE.ConeGeometry(0.07, 0.16, 8), plastic(0xffb3c6, { roughness: 0.6 }), sx * 0.29, top * 0.8, 0.06).rotation.z = sx * -0.45;
      }
      for (let i = -1; i <= 1; i++) add(g, new THREE.ConeGeometry(0.06, 0.16, 6), fur, i * 0.08, top + 0.04, 0.12).rotation.x = 0.5;
      break;
    }
    case 'mummy': {
      const wrap = plastic(0xfff6e0, { roughness: 0.7 });
      for (const sx of [-1, 1]) add(g, new THREE.SphereGeometry(0.09, 10, 8), wrap, sx * 0.1, top + 0.05, -0.05).scale.set(1.3, 0.6, 0.6);
      add(g, new THREE.SphereGeometry(0.05, 10, 8), wrap, 0, top + 0.05, -0.05);
      break;
    }
    case 'zombie': {
      const hair = plastic(0x3f6b3a, { roughness: 0.6 });
      for (let i = 0; i < 6; i++) {
        const a = -0.6 + i * 0.24;
        const spike = add(g, new THREE.ConeGeometry(0.07, 0.22, 6), hair, Math.sin(a) * 0.25, top + 0.03 - Math.abs(a) * 0.1, Math.cos(a) * 0.05);
        spike.rotation.z = -a * 0.9;
      }
      break;
    }
    case 'ghost': {
      const s = skinMat('ghost');
      const curl = add(g, new THREE.TorusGeometry(0.06, 0.03, 8, 16, Math.PI * 1.5), s, 0, top + 0.1, 0);
      curl.rotation.y = Math.PI / 2;
      add(g, new THREE.ConeGeometry(0.05, 0.12, 10), s, 0, top + 0.02, 0);
      break;
    }
    case 'witch': {
      const hat = plastic(0x2a2230, { roughness: 0.5 });
      add(g, new THREE.CylinderGeometry(0.62, 0.62, 0.04, 24), hat, 0, top * 0.62, 0);
      const cone = add(g, new THREE.ConeGeometry(0.34, 0.7, 18), hat, 0, top * 0.62 + 0.35, 0);
      cone.rotation.z = -0.15;
      add(g, new THREE.CylinderGeometry(0.33, 0.33, 0.08, 18), plastic(m.accent), 0, top * 0.62 + 0.06, 0);
      add(g, new THREE.BoxGeometry(0.1, 0.08, 0.02), plastic(0xffd23f, { metalness: 0.4 }), 0, top * 0.62 + 0.06, 0.33);
      break;
    }
    case 'skeleton': {
      const bow = plastic(m.accent, { roughness: 0.4 });
      for (const sx of [-1, 1]) add(g, new THREE.ConeGeometry(0.1, 0.18, 10), bow, sx * 0.1, 0, 0).rotation.z = sx * Math.PI / 2;
      add(g, new THREE.SphereGeometry(0.05, 10, 8), bow);
      g.position.set(0.22, top * 0.75, 0.15);
      g.rotation.z = -0.4;
      return wrapAtHead(g);
    }
    case 'pumpkin': {
      add(g, new THREE.CylinderGeometry(0.04, 0.06, 0.18, 8), plastic(0x4fae5a, { roughness: 0.6 }), 0, top + 0.12, 0).rotation.z = 0.25;
      const leaf = add(g, new THREE.SphereGeometry(0.12, 10, 8), plastic(0x7fd36a, { roughness: 0.6 }), 0.14, top + 0.08, 0);
      leaf.scale.set(1, 0.25, 0.6);
      leaf.rotation.z = -0.3;
      const vine = add(g, new THREE.TorusGeometry(0.06, 0.012, 6, 16, Math.PI * 1.6), plastic(0x4fae5a), -0.1, top + 0.12, 0);
      vine.rotation.y = 0.5;
      break;
    }
    case 'cyclops': {
      const horn = add(g, new THREE.ConeGeometry(0.07, 0.22, 10), plastic(0xfff1c9, { roughness: 0.4 }), 0, top + 0.1, 0.05);
      horn.rotation.x = 0.2;
      for (let i = 0; i < 3; i++) add(g, new THREE.TorusGeometry(0.06 - i * 0.015, 0.01, 4, 12), plastic(0xd9c4a3), 0, top + 0.03 + i * 0.05, 0.05 + i * 0.01).rotation.x = Math.PI / 2;
      break;
    }
    case 'slime': {
      const s = skinMat('slime');
      add(g, new THREE.CylinderGeometry(0.015, 0.025, 0.25, 8), s, 0, top + 0.12, 0);
      add(g, new THREE.SphereGeometry(0.06, 10, 8), glowMat(m.accent, 0.8), 0, top + 0.27, 0);
      break;
    }
  }
  return wrapAtHead(g);
}

function wrapAtHead(g: THREE.Group): THREE.Group {
  const w = new THREE.Group();
  w.position.copy(HEAD);
  w.add(g);
  return w;
}

function buildExtra(id: MonsterId): THREE.Group {
  const g = new THREE.Group();
  const m = MONSTERS[id];
  const back = -0.28;
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
      const geo = new THREE.ExtrudeGeometry(wing, { depth: 0.025, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 1 });
      const mat = plastic(id === 'vampire' ? 0x3b2a4a : 0x7fd36a, { roughness: 0.5 });
      for (const sx of [-1, 1]) {
        const w = add(g, geo, mat, sx * 0.1, TORSO_Y + 0.2, back);
        w.scale.x = sx;
        w.rotation.y = sx * 0.4;
      }
      break;
    }
    case 'werewolf': {
      const fur = plastic(m.skin, { roughness: 0.7 });
      const tail = add(g, new THREE.CapsuleGeometry(0.1, 0.3, 4, 10), fur, 0, TORSO_Y - 0.25, back - 0.15);
      tail.rotation.x = -0.9;
      add(g, new THREE.SphereGeometry(0.1, 10, 8), plastic(0xe6cfb0, { roughness: 0.7 }), 0, TORSO_Y - 0.07, back - 0.32);
      break;
    }
    case 'mummy': {
      const wrap = plastic(0xfff6e0, { roughness: 0.7 });
      for (const sx of [-1, 1]) {
        const r = add(g, new THREE.BoxGeometry(0.08, 0.5, 0.015), wrap, sx * 0.12, TORSO_Y - 0.1, back);
        r.rotation.set(0.3, 0, sx * 0.25);
      }
      break;
    }
    case 'zombie': {
      const cape = add(g, new THREE.CylinderGeometry(0.3, 0.45, 0.75, 12, 1, true, Math.PI * 0.6, Math.PI * 0.8), plastic(0x6b3fa0, { roughness: 0.6, side: THREE.DoubleSide }), 0, TORSO_Y - 0.05, 0);
      cape.rotation.y = Math.PI;
      for (let i = 0; i < 4; i++) add(g, new THREE.ConeGeometry(0.05, 0.12, 4), plastic(0x6b3fa0, { roughness: 0.6 }), -0.24 + i * 0.16, TORSO_Y - 0.45, -0.38 + Math.abs(i - 1.5) * 0.03).rotation.x = Math.PI;
      break;
    }
    case 'ghost': {
      const s = skinMat('ghost');
      const tail = add(g, new THREE.ConeGeometry(0.2, 0.6, 14), s, 0, TORSO_Y - 0.2, back - 0.2);
      tail.rotation.x = -2.2;
      add(g, new THREE.SphereGeometry(0.06, 10, 8), s, 0, TORSO_Y - 0.48, back - 0.52);
      break;
    }
    case 'witch': {
      const stick = add(g, new THREE.CylinderGeometry(0.025, 0.025, 1.3, 8), plastic(0x9b6a3c, { roughness: 0.6 }), 0, TORSO_Y + 0.1, back - 0.05);
      stick.rotation.z = 0.7;
      const bristle = add(g, new THREE.ConeGeometry(0.14, 0.32, 10), plastic(0xffd23f, { roughness: 0.8 }), -0.52, TORSO_Y - 0.34, back - 0.05);
      bristle.rotation.z = 0.7 + Math.PI;
      break;
    }
    case 'skeleton': {
      const bone = plastic(BONE, { roughness: 0.55 });
      for (const sx of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const a = 0.3 + i * 0.32;
          const b = add(g, boneGeometry(0.36 - i * 0.04, 0.022), bone, sx * (0.12 + Math.sin(a) * 0.18), TORSO_Y + 0.22 + Math.cos(a) * 0.18, back);
          b.rotation.z = -sx * a;
        }
      }
      break;
    }
    case 'cyclops': {
      const tailMat = plastic(m.cloth, { roughness: 0.45 });
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, TORSO_Y - 0.3, back), new THREE.Vector3(0.1, TORSO_Y - 0.4, back - 0.25),
        new THREE.Vector3(0.3, TORSO_Y - 0.25, back - 0.35), new THREE.Vector3(0.4, TORSO_Y + 0.02, back - 0.3),
      ]);
      add(g, new THREE.TubeGeometry(curve, 20, 0.03, 8), tailMat);
      const tip = add(g, new THREE.ConeGeometry(0.08, 0.14, 3), tailMat, 0.41, TORSO_Y + 0.1, back - 0.3);
      tip.scale.z = 0.4;
      break;
    }
    case 'slime': {
      const s = skinMat('slime');
      add(g, new THREE.SphereGeometry(0.26, 16, 12), s, 0, TORSO_Y - 0.05, back - 0.1).scale.set(1, 1.2, 0.6);
      add(g, new THREE.SphereGeometry(0.06, 10, 8), s, 0.12, TORSO_Y - 0.35, back - 0.1).scale.y = 1.6;
      add(g, new THREE.SphereGeometry(0.05, 10, 8), glowMat(m.accent, 0.6), -0.05, TORSO_Y + 0.05, back - 0.22);
      break;
    }
  }
  return g;
}

/**
 * Assemble the monster. Missing body parts show as faint ghostly
 * silhouettes (when `placeholders` is on) so you can see what is left.
 */
export function buildMonster(build: MonsterBuild, placeholders = true): THREE.Group {
  const root = new THREE.Group();
  const ph = ghostly();
  const placeholder = (geo: THREE.BufferGeometry, x: number, y: number, z = 0, rz = 0) => {
    if (!placeholders) return;
    const m = add(root, geo, ph, x, y, z);
    m.rotation.z = rz;
    m.castShadow = false;
  };
  if (build.head) root.add(buildHead(build.head));
  else placeholder(new THREE.SphereGeometry(HEAD_R, 18, 12), HEAD.x, HEAD.y);
  if (build.torso) root.add(buildTorso(build.torso));
  else placeholder(new THREE.CapsuleGeometry(0.3, 0.22, 6, 12), 0, TORSO_Y);
  ([['leftArm', -1], ['rightArm', 1]] as const).forEach(([slot, side]) => {
    const id = build[slot];
    if (id) root.add(buildArm(id, side));
    else placeholder(new THREE.CapsuleGeometry(0.085, 0.34, 4, 8), side * (SHOULDER + 0.08), TORSO_Y + 0.05, 0, side * 0.45);
  });
  ([['leftLeg', -1], ['rightLeg', 1]] as const).forEach(([slot, side]) => {
    const id = build[slot];
    if (id) root.add(buildLeg(id, side));
    else placeholder(new THREE.CapsuleGeometry(0.1, 0.26, 4, 8), side * HIP, 0.29);
  });
  if (build.eyes) root.add(buildEyes(build.eyes));
  if (build.mouth) root.add(buildMouth(build.mouth));
  if (build.hair) root.add(buildHair(build.hair));
  if (build.extra) root.add(buildExtra(build.extra));

  // Frankenstein hardware: neck bolts and seam stitches where pieces meet.
  if (build.head || build.torso) {
    const bolt = plastic(0x8d93a8, { roughness: 0.3, metalness: 0.6 });
    for (const sx of [-1, 1]) {
      // On the neck, just under the head's rim so a see-through head doesn't show them inside.
      const b = add(root, new THREE.CylinderGeometry(0.04, 0.04, 0.14, 10), bolt, sx * 0.24, TORSO_Y + 0.38, 0);
      b.rotation.z = Math.PI / 2;
      add(root, new THREE.CylinderGeometry(0.06, 0.06, 0.05, 6), bolt, sx * 0.32, TORSO_Y + 0.38, 0).rotation.z = Math.PI / 2;
    }
  }
  if (build.torso) {
    for (const sx of [-1, 1]) {
      if (build[sx < 0 ? 'leftArm' : 'rightArm']) stitches(root, 0.095, 'x', new THREE.Vector3(sx * (SHOULDER - 0.02), TORSO_Y + 0.21, 0));
      if (build[sx < 0 ? 'leftLeg' : 'rightLeg']) stitches(root, 0.11, 'y', new THREE.Vector3(sx * HIP, 0.44, 0));
    }
  }
  return root;
}

// ---------------------------------------------------------------- render
/** Renders monsters to images with a private offscreen renderer. */
export class MonsterPortrait {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  private canvas = document.createElement('canvas');

  constructor() {
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
      this.renderer.shadowMap.enabled = true;
    } catch (err) {
      console.warn('Monster portrait renderer unavailable', err);
    }
    this.scene.add(new THREE.HemisphereLight(0xfff1ff, 0x5a4a8a, 1.5));
    const key = new THREE.DirectionalLight(0xfff1dc, 2.4);
    key.position.set(2, 4, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera as THREE.OrthographicCamera;
    sc.left = -2; sc.right = 2; sc.top = 3; sc.bottom = -1;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xb48cff, 1.6);
    rim.position.set(-3, 2, -3);
    this.scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.1, 32), new THREE.ShadowMaterial({ opacity: 0.35 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
  }

  /** Square transparent PNG canvas of the monster, `size` px. Returns null without WebGL. */
  render(build: MonsterBuild, size: number, opts: { placeholders?: boolean; yaw?: number } = {}): HTMLCanvasElement | null {
    if (!this.renderer) return null;
    const monster = buildMonster(build, opts.placeholders ?? true);
    monster.rotation.y = opts.yaw ?? -0.35;
    this.scene.add(monster);
    this.renderer.setSize(size, size, false);
    // Frame the whole monster (hats and wings included) with a little margin.
    const box = new THREE.Box3().setFromObject(monster);
    box.min.y = Math.min(box.min.y, 0);
    const center = box.getCenter(new THREE.Vector3());
    const dims = box.getSize(new THREE.Vector3());
    const half = Math.max(dims.y, dims.x) / 2 * 1.08;
    const dist = half / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) + dims.z / 2;
    this.camera.position.set(center.x, center.y + dist * 0.18, center.z + dist);
    this.camera.lookAt(center);
    this.renderer.render(this.scene, this.camera);
    this.scene.remove(monster);
    // Shared (cached) bone geometries stay alive for the game scene.
    monster.traverse((o) => { if (o instanceof THREE.Mesh && !o.geometry.userData.shared) o.geometry.dispose(); });
    const out = document.createElement('canvas');
    out.width = out.height = size;
    out.getContext('2d')!.drawImage(this.canvas, 0, 0);
    return out;
  }
}
