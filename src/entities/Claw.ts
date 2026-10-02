import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PAL, plastic } from '../scene/Materials';
import { LAYOUT } from '../game/Layout';
import { PhysicsWorld, CLAW_GROUPS, GRAB_QUERY_GROUPS, groups, G } from '../physics/PhysicsWorld';
import { grabbableOf, type Grabbable } from './Grabbable';
import type { Input } from '../game/Input';
import { clamp, damp, easeOutCubic, lerp } from '../util/math';
import { boneDarkMat, boneGeometry, boneMat, skullMesh } from '../scene/Bones';

export const CLAW = {
  MOVE_SPEED: 2.4,
  ROTATE_SPEED: 2.6,
  DESCEND_SPEED: 2.6,
  ASCEND_SPEED: 2.0,
  CLOSE_TIME: 0.35,
  SQUEEZE_TIME: 0.15,
  OPEN_TIME: 0.25,
  /** Grab query center below the hub. */
  TIP_Y: -0.35,
  GRAB_RADIUS: 0.5,
  /** Max horizontal offset from the hub axis an object can be grabbed at. */
  GRAB_REACH: 0.42,
  /** Lowest point of the open fingers relative to the hub. */
  FINGER_BOTTOM: -0.5,
  MIN_TIP_CLEARANCE: 0.03,
  FINGER_OPEN: THREE.MathUtils.degToRad(55),
  FINGER_CLOSED: THREE.MathUtils.degToRad(10),
  /** Vertical offset of a held object's top below the hub. */
  HOLD_GAP: 0.13,
  FINGER_PIVOT_R: 0.18,
  FINGER_PIVOT_Y: -0.05,
  FINGER_HALF: 0.22,
} as const;

export type ClawState = 'IDLE' | 'DESCENDING' | 'CLOSING' | 'SQUEEZING' | 'ASCENDING' | 'HOLDING' | 'LOWERING' | 'RELEASING' | 'TRAVEL';

export interface ClawEvents {
  onAttempt?: () => void;
  /** The grip is failing: the drop is imminent. */
  onTell?: () => void;
  onGrab?: (c: Grabbable) => void;
  onMiss?: () => void;
  onSlip?: (c: Grabbable) => void;
  /** The thing wriggled free on its own (chickens). */
  onEscape?: (c: Grabbable) => void;
  /** Claw closed on something it cannot lift. */
  onTooHeavy?: (c: Grabbable) => void;
  /** Claw picked up a tool (the magnet) instead of an object. */
  onToolPickup?: (c: Grabbable) => void;
  onRelease?: (c: Grabbable) => void;
}

const IDENTITY_Q = { x: 0, y: 0, z: 0, w: 1 };
/** Ray filter that only sees static floor-like colliders (floor, belt, button, trapdoors). */
const GROUND_GROUPS = groups(G.OBJECT, G.FLOOR);
/** Query groups that see loose objects, chickens and the floor/button. */
const LOWER_GROUPS = groups(G.OBJECT | G.CLAW, G.OBJECT | G.FLOOR | G.CHICKEN);
/** How far above the surface below a held object is let go. */
const RELEASE_CLEARANCE = 0.3;
/** Fraction of the ascent over which the slip tell builds up. */
const TELL_SPAN = 0.28;
/** Seconds of wobble before a self-escaping thing gets away. */
const ESCAPE_TELL = 0.6;

/**
 * The UFO-catcher crane: gantry visuals, kinematic claw head with finger
 * colliders, and the drop/grab/lift/lower/release sequence.
 */
export class Claw {
  readonly rig = new THREE.Group();
  readonly head = new THREE.Group();
  readonly body: RAPIER.RigidBody;
  state: ClawState = 'IDLE';
  held: Grabbable | null = null;
  events: ClawEvents = {};

