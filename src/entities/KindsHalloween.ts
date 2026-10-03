import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { plastic } from '../scene/Materials';
import type { KindDef } from './Collectible';

/** Pickups for the Spooky Night islands. Same contract as the base catalog in Collectible.ts. */

function sh<T extends THREE.Mesh>(m: T): T {
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh => {
  const m = sh(new THREE.Mesh(geo, mat));
  m.position.set(x, y, z);
  return m;
};
const group = (...parts: THREE.Object3D[]): THREE.Group => {
  const g = new THREE.Group();
  g.add(...parts);
  return g;
};
const glow = (hex: number, i = 1.2) => plastic(hex, { emissive: hex, emissiveIntensity: i, roughness: 0.4 });
const INK = 0x2a2230;

/** Two dot eyes and a little smile on the +Z face, centred at (0, y, z). */
function cuteFace(y: number, z: number, scale = 1): THREE.Group {
  const ink = plastic(INK, { roughness: 0.4 });
  const g = new THREE.Group();
  for (const s of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.018 * scale, 8, 6), ink, s * 0.04 * scale, y, z));
  const smile = mesh(new THREE.TorusGeometry(0.018 * scale, 0.006 * scale, 6, 12, Math.PI), ink, 0, y - 0.025 * scale, z);
  smile.rotation.z = Math.PI;
  g.add(smile);
  for (const s of [-1, 1]) {
    const blush = mesh(new THREE.SphereGeometry(0.014 * scale, 8, 6), plastic(0xff9fb0, { roughness: 0.5 }), s * 0.068 * scale, y - 0.018 * scale, z - 0.004);
    blush.scale.z = 0.4;
    g.add(blush);
  }
  return g;
}

