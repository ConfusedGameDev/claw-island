import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAL } from './Materials';

interface Cloud { group: THREE.Group; speed: number; baseY: number; phase: number }

/** Lights and sky decoration shared by every island. */
export class Environment {
  readonly sun: THREE.DirectionalLight;
  private clouds: Cloud[] = [];
  private focusPoint = new THREE.Vector3();

  constructor(private scene: THREE.Scene) {
    this.sun = new THREE.DirectionalLight(0xfff1dc, 2.3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = -7; cam.right = 7; cam.top = 7; cam.bottom = -7;
    cam.near = 1; cam.far = 30;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 4;
    scene.add(this.sun, this.sun.target);
    this.focus({ x: 0, z: 0 });

    scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x6b8f3c, 0.9));
    const fill = new THREE.DirectionalLight(0xbfd0ff, 0.5);
    fill.position.set(-4, 6, -3);
    scene.add(fill);

    this.buildClouds();
  }

  /** Point the shadow-casting sun at the active island. */
  focus(origin: { x: number; z: number }): void {
    this.focusPoint.set(origin.x, 0, origin.z);
    this.sun.position.set(origin.x + 5, 10, origin.z + 6);
    this.sun.target.position.copy(this.focusPoint);
    this.sun.target.updateMatrixWorld();
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
    for (let i = 0; i < 16; i++) {
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
