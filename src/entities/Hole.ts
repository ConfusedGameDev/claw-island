import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PAL, plastic } from '../scene/Materials';
import { LAYOUT } from '../game/Layout';
import { PhysicsWorld, FLOOR_GROUPS, SENSOR_GROUPS } from '../physics/PhysicsWorld';
import { easeOutBack } from '../util/math';

const OPEN_TIME = 0.7;
const OPEN_ANGLE = THREE.MathUtils.degToRad(96);

/** Trapdoor over the pit, plus the sensor that detects deliveries. */
export class Hole {
  readonly group = new THREE.Group();
  isOpen = false;
  private t = 0;
  private panels: THREE.Group[] = [];
  private panelColliders: RAPIER.Collider[] = [];
  private sensor: RAPIER.Collider;

  readonly center: THREE.Vector3;

  constructor(scene: THREE.Scene, private phys: PhysicsWorld, origin: { x: number; z: number }) {
    const { half } = LAYOUT.HOLE;
    const x = origin.x + LAYOUT.HOLE.x;
    const z = origin.z + LAYOUT.HOLE.z;
    this.center = new THREE.Vector3(x, 0, z);
    this.group.position.set(x, 0, z);
    const frameMat = plastic(PAL.clawDark, { roughness: 0.5 });
    const frameT = 0.08;
    for (const [fx, fz, w, d] of [
      [0, half + frameT / 2, half * 2 + frameT * 2, frameT],
      [0, -half - frameT / 2, half * 2 + frameT * 2, frameT],
      [half + frameT / 2, 0, frameT, half * 2],
      [-half - frameT / 2, 0, frameT, half * 2],
    ]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), frameMat);
      f.position.set(fx, 0.02, fz);
      f.receiveShadow = true;
      this.group.add(f);
    }
    const woodMat = plastic(PAL.woodLight, { roughness: 0.7 });
    const plankMat = plastic(PAL.wood, { roughness: 0.7 });
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * (half - 0.06), -0.04, 0);
      const panel = new THREE.Mesh(new RoundedBoxGeometry(half - 0.02, 0.08, half * 2 - 0.04, 2, 0.02), woodMat);
      panel.position.x = -side * (half / 2 - 0.03);
      panel.castShadow = true;
      panel.receiveShadow = true;
      pivot.add(panel);
      for (const pz of [-0.35, 0, 0.35]) {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(half - 0.1, 0.02, 0.12), plankMat);
        plank.position.set(-side * (half / 2), 0.045, pz);
        pivot.add(plank);
      }
      const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, half * 2, 10), frameMat);
      hinge.rotation.x = Math.PI / 2;
      pivot.add(hinge);
      this.group.add(pivot);
      this.panels.push(pivot);

      const body = phys.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x + side * (half / 2), -0.04, z));
      const col = phys.world.createCollider(
        RAPIER.ColliderDesc.cuboid(half / 2, 0.04, half).setCollisionGroups(FLOOR_GROUPS).setFriction(0.8),
        body,
      );
      this.panelColliders.push(col);
    }
    scene.add(this.group);

    const sensorBody = phys.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, -1.1, z));
    this.sensor = phys.world.createCollider(
      RAPIER.ColliderDesc.cuboid(half + 0.1, 0.5, half + 0.1).setSensor(true).setCollisionGroups(SENSOR_GROUPS),
      sensorBody,
    );
  }

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.t = 0;
    for (const c of this.panelColliders) c.setEnabled(false);
  }

  reset(): void {
    this.isOpen = false;
    this.t = 0;
    for (const c of this.panelColliders) c.setEnabled(true);
    for (const p of this.panels) p.rotation.z = 0;
  }

  /** Per-frame animation. */
  update(dt: number): void {
    if (!this.isOpen || this.t >= OPEN_TIME) return;
    this.t = Math.min(OPEN_TIME, this.t + dt);
    const k = easeOutBack(this.t / OPEN_TIME);
    this.panels[0].rotation.z = -OPEN_ANGLE * k; // left panel (hinge at -x) swings down
    this.panels[1].rotation.z = OPEN_ANGLE * k;
  }

  /** After world.step: dynamic bodies currently inside the pit sensor. */
  poll(): RAPIER.RigidBody[] {
    const out: RAPIER.RigidBody[] = [];
    this.phys.world.intersectionPairsWith(this.sensor, (other) => {
      const b = other.parent();
      if (b && b.bodyType() === RAPIER.RigidBodyType.Dynamic) out.push(b);
    });
    return out;
  }
}
