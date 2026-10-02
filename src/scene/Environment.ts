import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAL } from './Materials';

interface Cloud { group: THREE.Group; speed: number; baseY: number; phase: number }

/** Lights and sky decoration shared by every island. */
export class Environment {
  /** Straight overhead and the only shadow caster: shadows land exactly below things, so the claw's shadow marks where it will drop. */
  readonly sun: THREE.DirectionalLight;
  /** Warm angled light for form and warmth; casts no shadow. */
  readonly key: THREE.DirectionalLight;
  private clouds: Cloud[] = [];
  private focusPoint = new THREE.Vector3();
  private hemi: THREE.HemisphereLight;
  private fill: THREE.DirectionalLight;
  private base = { sun: 2.1, key: 0.9, hemi: 0.6, fill: 0.35 };
  private sky = new THREE.Color();
  private light = 1;

  constructor(private scene: THREE.Scene) {
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
  }

  /** Center the lights (and the shadow map) on the active island. */
  focus(origin: { x: number; z: number }): void {
    this.focusPoint.set(origin.x, 0, origin.z);
    // A hair off vertical keeps the look-at matrix well defined.
    this.sun.position.set(origin.x, 14, origin.z + 0.05);
    this.sun.target.position.copy(this.focusPoint);
    this.sun.target.updateMatrixWorld();
    this.key.position.set(origin.x + 5, 10, origin.z + 6);
    this.key.target.position.copy(this.focusPoint);
    this.key.target.updateMatrixWorld();
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
  }

  private buildClouds(): void {
    const mat = new THREE.MeshStandardMaterial({ color: PAL.cloud, roughness: 0.9, emissive: 0x6c7cb8, emissiveIntensity: 0.25 });
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
