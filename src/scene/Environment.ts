import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAL } from './Materials';
import { LAYOUT } from '../game/Layout';
import { damp } from '../util/math';

interface Cloud { group: THREE.Group; speed: number; baseY: number; phase: number }
/** A bat lapping the pen: an ellipse just outside the fence, with its own pace, height and swoop. */
interface Bat { group: THREE.Group; wings: THREE.Mesh[]; rx: number; rz: number; y: number; speed: number; phase: number; angle: number }

/** Lights and sky decoration shared by every island. */
export class Environment {
  /** Straight overhead and the only shadow caster: shadows land exactly below things, so the claw's shadow marks where it will drop. */
  readonly sun: THREE.DirectionalLight;
  /** Warm angled light for form and warmth; casts no shadow. */
  readonly key: THREE.DirectionalLight;
  private clouds: Cloud[] = [];
  private bats: Bat[] = [];
  private moon: THREE.Group | null = null;
  private focusPoint = new THREE.Vector3();
  /** Where the bats are circling; trails the focus so they follow the ride to the next island. */
  private batCenter = new THREE.Vector3();
  private hemi: THREE.HemisphereLight;
  private fill: THREE.DirectionalLight;
  private base = { sun: 2.1, key: 0.9, hemi: 0.6, fill: 0.35 };
  private sky = new THREE.Color();
  private light = 1;

  constructor(private scene: THREE.Scene, private spooky = false) {
    this.sun = new THREE.DirectionalLight(0xfff6e8, 2.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = -7; cam.right = 7; cam.top = 7; cam.bottom = -7;
    cam.near = 1; cam.far = 30;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 2;
    scene.add(this.sun, this.sun.target);
    this.key = new THREE.DirectionalLight(0xfff1dc, 0.9);
    this.key.castShadow = false;
    scene.add(this.key, this.key.target);
    this.focus({ x: 0, z: 0 });

    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x6b8f3c, 0.6);
    scene.add(this.hemi);
    this.fill = new THREE.DirectionalLight(0xbfd0ff, 0.35);
    this.fill.position.set(-4, 6, -3);
    scene.add(this.fill);

    this.buildClouds();
    if (spooky) {
      this.buildMoon();
      this.buildBats();
    }
  }

  /** Center the lights (and the shadow map) on the active island. */
  focus(origin: { x: number; z: number }): void {
    this.focusPoint.set(origin.x, 0, origin.z);
    // Jumping straight to a far island (a load, a restart): the bats are already there.
    if (this.batCenter.distanceTo(this.focusPoint) > 20) this.batCenter.copy(this.focusPoint);
    // A hair off vertical keeps the look-at matrix well defined.
    this.sun.position.set(origin.x, 14, origin.z + 0.05);
    this.sun.target.position.copy(this.focusPoint);
    this.sun.target.updateMatrixWorld();
    this.key.position.set(origin.x + 5, 10, origin.z + 6);
    this.key.target.position.copy(this.focusPoint);
    this.key.target.updateMatrixWorld();
    // The moon hangs low in the void behind whichever island is in view.
    this.moon?.position.set(origin.x + 7.5, -7, origin.z - 16);
  }

  /** Ease the sky color and light level toward an island's mood. */
  mood(sky: number, light: number, dt: number, instant = false): void {
    const k = instant ? 1 : 1 - Math.exp(-dt * 2.5);
    this.sky.lerp(new THREE.Color(sky), k);
    this.light += (light - this.light) * k;
    if (this.scene.background instanceof THREE.Color) this.scene.background.copy(this.sky);
    else this.scene.background = this.sky.clone();
    this.sun.intensity = this.base.sun * this.light;
    this.key.intensity = this.base.key * this.light;
    this.hemi.intensity = this.base.hemi * (0.5 + this.light * 0.5);
    this.fill.intensity = this.base.fill * this.light;
  }

  update(dt: number, t: number): void {
    for (const c of this.clouds) {
      // Drift outward slowly, then slide back in from the inner edge of the lane.
      c.group.position.x += c.speed * dt;
      if (Math.abs(c.group.position.x) > 13) c.group.position.x = Math.sign(c.group.position.x) * 8;
      c.group.position.y = c.baseY + Math.sin(t * 0.6 + c.phase) * 0.12;
    }
    this.batCenter.x = damp(this.batCenter.x, this.focusPoint.x, 1.5, dt);
    this.batCenter.z = damp(this.batCenter.z, this.focusPoint.z, 1.5, dt);
    for (const b of this.bats) {
      b.angle += b.speed * dt;
      const a = b.angle;
      // Swoop in and out and up and down a little as they go round.
      const wob = 1 + Math.sin(a * 3 + b.phase) * 0.06;
      const rx = b.rx * wob;
      const rz = b.rz * wob;
      b.group.position.set(
        this.batCenter.x + Math.cos(a) * rx,
        b.y + Math.sin(a * 2.3 + b.phase) * 0.25,
        this.batCenter.z + Math.sin(a) * rz,
      );
      // Face along the lap and bank into the turn.
      const dir = Math.sign(b.speed);
      b.group.rotation.set(0, Math.atan2(-Math.sin(a) * rx * dir, Math.cos(a) * rz * dir), dir * 0.35, 'YXZ');
      const flap = Math.sin(t * 14 + b.phase * 3) * 0.7;
      b.wings[0].rotation.z = flap;
      b.wings[1].rotation.z = -flap;
    }
  }

