import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { PAL, plastic } from '../scene/Materials';
import { LAYOUT } from '../game/Layout';
import { PhysicsWorld, FLOOR_GROUPS, SENSOR_GROUPS } from '../physics/PhysicsWorld';
import { easeOutCubic } from '../util/math';

const CAP_UP_Y = 0.24;
const CAP_DOWN_Y = 0.13;
const PRESS_MASS = 4;
const REST_TIME = 0.3;

/** Big red button. Opens the hole when something heavy rests on it. */
export class Button {
  readonly group = new THREE.Group();
  pressed = false;
  onPressed: (() => void) | null = null;
  private capBody: RAPIER.RigidBody;
  private capMesh: THREE.Group;
  private sensor: RAPIER.Collider;
  private restTime = 0;
  private animT = 1;
  private capY = CAP_UP_Y;
  readonly pos: THREE.Vector3;

  constructor(scene: THREE.Scene, private phys: PhysicsWorld, origin: { x: number; z: number }, local: { x: number; z: number }) {
    const { radius } = LAYOUT.BUTTON;
    const x = origin.x + local.x;
    const z = origin.z + local.z;
    this.pos = new THREE.Vector3(x, 0, z);
    this.group.position.set(x, 0, z);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius + 0.04, 0.16, 28), plastic(PAL.buttonBase, { roughness: 0.4 }));
    base.position.y = 0.08;
    base.castShadow = true;
    base.receiveShadow = true;
    this.group.add(base);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(radius - 0.06, 0.025, 8, 36), plastic(PAL.clawDark, { roughness: 0.4 }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.165;
    this.group.add(rim);

    this.capMesh = new THREE.Group();
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.52, 0.16, 32), plastic(PAL.buttonCap, { roughness: 0.3 }));
    cap.castShadow = true;
    const capTop = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2), plastic(PAL.buttonCap, { roughness: 0.3 }));
    capTop.position.y = 0.08;
    capTop.scale.y = 0.15;
    capTop.castShadow = true;
    this.capMesh.add(cap, capTop);
    this.capMesh.position.set(0, CAP_UP_Y, 0);
    this.group.add(this.capMesh);
    scene.add(this.group);

    // Base is fixed; the cap is kinematic so it can sink.
    const baseBody = phys.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, 0.08, z));
    phys.world.createCollider(RAPIER.ColliderDesc.cylinder(0.08, radius).setCollisionGroups(FLOOR_GROUPS).setFriction(0.9), baseBody);
    this.capBody = phys.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, CAP_UP_Y, z));
    phys.world.createCollider(RAPIER.ColliderDesc.cylinder(0.08, 0.5).setCollisionGroups(FLOOR_GROUPS).setFriction(0.9), this.capBody);
    const sensorBody = phys.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, 0.37, z));
    this.sensor = phys.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.45, 0.07, 0.45).setSensor(true).setCollisionGroups(SENSOR_GROUPS),
      sensorBody,
    );
  }

  reset(): void {
    this.pressed = false;
    this.restTime = 0;
    this.animT = 1;
    this.capY = CAP_UP_Y;
    this.capBody.setNextKinematicTranslation({ x: this.pos.x, y: CAP_UP_Y, z: this.pos.z });
    this.capMesh.position.y = CAP_UP_Y;
  }

  /** Physics substep (before world.step). */
  step(dt: number): void {
    if (this.pressed && this.animT < 1) {
      this.animT = Math.min(1, this.animT + dt / 0.25);
      this.capY = CAP_UP_Y + (CAP_DOWN_Y - CAP_UP_Y) * easeOutCubic(this.animT);
      this.capBody.setNextKinematicTranslation({ x: this.pos.x, y: this.capY, z: this.pos.z });
    }
  }

  /** After world.step: look for something heavy resting on the cap. */
  poll(dt: number): void {
    if (this.pressed) return;
    let heavy = false;
    this.phys.world.intersectionPairsWith(this.sensor, (other) => {
      const b = other.parent();
      if (!b || b.bodyType() !== RAPIER.RigidBodyType.Dynamic) return;
      if (b.mass() < PRESS_MASS) return;
      const v = b.linvel();
      if (Math.hypot(v.x, v.y, v.z) < 0.6) heavy = true;
    });
    this.restTime = heavy ? this.restTime + dt : 0;
    if (this.restTime >= REST_TIME) {
      this.pressed = true;
      this.animT = 0;
      this.onPressed?.();
    }
  }

  /** Per-frame visuals. */
  update(): void {
    this.capMesh.position.y = this.capY;
  }
}