  /** Logical (target) head position; the kinematic body is driven toward it. */
  readonly pos = new THREE.Vector3(0, LAYOUT.GANTRY.restY, 0);
  readonly vel = new THREE.Vector3();
  /** Heading of the claw head around the vertical axis. */
  yaw = 0;
  /** World-space gantry limits for the current island. */
  readonly bounds = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  /** Multiplies grip tolerances (per level difficulty). */
  gripScale = 1;
  /** Future Lab: the bare claw cannot lift anything except tools. */
  heavyAll = false;
  /** Horizontal wind pushing the crane (m/s), set by the game each frame. */
  wind = 0;
  tool: 'claw' | 'magnet' = 'claw';
  private magnetMesh!: THREE.Group;
  /** Surface height under the claw, measured when a drop starts. */
  private groundY = 0;
  /** Set when a close ended in a tool pickup or a too-heavy object (no miss sound). */
  private quietMiss = false;
  private yawVel = 0;
  private t = 0;
  private open01 = 1;
  private appliedOpen = -1;
  private slipAt = -1;
  private slipping = false;
  /** 0..1 strength of the "grip failing" wobble. */
  private tell = 0;
  private tellFired = false;
  private wobbleT = 0;
  private holdT = 0;
  private grabStart = new THREE.Vector3();
  private grabRotation = new THREE.Quaternion();
  private grabYaw = 0;

  private fingerPivots: THREE.Group[] = [];
  private fingerColliders: RAPIER.Collider[] = [];
  private carriage!: THREE.Object3D;
  private crossbar!: THREE.Object3D;
  private cable!: THREE.Mesh;
  /** Bone look: vertebrae strung along the cable, kept at a fixed size. */
  private cableBeads: THREE.Group | null = null;
  private static readonly BEAD_SPACING = 0.11;
  private bounce = 0;
  private bounceVel = 0;

  private tmpV = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();
  private tmpQ2 = new THREE.Quaternion();
  private yawQ = new THREE.Quaternion();
  private readonly UP = new THREE.Vector3(0, 1, 0);