  private buildMoon(): void {
    const g = new THREE.Group();
    const moon = new THREE.Mesh(new THREE.CircleGeometry(2.6, 48), new THREE.MeshBasicMaterial({ color: 0xfff1c9 }));
    const halo = new THREE.Mesh(new THREE.CircleGeometry(3.6, 48), new THREE.MeshBasicMaterial({ color: 0xb48cff, transparent: true, opacity: 0.25, depthWrite: false }));
    halo.position.z = -0.1;
    // A sleepy kawaii face.
    const ink = new THREE.MeshBasicMaterial({ color: 0xd9b88a });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.07, 6, 16, Math.PI), ink);
      eye.position.set(s * 0.8, 0.35, 0.02);
      eye.rotation.z = Math.PI;
      g.add(eye);
      const blush = new THREE.Mesh(new THREE.CircleGeometry(0.3, 16), new THREE.MeshBasicMaterial({ color: 0xffb3c6 }));
      blush.position.set(s * 1.25, -0.25, 0.02);
      g.add(blush);
    }
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 6, 16, Math.PI), ink);
    mouth.position.set(0, -0.35, 0.02);
    mouth.rotation.z = Math.PI;
    g.add(moon, halo, mouth);
    // Face the camera's usual heading (it looks down and toward -Z).
    g.rotation.x = -0.75;
    this.scene.add(g);
    this.moon = g;
  }

  private buildBats(): void {
    const body = new THREE.MeshStandardMaterial({ color: 0x3b2a4a, roughness: 0.6 });
    const wingMat = new THREE.MeshStandardMaterial({ color: 0x52385f, roughness: 0.5, side: THREE.DoubleSide });
    const wing = new THREE.Shape();
    wing.moveTo(0, 0.05);
    wing.lineTo(0.45, 0.14);
    wing.quadraticCurveTo(0.38, 0.0, 0.34, -0.05);
    wing.quadraticCurveTo(0.26, 0.0, 0.2, -0.07);
    wing.quadraticCurveTo(0.12, -0.02, 0.0, -0.06);
    wing.closePath();
    const wingGeo = new THREE.ShapeGeometry(wing);
    wingGeo.rotateX(-Math.PI / 2);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffd23f });
    const { FENCE } = LAYOUT;
    const BATS = 10;
    const bodyGeo = new THREE.SphereGeometry(0.12, 10, 8);
    const eyeGeo = new THREE.SphereGeometry(0.025, 6, 4);
    for (let i = 0; i < BATS; i++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(bodyGeo, body));
      const wings: THREE.Mesh[] = [];
      for (const s of [-1, 1]) {
        const w = new THREE.Mesh(wingGeo, wingMat);
        w.scale.x = s;
        w.position.x = s * 0.06;
        g.add(w);
        wings.push(w);
        const eye = new THREE.Mesh(eyeGeo, eyeMat);
        eye.position.set(s * 0.05, 0.04, 0.1);
        g.add(eye);
      }
      g.scale.setScalar(0.8 + (i % 3) * 0.12);
      this.scene.add(g);
      // Most go round one way as a loose flock; every fourth one laps the other way.
      const ring = (i % 3) * 0.35;
      this.bats.push({
        group: g, wings,
        rx: FENCE.hx + 0.6 + ring, rz: FENCE.hz + 0.5 + ring,
        y: FENCE.wallHeight + 0.4 + ((i * 0.37) % 1) * 0.9,
        speed: (i % 4 === 3 ? -1 : 1) * (0.45 + ((i * 0.29) % 1) * 0.3),
        phase: i * 1.7,
        angle: (i / BATS) * Math.PI * 2,
      });
    }
  }

  private buildClouds(): void {
    const mat = this.spooky
      ? new THREE.MeshStandardMaterial({ color: 0xc9b8f0, roughness: 0.9, emissive: 0x5a3f9a, emissiveIntensity: 0.35 })
      : new THREE.MeshStandardMaterial({ color: PAL.cloud, roughness: 0.9, emissive: 0x6c7cb8, emissiveIntensity: 0.25 });
    // Clouds sit low and off to the sides so they frame the islands without
    // drifting across the play areas; they wrap within their own side lane.
    const defs: { x: number; y: number; z: number; s: number; speed: number; side: number }[] = [];
    for (let i = 0; i < 44; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      defs.push({
        side,
        x: side * (8.5 + ((i * 2.7) % 3)),
        y: -2.2 + ((i * 1.3) % 3) * 0.9,
        z: 5 - i * 2.6,
        s: 0.8 + ((i * 7) % 4) * 0.3,
        speed: side * (0.05 + ((i * 3) % 3) * 0.02),
      });
    }
    // One merged puff shape shared by every cloud.
    const parts: [number, number, number, number][] = [[0, 0, 0, 0.8], [0.7, 0.1, 0.1, 0.55], [-0.65, 0.05, -0.1, 0.5], [0.2, 0.3, -0.2, 0.5]];
    const puffGeo = mergeGeometries(parts.map(([x, y, z, r]) => {
      const geo = new THREE.SphereGeometry(r, 16, 12);
      geo.scale(1, 0.5, 1);
      geo.translate(x, y, z);
      return geo;
    }), false)!;
    defs.forEach((d, i) => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(puffGeo, mat));
      g.position.set(d.x, d.y, d.z);
      g.scale.setScalar(d.s);
      this.scene.add(g);
      this.clouds.push({ group: g, speed: d.speed, baseY: d.y, phase: i });
    });
  }
}
