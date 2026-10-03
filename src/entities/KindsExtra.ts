import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { plastic } from '../scene/Materials';
import type { KindDef } from './Collectible';

/** Pickups for the later islands. Same contract as the base catalog in Collectible.ts. */

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
const metal = (hex: number) => plastic(hex, { roughness: 0.32, metalness: 0.65 });
const glow = (hex: number, i = 1.2) => plastic(hex, { emissive: hex, emissiveIntensity: i, roughness: 0.4 });

function gearShape(teeth: number, outer: number, inner: number, hole: number): THREE.Shape {
  const s = new THREE.Shape();
  const steps = teeth * 4;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const r = (i % 4 === 1 || i % 4 === 2) ? outer : inner;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  const h = new THREE.Path();
  h.absarc(0, 0, hole, 0, Math.PI * 2, true);
  s.holes.push(h);
  return s;
}

export const EXTRA_KINDS: Record<string, KindDef> = {
  // ------------------------------------------------------------- candy
  lollipop: {
    name: 'Lollipop', mass: 0.3, grip: 0.6, top: 0.26, bottom: 0.26,
    buildMesh() {
      const head = mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.06, 28), plastic(0xff6fb5, { roughness: 0.25 }), 0, 0.12, 0);
      head.rotation.x = Math.PI / 2;
      const swirl = mesh(new THREE.TorusGeometry(0.08, 0.022, 8, 24), plastic(0xffffff, { roughness: 0.3 }), 0, 0.12, 0.032);
      const swirl2 = mesh(new THREE.TorusGeometry(0.035, 0.018, 8, 18), plastic(0x7fe3ff, { roughness: 0.3 }), 0, 0.12, 0.034);
      const stick = mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.3, 8), plastic(0xfff6ea, { roughness: 0.6 }), 0, -0.11, 0);
      return group(head, swirl, swirl2, stick);
    },
    collider: () => RAPIER.ColliderDesc.cuboid(0.14, 0.26, 0.05),
  },
  donut: {
    name: 'Donut', mass: 0.3, grip: 0.55, top: 0.08, bottom: 0.07,
    buildMesh() {
      const dough = mesh(new THREE.TorusGeometry(0.13, 0.07, 12, 28), plastic(0xd9a066, { roughness: 0.6 }));
      dough.rotation.x = Math.PI / 2;
      const icing = mesh(new THREE.TorusGeometry(0.13, 0.072, 10, 28, Math.PI * 2), plastic(0xff8fc7, { roughness: 0.25 }), 0, 0.025, 0);
      icing.rotation.x = Math.PI / 2;
      icing.scale.set(1, 1, 0.55);
      const g = group(dough, icing);
      const cols = [0xffffff, 0x7fe3ff, 0xffe066, 0x8ae07b];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const sp = mesh(new THREE.CapsuleGeometry(0.008, 0.025, 2, 4), plastic(cols[i % 4]), Math.cos(a) * 0.13, 0.065, Math.sin(a) * 0.13);
        sp.rotation.set(Math.PI / 2, 0, a * 3);
        g.add(sp);
      }
      return g;
    },
    collider: () => RAPIER.ColliderDesc.cylinder(0.07, 0.2),
  },
  cupcake: {
    name: 'Cupcake', mass: 0.3, grip: 0.6, top: 0.22, bottom: 0.14,
    buildMesh() {
      const wrap = mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.16, 14), plastic(0x7fc8ff, { roughness: 0.5, flat: true }), 0, -0.06, 0);
      const frost = mesh(new THREE.SphereGeometry(0.15, 18, 12), plastic(0xfff0f6, { roughness: 0.35 }), 0, 0.06, 0);
      frost.scale.y = 0.7;
      const cherry = mesh(new THREE.SphereGeometry(0.04, 12, 8), plastic(0xe8384b, { roughness: 0.2 }), 0, 0.18, 0);
      return group(wrap, frost, cherry);
    },
    collider: () => RAPIER.ColliderDesc.cylinder(0.17, 0.14),
  },
  wrappedcandy: {
    name: 'Candy', mass: 0.25, grip: 0.55, top: 0.1, bottom: 0.1,
    buildMesh() {
      const body = mesh(new THREE.SphereGeometry(0.1, 16, 12), plastic(0xffd23f, { roughness: 0.25 }));
      body.scale.x = 1.35;
      const g = group(body);
      for (const s of [-1, 1]) {
        const end = mesh(new THREE.ConeGeometry(0.08, 0.12, 8), plastic(0xff8c1a, { roughness: 0.35 }), s * 0.17, 0, 0);
        end.rotation.z = s * Math.PI / 2;
        g.add(end);
      }
      return g;
    },
    collider: () => RAPIER.ColliderDesc.cuboid(0.24, 0.1, 0.1),
  },
  icecream: {
    name: 'Ice Cream', mass: 0.3, grip: 0.6, top: 0.28, bottom: 0.23,
    buildMesh() {
      const cone = mesh(new THREE.ConeGeometry(0.09, 0.26, 12), plastic(0xd9a066, { roughness: 0.7, flat: true }), 0, -0.1, 0);
      cone.rotation.x = Math.PI;
      const s1 = mesh(new THREE.SphereGeometry(0.1, 16, 12), plastic(0xff9fcf, { roughness: 0.4 }), 0, 0.06, 0);
      const s2 = mesh(new THREE.SphereGeometry(0.09, 16, 12), plastic(0x9ff0c8, { roughness: 0.4 }), 0, 0.18, 0);
      return group(cone, s1, s2);
    },
    collider: () => RAPIER.ColliderDesc.cuboid(0.1, 0.25, 0.1),
  },
  // ----------------------------------------------------- factory / future
  crate: {
    name: 'Crate', mass: 0.6, grip: 0.55, top: 0.18, bottom: 0.18,
    buildMesh() {
      const g = group(mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), plastic(0xc8914f, { roughness: 0.75 })));
      const plank = plastic(0x8a5a2b, { roughness: 0.8 });
      for (const s of [-1, 1]) {
        for (const ax of ['x', 'z'] as const) {
          const b = mesh(new THREE.BoxGeometry(ax === 'x' ? 0.36 : 0.05, 0.05, ax === 'x' ? 0.05 : 0.36), plank, 0, s * 0.15, 0);
          if (ax === 'x') b.position.z = 0.16; else b.position.x = 0.16;
          g.add(b);
          const c = b.clone(); c.position.set(-b.position.x, b.position.y, -b.position.z); g.add(c);
        }
      }
      return g;
    },
    collider: () => RAPIER.ColliderDesc.cuboid(0.18, 0.18, 0.18),
  },
  gear: {
    name: 'Gear', mass: 0.5, grip: 0.5, top: 0.06, bottom: 0.06,
    buildMesh() {
      const geo = new THREE.ExtrudeGeometry(gearShape(10, 0.21, 0.16, 0.05), { depth: 0.07, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 2 });
      geo.center();
      geo.rotateX(-Math.PI / 2);
      return group(mesh(geo, metal(0xb8c0cc)));
    },
    collider: () => RAPIER.ColliderDesc.cylinder(0.05, 0.2),
  },
  bolt: {
    name: 'Bolt', mass: 0.45, grip: 0.55, top: 0.16, bottom: 0.16,
    buildMesh() {
      const head = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.07, 6), metal(0x9aa3ad), 0, 0.12, 0);
      const shaft = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.25, 12), metal(0xc9d0d8), 0, -0.04, 0);
      const g = group(head, shaft);
      for (let i = 0; i < 5; i++) {
        const t = mesh(new THREE.TorusGeometry(0.047, 0.008, 6, 14), metal(0xa8b0ba), 0, -0.14 + i * 0.04, 0);
        t.rotation.x = Math.PI / 2;
        g.add(t);
      }
      return g;
    },
    collider: () => RAPIER.ColliderDesc.cuboid(0.1, 0.16, 0.1),
  },
  battery: {
    name: 'Battery', mass: 0.45, grip: 0.55, top: 0.18, bottom: 0.15,
    buildMesh() {
      const body = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.2, 18), plastic(0x2b2d42, { roughness: 0.35 }), 0, -0.05, 0);
      const band = mesh(new THREE.CylinderGeometry(0.081, 0.081, 0.1, 18), plastic(0x3ddc84, { roughness: 0.3 }), 0, 0.1, 0);
      const tip = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 12), metal(0xd8dbe6), 0, 0.17, 0);
      return group(body, band, tip);
    },
    collider: () => RAPIER.ColliderDesc.cylinder(0.16, 0.08),
  },
  robot: {
    name: 'Robot Head', mass: 0.6, grip: 0.6, top: 0.26, bottom: 0.15,
    buildMesh() {
      const head = sh(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.26), metal(0xc9d0d8)));
      const g = group(head);
      for (const s of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.035, 10, 8), glow(0x5fe1ff, 1.5), s * 0.07, 0.03, 0.13));
      g.add(mesh(new THREE.BoxGeometry(0.14, 0.025, 0.01), plastic(0x2b2d42), 0, -0.06, 0.131));
      g.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.1, 6), metal(0x9aa3ad), 0, 0.18, 0));
      g.add(mesh(new THREE.SphereGeometry(0.03, 10, 8), glow(0xff3b3b, 1.2), 0, 0.24, 0));
      for (const s of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 12), metal(0x9aa3ad), s * 0.16, 0, 0)).children.at(-1)!.rotateZ(Math.PI / 2);
      return g;
    },
    collider: () => RAPIER.ColliderDesc.cuboid(0.16, 0.15, 0.14),
  },
  coin: {
    name: 'Gold Coin', mass: 0.3, grip: 0.45, top: 0.03, bottom: 0.03,
    buildMesh() {
      const c = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.04, 28), plastic(0xffc928, { roughness: 0.2, metalness: 0.6 }));
      const rim = mesh(new THREE.TorusGeometry(0.135, 0.012, 6, 28), plastic(0xe0a400, { roughness: 0.25, metalness: 0.6 }), 0, 0.021, 0);
      rim.rotation.x = Math.PI / 2;
      const star = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.045, 5), plastic(0xfff1a8, { roughness: 0.2, metalness: 0.4 }));
      return group(c, rim, star);
    },
    collider: () => RAPIER.ColliderDesc.cylinder(0.02, 0.15),
  },
  // ------------------------------------------------------------- desert
  vase: {
    name: 'Vase', mass: 0.45, grip: 0.6, top: 0.2, bottom: 0.2,
    buildMesh() {
      const pts = [[0, -0.2], [0.11, -0.2], [0.16, -0.08], [0.15, 0.04], [0.08, 0.13], [0.07, 0.17], [0.1, 0.2], [0.08, 0.2]].map(([x, y]) => new THREE.Vector2(x, y));
      const v = mesh(new THREE.LatheGeometry(pts, 22), plastic(0xc8693c, { roughness: 0.7, side: THREE.DoubleSide }));
      const band = mesh(new THREE.TorusGeometry(0.152, 0.012, 6, 24), plastic(0x2b2d42, { roughness: 0.6 }), 0, 0.0, 0);
      band.rotation.x = Math.PI / 2;
      return group(v, band);
    },
    collider: () => RAPIER.ColliderDesc.cylinder(0.2, 0.15),
  },
  scarab: {
    name: 'Scarab', mass: 0.35, grip: 0.5, top: 0.08, bottom: 0.07,
    buildMesh() {
      const shell = mesh(new THREE.SphereGeometry(0.13, 16, 12), plastic(0x1fb5a8, { roughness: 0.2, metalness: 0.5 }));
      shell.scale.set(0.85, 0.55, 1.15);
      const line = mesh(new THREE.BoxGeometry(0.01, 0.075, 0.26), plastic(0xffc928, { metalness: 0.6, roughness: 0.25 }), 0, 0.01, 0);
      const head = mesh(new THREE.SphereGeometry(0.055, 12, 8), plastic(0x157a72, { roughness: 0.3, metalness: 0.4 }), 0, 0, 0.15);
      const g = group(shell, line, head);
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
        const leg = mesh(new THREE.CapsuleGeometry(0.01, 0.07, 2, 4), plastic(0x157a72), s * 0.11, -0.04, -0.06 + i * 0.07);
        leg.rotation.z = s * 1.1;
        g.add(leg);
      }
      return g;
    },
    collider: () => RAPIER.ColliderDesc.cuboid(0.12, 0.07, 0.17),
  },
  // ------------------------------------------------------------ haunted
  pumpkin: {
    name: 'Jack-o-lantern', mass: 0.45, grip: 0.6, top: 0.2, bottom: 0.15,
    buildMesh() {
      const g = new THREE.Group();
      const mat = plastic(0xff8c1a, { roughness: 0.45 });
      for (let i = 0; i < 6; i++) {
        const lobe = mesh(new THREE.SphereGeometry(0.11, 14, 10), mat, Math.cos((i / 6) * Math.PI * 2) * 0.07, 0, Math.sin((i / 6) * Math.PI * 2) * 0.07);
        lobe.scale.y = 1.25;
        g.add(lobe);
      }
      g.add(mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.08, 6), plastic(0x4c7a2a), 0, 0.17, 0));
      const eye = glow(0xffd23f, 1.6);
      for (const s of [-1, 1]) {
        const e = mesh(new THREE.ConeGeometry(0.03, 0.045, 3), eye, s * 0.055, 0.04, 0.165);
        e.rotation.x = Math.PI / 2;
        g.add(e);
      }
      g.add(mesh(new THREE.BoxGeometry(0.1, 0.025, 0.02), eye, 0, -0.035, 0.168));
      return g;
    },
    collider: () => RAPIER.ColliderDesc.ball(0.17),
  },
  skull: {
    name: 'Skull', mass: 0.35, grip: 0.6, top: 0.15, bottom: 0.15,
    buildMesh() {
      const bone = plastic(0xf2ead8, { roughness: 0.55 });
      const cranium = mesh(new THREE.SphereGeometry(0.13, 18, 14), bone, 0, 0.03, 0);
      const jaw = mesh(new THREE.BoxGeometry(0.14, 0.07, 0.12), bone, 0, -0.09, 0.03);
      const g = group(cranium, jaw);
      for (const s of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.035, 10, 8), plastic(0x1a1a22), s * 0.05, 0.02, 0.105));
      g.add(mesh(new THREE.ConeGeometry(0.02, 0.03, 3), plastic(0x1a1a22), 0, -0.03, 0.12));
      return g;
    },
    collider: () => RAPIER.ColliderDesc.ball(0.14),
  },
  bat: {
    name: 'Bat', mass: 0.25, grip: 0.5, top: 0.08, bottom: 0.06,
    buildMesh() {
      const fur = plastic(0x3b2a4a, { roughness: 0.6 });
      const g = group(mesh(new THREE.SphereGeometry(0.08, 14, 10), fur));
      const wing = new THREE.Shape();
      wing.moveTo(0, 0.04);
      wing.lineTo(0.24, 0.08);
      wing.quadraticCurveTo(0.2, 0.0, 0.18, -0.03);
      wing.quadraticCurveTo(0.14, 0.0, 0.11, -0.04);
      wing.quadraticCurveTo(0.07, -0.01, 0.0, -0.04);
      wing.closePath();
      const wgeo = new THREE.ExtrudeGeometry(wing, { depth: 0.01, bevelEnabled: false });
      const wmat = plastic(0x52385f, { roughness: 0.5 });
      for (const s of [-1, 1]) {
        const w = mesh(wgeo, wmat);
        w.rotation.set(-Math.PI / 2, 0, 0);
        w.scale.x = s;
        // Hinged at the shoulder so a flying bat can flap (see BatFlight).
        const pivot = group(w);
        pivot.name = 'wing';
        pivot.position.set(s * 0.04, 0.01, 0);
        pivot.userData.side = s;
        g.add(pivot);
      }
      for (const s of [-1, 1]) {
        g.add(mesh(new THREE.ConeGeometry(0.02, 0.05, 4), fur, s * 0.035, 0.08, 0.02));
        g.add(mesh(new THREE.SphereGeometry(0.014, 6, 4), glow(0xff3030, 1.5), s * 0.03, 0.02, 0.07));
      }
      return g;
    },
    collider: () => RAPIER.ColliderDesc.cuboid(0.24, 0.06, 0.1),
  },
  slime: {
    name: 'Slime', mass: 0.35, grip: 0.65, top: 0.13, bottom: 0.13,
    buildMesh() {
      const body = mesh(new THREE.SphereGeometry(0.17, 18, 14), plastic(0x6fe36b, { roughness: 0.1, transparent: true, opacity: 0.85 }));
      body.scale.y = 0.75;
      const g = group(body);
      for (const s of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.025, 8, 6), plastic(0x1a1a22), s * 0.05, 0.04, 0.14));
      return g;
    },
    collider: () => RAPIER.ColliderDesc.ball(0.14),
  },
  candle: {
    name: 'Candle', mass: 0.3, grip: 0.6, top: 0.22, bottom: 0.14,
    buildMesh() {
      const wax = mesh(new THREE.CylinderGeometry(0.06, 0.065, 0.28, 14), plastic(0xf6ecd2, { roughness: 0.5 }));
      const drip = mesh(new THREE.SphereGeometry(0.03, 8, 6), plastic(0xf6ecd2, { roughness: 0.5 }), 0.05, 0.09, 0.02);
      drip.scale.y = 1.8;
      const flame = mesh(new THREE.ConeGeometry(0.025, 0.07, 8), glow(0xffb12b, 2.0), 0, 0.18, 0);
      return group(wax, drip, flame);
    },
    collider: () => RAPIER.ColliderDesc.cylinder(0.17, 0.07),
  },
  // -------------------------------------------------------------- cloud
  feather: {
    name: 'Feather', mass: 0.15, grip: 0.45, top: 0.04, bottom: 0.03,
    buildMesh() {
      const s = new THREE.Shape();
      s.moveTo(0, -0.25);
      s.quadraticCurveTo(0.11, -0.05, 0.03, 0.25);
      s.quadraticCurveTo(-0.11, 0.0, 0, -0.25);
      const geo = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 2 });
      geo.center();
      geo.rotateX(-Math.PI / 2);
      const quill = mesh(new THREE.CylinderGeometry(0.006, 0.01, 0.5, 6), plastic(0xd8c49b), 0, 0.02, 0);
      quill.rotation.x = Math.PI / 2;
      return group(mesh(geo, plastic(0xf6f0ff, { roughness: 0.6 })), quill);
    },
    collider: () => RAPIER.ColliderDesc.cuboid(0.09, 0.03, 0.25),
  },
  // --------------------------------------------------------------- tool
  magnet: {
    name: 'Magnet', mass: 0.6, grip: 0.95, top: 0.17, bottom: 0.14,
    buildMesh() {
      const arc = mesh(new THREE.TorusGeometry(0.11, 0.05, 12, 24, Math.PI), plastic(0xe8384b, { roughness: 0.3 }), 0, 0.02, 0);
      const g = group(arc);
      for (const s of [-1, 1]) {
        g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 14), plastic(0xe8384b, { roughness: 0.3 }), s * 0.11, -0.02, 0));
        g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 14), metal(0xd8dbe6), s * 0.11, -0.09, 0));
      }
      return g;
    },
    collider: () => RAPIER.ColliderDesc.cuboid(0.17, 0.14, 0.06),
  },
};
