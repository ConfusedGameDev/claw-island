import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

/** Collision group bits. */
export const G = { FLOOR: 1, OBJECT: 2, CLAW: 4, SENSOR: 8, CHICKEN: 16 } as const;
/** Rapier interaction groups: upper 16 bits = membership, lower 16 = filter. */
export const groups = (member: number, filter: number): number => ((member << 16) | filter) >>> 0;

export const OBJECT_GROUPS = groups(G.OBJECT, G.FLOOR | G.OBJECT | G.CLAW | G.SENSOR);
/** Objects currently held by the claw ignore the claw fingers so release never pops. */
export const HELD_GROUPS = groups(G.OBJECT, G.FLOOR | G.OBJECT | G.SENSOR);
export const FLOOR_GROUPS = groups(G.FLOOR, G.OBJECT);
export const CLAW_GROUPS = groups(G.CLAW, G.OBJECT);
export const SENSOR_GROUPS = groups(G.SENSOR, G.OBJECT);
/** Chickens only interact with the claw (grab queries); nothing pushes them. */
export const CHICKEN_GROUPS = groups(G.CHICKEN, G.CLAW);
/** Query groups used by the claw to find things to grab or stop above. */
export const GRAB_QUERY_GROUPS = groups(G.CLAW, G.OBJECT | G.CHICKEN);

interface Synced {
  body: RAPIER.RigidBody;
  mesh: THREE.Object3D;
  prevP: THREE.Vector3;
  prevQ: THREE.Quaternion;
  currP: THREE.Vector3;
  currQ: THREE.Quaternion;
}

/**
 * Thin wrapper around a Rapier world: fixed 60 Hz stepping with an
 * accumulator, plus a body <-> mesh registry rendered with interpolation.
 */
export class PhysicsWorld {
  readonly world: RAPIER.World;
  readonly DT = 1 / 60;
  readonly MAX_SUBSTEPS = 4;
  alpha = 1;
  private synced = new Map<number, Synced>();
  private acc = 0;

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = this.DT;
  }

  register(body: RAPIER.RigidBody, mesh: THREE.Object3D): void {
    const p = body.translation();
    const q = body.rotation();
    const s: Synced = {
      body,
      mesh,
      prevP: new THREE.Vector3(p.x, p.y, p.z),
      prevQ: new THREE.Quaternion(q.x, q.y, q.z, q.w),
      currP: new THREE.Vector3(p.x, p.y, p.z),
      currQ: new THREE.Quaternion(q.x, q.y, q.z, q.w),
    };
    mesh.position.copy(s.currP);
    mesh.quaternion.copy(s.currQ);
    this.synced.set(body.handle, s);
  }

  unregister(body: RAPIER.RigidBody): void {
    this.synced.delete(body.handle);
  }

  removeBody(body: RAPIER.RigidBody): void {
    this.unregister(body);
    this.world.removeRigidBody(body);
  }

  /** Force the registry to the body's current transform (after teleports). */
  snap(body: RAPIER.RigidBody): void {
    const s = this.synced.get(body.handle);
    if (!s) return;
    const p = body.translation();
    const q = body.rotation();
    s.currP.set(p.x, p.y, p.z);
    s.currQ.set(q.x, q.y, q.z, q.w);
    s.prevP.copy(s.currP);
    s.prevQ.copy(s.currQ);
    s.mesh.position.copy(s.currP);
    s.mesh.quaternion.copy(s.currQ);
  }

  update(frameDt: number, preStep: (dt: number) => void, postStep: () => void): void {
    this.acc += Math.min(frameDt, 0.1);
    let steps = 0;
    while (this.acc >= this.DT && steps < this.MAX_SUBSTEPS) {
      for (const s of this.synced.values()) {
        s.prevP.copy(s.currP);
        s.prevQ.copy(s.currQ);
      }
      preStep(this.DT);
      this.world.step();
      for (const s of this.synced.values()) {
        const p = s.body.translation();
        const q = s.body.rotation();
        s.currP.set(p.x, p.y, p.z);
        s.currQ.set(q.x, q.y, q.z, q.w);
      }
      postStep();
      this.acc -= this.DT;
      steps++;
    }
    if (steps === this.MAX_SUBSTEPS) this.acc = 0;
    this.alpha = this.acc / this.DT;
    for (const s of this.synced.values()) {
      s.mesh.position.lerpVectors(s.prevP, s.currP, this.alpha);
      s.mesh.quaternion.slerpQuaternions(s.prevQ, s.currQ, this.alpha);
    }
  }

  /** Axis-aligned fixed box collider helper. */
  addFixedBox(center: THREE.Vector3Like, half: THREE.Vector3Like, opts: { friction?: number; groups?: number; sensor?: boolean } = {}): RAPIER.Collider {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(center.x, center.y, center.z));
    const desc = RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z)
      .setFriction(opts.friction ?? 0.9)
      .setCollisionGroups(opts.groups ?? FLOOR_GROUPS)
      .setSensor(opts.sensor ?? false);
    return this.world.createCollider(desc, body);
  }

  /** Fixed triangle-mesh collider (used for carved floors). */
  addFixedTrimesh(vertices: Float32Array, indices: Uint32Array, opts: { friction?: number; groups?: number } = {}): RAPIER.Collider {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const desc = RAPIER.ColliderDesc.trimesh(vertices, indices)
      .setFriction(opts.friction ?? 0.9)
      .setCollisionGroups(opts.groups ?? FLOOR_GROUPS);
    return this.world.createCollider(desc, body);
  }

  /** Wireframe of all colliders for debugging (toggle with P). */
  debugLines(): THREE.LineSegments {
    const buffers = this.world.debugRender();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(buffers.vertices, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(buffers.colors, 4));
    return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true }));
  }
}