  constructor(scene: THREE.Scene, private phys: PhysicsWorld, look: 'plastic' | 'bone' = 'plastic') {
    this.setOrigin({ x: 0, z: 0 });
    if (look === 'bone') this.buildBoneVisuals();
    else this.buildPlasticVisuals();
    scene.add(this.rig);
    scene.add(this.head);

    this.buildMagnet();

    // ---- physics
    this.body = phys.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.pos.x, this.pos.y, this.pos.z),
    );
    phys.world.createCollider(RAPIER.ColliderDesc.cylinder(0.08, 0.22).setCollisionGroups(CLAW_GROUPS), this.body);
    for (let i = 0; i < 3; i++) {
      const col = phys.world.createCollider(
        RAPIER.ColliderDesc.capsule(CLAW.FINGER_HALF, 0.05).setCollisionGroups(CLAW_GROUPS).setFriction(1.0),
        this.body,
      );
      this.fingerColliders.push(col);
    }
    phys.register(this.body, this.head);
    this.applyFingers(1);
  }

  // -------------------------------------------------------------- visuals
  private buildPlasticVisuals(): void {
    const { GANTRY } = LAYOUT;
    const frameMat = plastic(PAL.gantry, { roughness: 0.35 });
    const accentMat = plastic(PAL.gantryAccent, { roughness: 0.35 });

    this.crossbar = new THREE.Mesh(new THREE.BoxGeometry(GANTRY.postX * 2 + 0.2, 0.14, 0.14), frameMat);
    this.crossbar.position.y = GANTRY.railY + 0.12;
    this.crossbar.castShadow = true;
    this.rig.add(this.crossbar);
    for (const sx of [-1, 1]) {
      const shoe = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.22, 0.34, 3, 0.06), accentMat);
      shoe.position.set(sx * GANTRY.postX, 0, 0);
      shoe.castShadow = true;
      this.crossbar.add(shoe);
    }
    this.carriage = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.34, 0.46, 3, 0.08), frameMat);
    this.carriage.position.y = GANTRY.railY + 0.12;
    this.carriage.castShadow = true;
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), plastic(PAL.heart, { emissive: PAL.heart, emissiveIntensity: 0.8 }));
    light.position.y = 0.2;
    this.carriage.add(light);
    this.rig.add(this.carriage);

    const cableGeo = new THREE.CylinderGeometry(0.018, 0.018, 1, 6);
    cableGeo.translate(0, -0.5, 0);
    this.cable = new THREE.Mesh(cableGeo, plastic(PAL.cable, { roughness: 0.6 }));
    this.rig.add(this.cable);

    // ---- head visuals
    const clawMat = plastic(PAL.claw, { roughness: 0.3, metalness: 0.1 });
    const darkMat = plastic(PAL.clawDark, { roughness: 0.4 });
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.16, 16), clawMat);
    hub.castShadow = true;
    this.head.add(hub);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), accentMat);
    dome.position.y = 0.08;
    dome.scale.y = 0.6;
    dome.castShadow = true;
    this.head.add(dome);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.025, 8, 24), darkMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.06;
    this.head.add(ring);
    // A little arrow on the dome so the heading reads from above.
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 3), plastic(PAL.heart, { roughness: 0.4 }));
    marker.rotation.x = Math.PI / 2;
    marker.position.set(0, 0.16, 0.12);
    this.head.add(marker);

    for (let i = 0; i < 3; i++) {
      const pivot = new THREE.Group();
      const theta = (i / 3) * Math.PI * 2;
      pivot.position.set(Math.cos(theta) * CLAW.FINGER_PIVOT_R, CLAW.FINGER_PIVOT_Y, Math.sin(theta) * CLAW.FINGER_PIVOT_R);
      const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), darkMat);
      pivot.add(knuckle);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.3, 3, 10), clawMat);
      upper.position.y = -0.17;
      upper.castShadow = true;
      pivot.add(upper);
      const lower = new THREE.Group();
      lower.position.y = -0.32;
      const axis = this.fingerAxis(i, this.tmpV);
      lower.quaternion.setFromAxisAngle(axis, -0.65);
      const seg = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.16, 3, 10), clawMat);
      seg.position.y = -0.1;
      seg.castShadow = true;
      lower.add(seg);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), darkMat);
      tip.position.y = -0.2;
      lower.add(tip);
      pivot.add(lower);
      this.head.add(pivot);
      this.fingerPivots.push(pivot);
    }
  }

  /** Spooky campaign: bone crossbar, skull carriage, vertebra cable, skeletal fingers. */
  private buildBoneVisuals(): void {
    const { GANTRY } = LAYOUT;
    const bone = boneMat();
    const dark = boneDarkMat();
    const eyeGlow = plastic(0xb48cff, { emissive: 0xb48cff, emissiveIntensity: 1.4, roughness: 0.3 });

    // Crossbar: one long bone with knobbly shoes riding the spine rails.
    const crossbar = new THREE.Mesh(boneGeometry(GANTRY.postX * 2 - 0.1, 0.07), bone);
    crossbar.rotation.z = Math.PI / 2;
    crossbar.castShadow = true;
    this.crossbar = new THREE.Group();
    this.crossbar.position.y = GANTRY.railY + 0.12;
    this.crossbar.add(crossbar);
    this.rig.add(this.crossbar);
    for (const sx of [-1, 1]) {
      const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), dark);
      shoe.scale.y = 0.75;
      shoe.position.set(sx * GANTRY.postX, 0, 0);
      shoe.castShadow = true;
      this.crossbar.add(shoe);
    }
    // Carriage: a big kawaii skull with glowing eyes.
    this.carriage = skullMesh(0.5, eyeGlow);
    this.carriage.position.y = GANTRY.railY + 0.12;
    this.rig.add(this.carriage);

    // Cable: a thin cord threaded with vertebrae (they keep their size as the cord stretches).
    const cordGeo = new THREE.CylinderGeometry(0.014, 0.014, 1, 6);
    cordGeo.translate(0, -0.5, 0);
    this.cable = new THREE.Mesh(cordGeo, dark);
    this.rig.add(this.cable);
    this.cableBeads = new THREE.Group();
    const beadGeo = new THREE.SphereGeometry(0.055, 10, 6).scale(1.2, 0.5, 1.2);
    for (let i = 0; i < 40; i++) {
      const bead = new THREE.Mesh(beadGeo, bone);
      bead.position.y = -(i + 0.5) * Claw.BEAD_SPACING;
      this.cableBeads.add(bead);
    }
    this.rig.add(this.cableBeads);

    // ---- head: a little skull hub with three finger bones
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.12, 16), dark);
    hub.castShadow = true;
    this.head.add(hub);
    const skull = skullMesh(0.36, eyeGlow);
    skull.position.y = 0.17;
    this.head.add(skull);
    // A little bow on the skull marks the heading.
    const bowMat = plastic(0xff7fb0, { roughness: 0.4 });
    for (const s of [-1, 1]) {
      const loop = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.09, 8), bowMat);
      loop.rotation.z = s * Math.PI / 2;
      loop.position.set(s * 0.05, 0.33, 0.06);
      this.head.add(loop);
    }
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), bowMat);
    knot.position.set(0, 0.33, 0.06);
    this.head.add(knot);

    const upperGeo = boneGeometry(0.3, 0.035);
    const lowerGeo = boneGeometry(0.15, 0.03);
    for (let i = 0; i < 3; i++) {
      const pivot = new THREE.Group();
      const theta = (i / 3) * Math.PI * 2;
      pivot.position.set(Math.cos(theta) * CLAW.FINGER_PIVOT_R, CLAW.FINGER_PIVOT_Y, Math.sin(theta) * CLAW.FINGER_PIVOT_R);
      const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), dark);
      pivot.add(knuckle);
      const upper = new THREE.Mesh(upperGeo, bone);
      upper.position.y = -0.17;
      upper.castShadow = true;
      pivot.add(upper);
      const lower = new THREE.Group();
      lower.position.y = -0.32;
      const axis = this.fingerAxis(i, this.tmpV);
      lower.quaternion.setFromAxisAngle(axis, -0.65);
      const seg = new THREE.Mesh(lowerGeo, bone);
      seg.position.y = -0.1;
      seg.castShadow = true;
      lower.add(seg);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.09, 8), dark);
      tip.rotation.x = Math.PI;
      tip.position.y = -0.21;
      lower.add(tip);
      pivot.add(lower);
      this.head.add(pivot);
      this.fingerPivots.push(pivot);
    }
  }

  private buildMagnet(): void {
    // Magnet tool, hidden until picked up.
    this.magnetMesh = new THREE.Group();
    const red = plastic(PAL.buttonCap, { roughness: 0.3 });
    const steel = plastic(PAL.claw, { roughness: 0.25, metalness: 0.6 });
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.06, 12, 24, Math.PI), red);
    arc.position.y = -0.14;
    arc.castShadow = true;
    this.magnetMesh.add(arc);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 14), red);
      leg.position.set(s * 0.15, -0.2, 0);
      const tipM = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 14), steel);
      tipM.position.set(s * 0.15, -0.3, 0);
      leg.castShadow = tipM.castShadow = true;
      this.magnetMesh.add(leg, tipM);
    }
    this.magnetMesh.visible = false;
    this.head.add(this.magnetMesh);
  }

  // -------------------------------------------------------------- helpers
  /** Rotation axis that swings finger i outward from hanging straight down. */
  private fingerAxis(i: number, out: THREE.Vector3): THREE.Vector3 {
    const theta = (i / 3) * Math.PI * 2;
    return out.set(-Math.sin(theta), 0, Math.cos(theta));
  }

  private applyFingers(open01: number): void {
    if (Math.abs(open01 - this.appliedOpen) < 1e-4) return;
    this.appliedOpen = open01;
    const angle = lerp(CLAW.FINGER_CLOSED, CLAW.FINGER_OPEN, open01);
    for (let i = 0; i < 3; i++) {
      const axis = this.fingerAxis(i, this.tmpV);
      this.tmpQ.setFromAxisAngle(axis, angle);
      const pivot = this.fingerPivots[i];
      pivot.quaternion.copy(this.tmpQ);
      // Capsule center = pivot + q * (0, -half, 0)
      const center = new THREE.Vector3(0, -CLAW.FINGER_HALF, 0).applyQuaternion(this.tmpQ).add(pivot.position);
      this.fingerColliders[i].setTranslationWrtParent(center);
      this.fingerColliders[i].setRotationWrtParent({ x: this.tmpQ.x, y: this.tmpQ.y, z: this.tmpQ.z, w: this.tmpQ.w });
    }
  }

  /** Visual-only finger flutter while the grip is failing. */
  private flutterFingers(tell: number): void {
    const flutter = Math.abs(Math.sin((performance.now() / 1000) * 30)) * 0.12 * tell;
    const angle = lerp(CLAW.FINGER_CLOSED, CLAW.FINGER_OPEN, Math.min(1, this.open01 + flutter));
    for (let i = 0; i < 3; i++) {
      const axis = this.fingerAxis(i, this.tmpV);
      this.fingerPivots[i].quaternion.setFromAxisAngle(axis, angle);
    }
  }

  private enter(state: ClawState): void {
    this.state = state;
    this.t = 0;
    this.bounceVel = state === 'SQUEEZING' ? -4 : state === 'IDLE' || state === 'HOLDING' ? 2.5 : 0;
  }

  get headWorldPos(): THREE.Vector3 {
    return this.head.position;
  }

  /** Re-anchor the gantry limits on an island. */
  setOrigin(origin: { x: number; z: number }): void {
    const { GANTRY } = LAYOUT;
    this.bounds.minX = origin.x + GANTRY.minX;
    this.bounds.maxX = origin.x + GANTRY.maxX;
    this.bounds.minZ = origin.z + GANTRY.minZ;
    this.bounds.maxZ = origin.z + GANTRY.maxZ;
  }

  /** Hand control of `pos` to the game while riding to the next island. */
  beginTravel(): void {
    if (this.held) this.detach(true);
    this.vel.set(0, 0, 0);
    this.open01 = 1;
    this.enter('TRAVEL');
  }

  endTravel(): void {
    this.setTool('claw');
    this.pos.y = LAYOUT.GANTRY.restY;
    this.yaw = 0;
    this.yawVel = 0;
    this.enter('IDLE');
  }

  /** Snap the crane to a position (level start). */
  teleport(x: number, z: number): void {
    this.pos.set(x, LAYOUT.GANTRY.restY, z);
    this.vel.set(0, 0, 0);
    this.yaw = 0;
    this.yawVel = 0;
    this.body.setTranslation(this.pos, true);
    this.body.setRotation(IDENTITY_Q, true);
    this.phys.snap(this.body);
  }

  private get holdGap(): number {
    return this.tool === 'magnet' ? 0.34 : CLAW.HOLD_GAP;
  }

  setTool(tool: 'claw' | 'magnet'): void {
    this.tool = tool;
    const magnet = tool === 'magnet';
    this.magnetMesh.visible = magnet;
    for (const p of this.fingerPivots) p.visible = !magnet;
    for (const c of this.fingerColliders) c.setEnabled(!magnet);
    this.bounceVel = 3;
  }

  /** Height of the first floor-like surface below a point (0 if none). */
  private surfaceBelow(x: number, z: number): number {
    const ray = new RAPIER.Ray({ x, y: LAYOUT.GANTRY.restY + 0.5, z }, { x: 0, y: -1, z: 0 });
    const hit = this.phys.world.castRay(ray, 8, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, GROUND_GROUPS);
    return hit ? LAYOUT.GANTRY.restY + 0.5 - hit.timeOfImpact : LAYOUT.FLOOR_Y;
  }

  get busy(): boolean {
    return this.state !== 'IDLE' && this.state !== 'HOLDING';
  }

  reset(origin: { x: number; z: number }): void {
    if (this.held) this.detach(false);
    this.setTool('claw');
    this.setOrigin(origin);
    this.open01 = 1;
    this.applyFingers(1);
    this.teleport(origin.x, origin.z);
    this.enter('IDLE');
  }

  /** Called once per physics substep, before world.step(). */
  step(dt: number, input: Input, inputEnabled: boolean): void {
    const { GANTRY, FLOOR_Y } = LAYOUT;
    // Rotation is allowed whenever the claw is not mid-sequence.
    const rot = inputEnabled && !this.busy ? input.rotate : 0;
    this.yawVel = damp(this.yawVel, rot * CLAW.ROTATE_SPEED, 14, dt);
    this.yaw += this.yawVel * dt;

    switch (this.state) {
      case 'IDLE':
      case 'HOLDING': {
        const ax = inputEnabled ? input.axisX : 0;
        const az = inputEnabled ? input.axisZ : 0;
        const len = Math.hypot(ax, az) || 1;
        this.vel.x = damp(this.vel.x, (ax / len) * CLAW.MOVE_SPEED, 14, dt);
        this.vel.z = damp(this.vel.z, (az / len) * CLAW.MOVE_SPEED, 14, dt);
        this.pos.x = clamp(this.pos.x + (this.vel.x + this.wind) * dt, this.bounds.minX, this.bounds.maxX);
        this.pos.z = clamp(this.pos.z + (this.vel.z + this.wind * 0.3) * dt, this.bounds.minZ, this.bounds.maxZ);
        if (inputEnabled && input.consumeDrop()) {
          this.vel.set(0, 0, 0);
          if (this.state === 'IDLE') {
            this.events.onAttempt?.();
            this.groundY = this.surfaceBelow(this.pos.x, this.pos.z);
            this.enter('DESCENDING');
          } else {
            this.enter('LOWERING');
          }
        }
        break;
      }
      case 'DESCENDING': {
        let move = CLAW.DESCEND_SPEED * dt;
        const hubPos = this.body.translation();
        const hit = this.phys.world.castShape(
          hubPos, IDENTITY_Q, { x: 0, y: -1, z: 0 }, new RAPIER.Ball(0.2), 0, 3, true, undefined, GRAB_QUERY_GROUPS,
        );
        let stop = false;
        if (hit) {
          const allowed = hit.time_of_impact - 0.04;
          if (allowed <= 0.004) { stop = true; move = 0; }
          else move = Math.min(move, allowed);
        }
        // Gusts keep nudging the cable on the way down.
        this.pos.x = clamp(this.pos.x + this.wind * 0.5 * dt, this.bounds.minX, this.bounds.maxX);
        const minY = this.groundY + CLAW.MIN_TIP_CLEARANCE - CLAW.FINGER_BOTTOM;
        this.pos.y = Math.max(minY, this.pos.y - move);
        if (this.pos.y <= minY + 1e-4) stop = true;
        if (stop) this.enter('CLOSING');
        break;
      }
      case 'CLOSING': {
        this.t += dt;
        this.open01 = 1 - easeOutCubic(Math.min(1, this.t / CLAW.CLOSE_TIME));
        if (this.t >= CLAW.CLOSE_TIME) {
          this.quietMiss = false;
          if (this.tryGrab()) this.enter('SQUEEZING');
          else {
            if (!this.quietMiss) this.events.onMiss?.();
            this.enter('ASCENDING');
          }
        }
        break;
      }
      case 'SQUEEZING': {
        this.t += dt;
        if (this.t >= CLAW.SQUEEZE_TIME) this.enter('ASCENDING');
        break;
      }
      case 'ASCENDING': {
        const start = Math.min(this.groundY, FLOOR_Y) + CLAW.MIN_TIP_CLEARANCE - CLAW.FINGER_BOTTOM;
        this.pos.y = Math.min(GANTRY.restY, this.pos.y + CLAW.ASCEND_SPEED * dt);
        const progress = (this.pos.y - start) / (GANTRY.restY - start);
        if (this.held && this.slipping) {
          // Wobble builds up over the last stretch before the drop.
          this.tell = clamp(1 - (this.slipAt - progress) / TELL_SPAN, 0, 1);
          this.fireTell();
        }
        if (this.held && this.slipping && progress >= this.slipAt) {
          const c = this.held;
          this.detach(true);
          this.open01 = 0.55;
          this.events.onSlip?.(c);
        }
        if (this.pos.y >= GANTRY.restY - 1e-4) {
          if (this.held) this.enter('HOLDING');
          else {
            this.open01 = 1;
            this.enter('IDLE');
          }
        }
        break;
      }
      case 'LOWERING': {
        const held = this.held;
        if (!held || held.removed) { this.enter('RELEASING'); break; }
        const { top, bottom } = held.def;
        let move = CLAW.DESCEND_SPEED * dt;
        const centerY = this.pos.y - this.holdGap - top;
        const hit = this.phys.world.castShape(
          { x: this.pos.x, y: centerY, z: this.pos.z }, IDENTITY_Q, { x: 0, y: -1, z: 0 }, new RAPIER.Ball(0.2),
          0, 4, true, undefined, LOWER_GROUPS, undefined, held.body,
        );
        let stop = false;
        if (hit) {
          // Ball bottom is 0.2 below the center; object bottom is `bottom` below it.
          const gap = hit.time_of_impact + 0.2 - bottom - RELEASE_CLEARANCE;
          if (gap <= 0.004) { stop = true; move = 0; }
          else move = Math.min(move, gap);
        }
        const minY = FLOOR_Y + RELEASE_CLEARANCE + bottom + this.holdGap + top;
        this.pos.y = Math.max(minY, this.pos.y - move);
        if (this.pos.y <= minY + 1e-4) stop = true;
        if (stop) {
          this.enter('RELEASING');
          this.detach(true);
        }
        break;
      }
      case 'TRAVEL':
        // The game drives pos/yaw directly.
        break;
      case 'RELEASING': {
        this.t += dt;
        this.open01 = Math.max(this.open01, easeOutCubic(Math.min(1, this.t / CLAW.OPEN_TIME)));
        if (this.t >= CLAW.OPEN_TIME) {
          this.open01 = 1;
          this.enter(this.pos.y < GANTRY.restY - 1e-3 ? 'ASCENDING' : 'IDLE');
        }
        break;
      }
    }

    // Things that wriggle free on their own, whatever the claw is doing.
    if (this.held && this.held.escapeAfter !== undefined && this.state !== 'RELEASING') {
      const remaining = this.held.escapeAfter - this.holdT;
      this.tell = Math.max(this.tell, clamp(1 - remaining / ESCAPE_TELL, 0, 1));
      this.fireTell();
      if (remaining <= 0) {
        const c = this.held;
        this.detach(true);
        this.open01 = Math.max(this.open01, 0.55);
        this.events.onEscape?.(c);
        if (this.state === 'HOLDING' || this.state === 'LOWERING') this.enter('ASCENDING');
      }
    }

    this.applyFingers(this.open01);
    this.body.setNextKinematicTranslation(this.pos);
    this.yawQ.setFromAxisAngle(this.UP, this.yaw);
    this.body.setNextKinematicRotation({ x: this.yawQ.x, y: this.yawQ.y, z: this.yawQ.z, w: this.yawQ.w });

    if (this.held) {
      this.holdT += dt;
      const target = this.tmpV.set(this.pos.x, this.pos.y - this.holdGap - this.held.def.top, this.pos.z);
      const k = easeOutCubic(Math.min(1, this.holdT / (this.tool === 'magnet' ? 0.3 : 0.12)));
      target.lerpVectors(this.grabStart, target, k);
      const kr = Math.min(1, this.holdT / 0.3);
      // Upright, turned with the claw since it was grabbed.
      this.tmpQ.copy(this.grabRotation).slerp(this.tmpQ2.identity(), easeOutCubic(kr));
      this.tmpQ2.setFromAxisAngle(this.UP, this.yaw - this.grabYaw);
      this.tmpQ.premultiply(this.tmpQ2);
      if (this.tell > 0) {
        this.wobbleT += dt;
        const a = this.tell * 0.35;
        const w = this.wobbleT;
        this.tmpQ2.setFromEuler(new THREE.Euler(Math.sin(w * 38) * a, 0, Math.cos(w * 31) * a));
        this.tmpQ.multiply(this.tmpQ2);
        target.x += Math.sin(w * 45) * 0.03 * this.tell;
        target.z += Math.cos(w * 41) * 0.03 * this.tell;
      }
      this.held.body.setNextKinematicTranslation(target);
      this.held.body.setNextKinematicRotation({ x: this.tmpQ.x, y: this.tmpQ.y, z: this.tmpQ.z, w: this.tmpQ.w });
    }
  }

  private fireTell(): void {
    if (this.tell > 0 && !this.tellFired) {
      this.tellFired = true;
      this.events.onTell?.();
    }
  }

  private tryGrab(): boolean {
    const hub = this.body.translation();
    const magnet = this.tool === 'magnet';
    const reach = magnet ? 0.75 : CLAW.GRAB_REACH;
    const tip = { x: hub.x, y: hub.y + CLAW.TIP_Y, z: hub.z };
    let best: Grabbable | null = null;
    let bestD = Infinity;
    this.phys.world.intersectionsWithShape(
      tip, IDENTITY_Q, new RAPIER.Ball(magnet ? 0.85 : CLAW.GRAB_RADIUS),
      (col) => {
        const b = col.parent();
        if (!b) return true;
        const c = grabbableOf(b);
        if (!c || c.removed || c.held) return true;
        if (magnet && c.kind === 'magnet') return true;
        const p = b.translation();
        const d = Math.hypot(p.x - hub.x, p.z - hub.z);
        if (d < reach && d < bestD) { bestD = d; best = c; }
        return true;
      },
      undefined, GRAB_QUERY_GROUPS,
    );
    const found = best as Grabbable | null;
    if (!found) return false;
    if (!magnet && found.kind === 'magnet') {
      this.setTool('magnet');
      this.quietMiss = true;
      this.events.onToolPickup?.(found);
      return false;
    }
    if (!magnet && this.heavyAll) {
      this.quietMiss = true;
      this.events.onTooHeavy?.(found);
      return false;
    }
    this.attach(found, magnet ? 0 : bestD);
    return true;
  }

  private attach(c: Grabbable, horizontalDist: number): void {
    this.held = c;
    this.holdT = 0;
    const p = c.body.translation();
    const q = c.body.rotation();
    this.grabStart.set(p.x, p.y, p.z);
    this.grabRotation.set(q.x, q.y, q.z, q.w);
    this.grabYaw = this.yaw;
    c.onGrab();
    // Deterministic: the grab slips only if it was further off-centre than
    // the thing's grip tolerance. The worse the grab, the earlier it slips.
    const offCentre = horizontalDist / CLAW.GRAB_REACH;
    const grip = c.def.grip * this.gripScale;
    const excess = clamp((offCentre - grip) / Math.max(0.05, 1 - grip), 0, 1);
    this.slipping = offCentre > grip;
    this.slipAt = this.slipping ? lerp(0.85, 0.35, excess) : -1;
    this.tell = 0;
    this.tellFired = false;
    this.wobbleT = 0;
    this.events.onGrab?.(c);
  }

  /** Let go of the held thing. */
  private detach(withVelocity: boolean): void {
    const c = this.held;
    if (!c) return;
    this.held = null;
    this.slipping = false;
    this.tell = 0;
    c.onRelease(withVelocity ? { x: this.vel.x, y: 0, z: this.vel.z } : { x: 0, y: 0, z: 0 });
    this.events.onRelease?.(c);
  }

  /** Something knocked the held thing loose (black cucco attack). Returns what fell. */
  knockOff(): Grabbable | null {
    const c = this.held;
    if (!c) return null;
    this.detach(true);
    this.open01 = Math.max(this.open01, 0.6);
    this.bounceVel = -5;
    if (this.state === 'HOLDING' || this.state === 'LOWERING' || this.state === 'SQUEEZING' || this.state === 'CLOSING') this.enter('ASCENDING');
    return c;
  }

  /** True while the claw is still low enough to be reached from the ground. */
  get lowEnoughToReach(): boolean {
    return this.pos.y < LAYOUT.GANTRY.restY - 0.8;
  }

  /** Called when the held thing was removed by the game (e.g. fell in the hole). */
  forgetHeld(c: Grabbable): void {
    if (this.held === c) {
      this.held = null;
      this.slipping = false;
      this.tell = 0;
      if (this.state === 'HOLDING') this.enter('IDLE');
    }
  }

  /** Per-frame visual update (after physics interpolation). */
  updateVisuals(dt: number): void {
    const { GANTRY } = LAYOUT;
    const hp = this.head.position;
    this.crossbar.position.z = hp.z;
    this.carriage.position.set(hp.x, GANTRY.railY + 0.12, hp.z);
    this.cable.position.set(hp.x, GANTRY.railY - 0.02, hp.z);
    this.cable.scale.y = Math.max(0.05, GANTRY.railY - 0.02 - hp.y - 0.05);
    if (this.cableBeads) {
      this.cableBeads.position.copy(this.cable.position);
      const len = this.cable.scale.y;
      for (const [i, bead] of this.cableBeads.children.entries()) bead.visible = (i + 0.5) * Claw.BEAD_SPACING < len - 0.02;
    }
    const k = 60;
    const c = 7;
    this.bounceVel += (-this.bounce * k - this.bounceVel * c) * dt;
    this.bounce += this.bounceVel * dt;
    this.head.scale.set(1 - this.bounce * 0.08, 1 + this.bounce * 0.15, 1 - this.bounce * 0.08);
    // Gentle sway from gantry velocity, layered on top of the physics yaw.
    const swayZ = clamp(-this.vel.x * 0.05, -0.12, 0.12);
    const swayX = clamp(this.vel.z * 0.05, -0.12, 0.12);
    this.head.rotation.x = swayX;
    this.head.rotation.z = swayZ;
    if (this.tell > 0) {
      const w = performance.now() / 1000;
      this.head.rotation.z += Math.sin(w * 52) * 0.07 * this.tell;
      this.head.rotation.x += Math.cos(w * 47) * 0.07 * this.tell;
      this.flutterFingers(this.tell);
    }
    this.cable.rotation.z = this.head.rotation.z * 0.5;
    this.cable.rotation.x = this.head.rotation.x * 0.5;
    this.cableBeads?.rotation.copy(this.cable.rotation);
  }
}