export const SPOOKY_KINDS: Record<string, KindDef> = {
  candycorn: {
    name: 'Candy Corn', mass: 0.25, grip: 0.55, top: 0.16, bottom: 0.1,
    buildMesh() {
      const g = new THREE.Group();
      const bands: [number, number, number, number][] = [
        [0.13, 0.11, 0.07, 0xfff6ea], [0.11, 0.075, 0.08, 0xff9a3c], [0.075, 0.0, 0.1, 0xffd23f],
      ];
      let y = -0.1;
      for (const [r0, r1, h, c] of bands) {
        const seg = mesh(new THREE.CylinderGeometry(r1, r0, h, 3), plastic(c, { roughness: 0.35 }), 0, y + h / 2, 0);
        seg.scale.z = 0.55;
        g.add(seg);
        y += h;
      }
      g.add(cuteFace(-0.02, 0.06, 1));
      return g;
    },
    collider: () => RAPIER.ColliderDesc.cuboid(0.12, 0.13, 0.06),
  },
  tombstone: {
    name: 'Tombstone', mass: 0.5, grip: 0.6, top: 0.2, bottom: 0.2,
    buildMesh() {
      const stone = plastic(0xa9a3c4, { roughness: 0.85 });
      const slab = mesh(new RoundedBoxGeometry(0.26, 0.28, 0.08, 3, 0.03), stone, 0, -0.04, 0);
      const top = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 20, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), stone, 0, 0.1, 0);
      const rip = mesh(new THREE.BoxGeometry(0.12, 0.025, 0.01), plastic(0x6b6488), 0, 0.04, 0.042);
      const moss = mesh(new THREE.SphereGeometry(0.05, 8, 6), plastic(0x8ff0c0, { roughness: 0.8 }), 0.09, -0.16, 0.03);
      moss.scale.y = 0.4;
      return group(slab, top, rip, moss, cuteFace(-0.03, 0.042, 1));
    },
    collider: () => RAPIER.ColliderDesc.cuboid(0.13, 0.2, 0.04),
  },
  eyeball: {
    name: 'Eyeball', mass: 0.3, grip: 0.55, top: 0.13, bottom: 0.13,
    buildMesh() {
      const white = mesh(new THREE.SphereGeometry(0.13, 20, 16), plastic(0xfffaf6, { roughness: 0.25 }));
      const iris = mesh(new THREE.SphereGeometry(0.065, 16, 12), plastic(0x8ff0c0, { roughness: 0.2 }), 0, 0.02, 0.1);
      iris.scale.z = 0.5;
      const pupil = mesh(new THREE.SphereGeometry(0.035, 12, 8), plastic(INK, { roughness: 0.2 }), 0, 0.02, 0.125);
      pupil.scale.z = 0.4;
      const shine = mesh(new THREE.SphereGeometry(0.014, 8, 6), plastic(0xffffff), 0.02, 0.045, 0.135);
      const g = group(white, iris, pupil, shine);
      const vein = plastic(0xff7f9e, { roughness: 0.5 });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        const v = mesh(new THREE.TorusGeometry(0.128, 0.004, 4, 16, 0.6), vein);
        v.rotation.set(Math.PI / 2, a, 0);
        g.add(v);
      }
      return g;
    },
    collider: () => RAPIER.ColliderDesc.ball(0.13),
  },
  coffin: {
    name: 'Coffin', mass: 0.55, grip: 0.55, top: 0.08, bottom: 0.08,
    buildMesh() {
      const s = new THREE.Shape();
      s.moveTo(0, 0.24);
      s.lineTo(0.09, 0.16);
      s.lineTo(0.06, -0.24);
      s.lineTo(-0.06, -0.24);
      s.lineTo(-0.09, 0.16);
      s.closePath();
      const geo = new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2 });
      geo.center();
      geo.rotateX(-Math.PI / 2);
      const box = mesh(geo, plastic(0x6b3f5a, { roughness: 0.6 }));
      const lid = mesh(new THREE.BoxGeometry(0.03, 0.01, 0.2), plastic(0xffd23f, { roughness: 0.3, metalness: 0.4 }), 0, 0.068, -0.04);
      const bar = mesh(new THREE.BoxGeometry(0.09, 0.01, 0.03), plastic(0xffd23f, { roughness: 0.3, metalness: 0.4 }), 0, 0.068, -0.08);
      return group(box, lid, bar);
    },
    collider: () => RAPIER.ColliderDesc.cuboid(0.1, 0.07, 0.26),
  },
  potion: {
    name: 'Potion', mass: 0.3, grip: 0.6, top: 0.21, bottom: 0.12,
    buildMesh() {
      const flask = mesh(new THREE.SphereGeometry(0.12, 18, 14), plastic(0xd9f7ff, { roughness: 0.05, transparent: true, opacity: 0.45 }));
      const brew = mesh(new THREE.SphereGeometry(0.105, 18, 14, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65), glow(0xb48cff, 0.7));
      const neck = mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.1, 12), plastic(0xd9f7ff, { roughness: 0.05, transparent: true, opacity: 0.5 }), 0, 0.14, 0);
      const cork = mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.05, 12), plastic(0xc48a4e, { roughness: 0.8 }), 0, 0.2, 0);
      const bubble = mesh(new THREE.SphereGeometry(0.02, 8, 6), glow(0xe6d6ff, 0.8), 0.03, 0.0, 0.07);
      return group(flask, brew, neck, cork, bubble);
    },
    collider: () => RAPIER.ColliderDesc.cylinder(0.165, 0.12).setTranslation(0, 0.045, 0),
  },
  cauldron: {
    name: 'Cauldron', mass: 0.55, grip: 0.55, top: 0.16, bottom: 0.12,
    buildMesh() {
      const iron = plastic(0x3a3346, { roughness: 0.4, metalness: 0.3 });
      const pot = mesh(new THREE.SphereGeometry(0.15, 18, 14, 0, Math.PI * 2, Math.PI * 0.25, Math.PI * 0.75), iron);
      const rim = mesh(new THREE.TorusGeometry(0.11, 0.025, 10, 24), iron, 0, 0.1, 0);
      rim.rotation.x = Math.PI / 2;
      const brew = mesh(new THREE.CircleGeometry(0.1, 20), glow(0x8ff0c0, 0.9), 0, 0.095, 0);
      brew.rotation.x = -Math.PI / 2;
      const g = group(pot, rim, brew);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        g.add(mesh(new THREE.CylinderGeometry(0.02, 0.015, 0.06, 8), iron, Math.cos(a) * 0.09, -0.15, Math.sin(a) * 0.09));
      }
      g.add(mesh(new THREE.SphereGeometry(0.025, 8, 6), glow(0xd9fff0, 0.8), 0.03, 0.12, 0.02));
      return g;
    },
    collider: () => RAPIER.ColliderDesc.cylinder(0.14, 0.15),
  },
  // ----------------------------------------------------------- gate tools
  mirror: {
    // A standing hand mirror on a heavy foot. Its reflecting face is local +Z.
    name: 'Mirror', mass: 0.8, grip: 0.75, top: 0.3, bottom: 0.2,
    buildMesh() {
      const bone = plastic(0xf6ecd4, { roughness: 0.55 });
      const foot = mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.06, 20), plastic(0x3a2a4f, { roughness: 0.5 }), 0, -0.17, 0);
      const stem = mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.12, 10), bone, 0, -0.1, 0);
      const frame = mesh(new THREE.TorusGeometry(0.16, 0.03, 10, 32), bone, 0, 0.1, 0);
      frame.scale.set(1, 1.2, 1);
      const glass = mesh(new THREE.CircleGeometry(0.155, 32), plastic(0xdff4ff, { roughness: 0.05, metalness: 0.9 }), 0, 0.1, 0.012);
      glass.scale.y = 1.2;
      const back = mesh(new THREE.CircleGeometry(0.16, 32), plastic(0x5e3a8f, { roughness: 0.6 }), 0, 0.1, -0.012);
      back.scale.y = 1.2;
      back.rotation.y = Math.PI;
      const shine = mesh(new THREE.PlaneGeometry(0.03, 0.16), plastic(0xffffff, { roughness: 0.1, transparent: true, opacity: 0.7 }), -0.05, 0.14, 0.016);
      shine.rotation.z = -0.5;
      return group(foot, stem, frame, glass, back, shine);
    },
    collider: () => RAPIER.ColliderDesc.cuboid(0.18, 0.25, 0.09).setTranslation(0, -0.04, 0),
  },
  gatekey: {
    name: 'Gate Key', mass: 0.4, grip: 0.7, top: 0.06, bottom: 0.06,
    buildMesh() {
      const gold = plastic(0xffcf4a, { roughness: 0.28, metalness: 0.55 });
      const bow = mesh(new THREE.TorusGeometry(0.08, 0.028, 10, 24), gold, -0.16, 0, 0);
      bow.rotation.x = Math.PI / 2;
      const gem = mesh(new THREE.SphereGeometry(0.035, 12, 10), glow(0x7fe0b0, 0.9), -0.16, 0, 0);
      const shaft = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.26, 10), gold, 0.02, 0, 0);
      shaft.rotation.z = Math.PI / 2;
      const g = group(bow, gem, shaft);
      for (const [x, h] of [[0.1, 0.07], [0.14, 0.05]] as const) g.add(mesh(new THREE.BoxGeometry(0.03, 0.02, h), gold, x, 0, h / 2));
      return g;
    },
    collider: () => RAPIER.ColliderDesc.cuboid(0.25, 0.04, 0.1),
  },
  // Pumpkins for the scale: 1, 2 and 3 carved pips, and as many units of mass.
  ...Object.fromEntries([1, 2, 3].map((n) => [`gourd${n}`, {
    name: ['Small', 'Medium', 'Big'][n - 1] + ' Pumpkin', mass: n, grip: 0.65 + n * 0.03,
    top: 0.08 + n * 0.035, bottom: 0.08 + n * 0.035,
    buildMesh() {
      const r = 0.08 + n * 0.035;
      const orange = plastic([0xffb15a, 0xf28a35, 0xd96a1e][n - 1], { roughness: 0.5 });
      const g = new THREE.Group();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const lobe = mesh(new THREE.SphereGeometry(r * 0.62, 14, 10), orange, Math.cos(a) * r * 0.42, 0, Math.sin(a) * r * 0.42);
        lobe.scale.y = 1.15;
        g.add(lobe);
      }
      g.add(mesh(new THREE.CylinderGeometry(r * 0.1, r * 0.14, r * 0.45, 8), plastic(0x4e7a3a, { roughness: 0.7 }), 0, r * 0.95, 0));
      // Carved weight pips on the front, so the scale is a little sum.
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * r * 0.42;
        const pip = mesh(new THREE.SphereGeometry(r * 0.13, 10, 8), glow(0xffcf4a, 1.1), x, r * 0.05, r * 0.86);
        pip.scale.z = 0.4;
        g.add(pip);
      }
      return g;
    },
    collider: () => RAPIER.ColliderDesc.ball(0.08 + n * 0.035),
  } satisfies KindDef])),
};
