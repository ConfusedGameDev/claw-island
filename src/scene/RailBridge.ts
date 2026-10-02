import * as THREE from 'three';
import { PAL, plastic } from './Materials';
import { LAYOUT } from '../game/Layout';

/**
 * A pair of rail segments that slide out from one island's gantry to connect
 * with the next island's rails.
 */
export class RailBridge {
  readonly group = new THREE.Group();
  extension = 0;
  private rails: THREE.Mesh[] = [];
  private couplers: THREE.Mesh[] = [];
  readonly length: number;

  constructor(scene: THREE.Scene, from: { x: number; z: number }, to: { x: number; z: number }) {
    const { GANTRY } = LAYOUT;
    const startZ = from.z - GANTRY.postZ;
    const endZ = to.z + GANTRY.postZ;
    this.length = startZ - endZ; // positive, bridge runs toward -Z
    this.group.position.set(0, GANTRY.railY, startZ);
    const frameMat = plastic(PAL.gantry, { roughness: 0.35 });
    const accentMat = plastic(PAL.gantryAccent, { roughness: 0.35 });
    for (const sx of [-1, 1]) {
      const geo = new THREE.BoxGeometry(0.12, 0.1, this.length);
      geo.translate(0, 0, -this.length / 2);
      const rail = new THREE.Mesh(geo, frameMat);
      rail.position.x = sx * GANTRY.postX;
      rail.castShadow = true;
      this.group.add(rail);
      this.rails.push(rail);
      const stripeGeo = new THREE.BoxGeometry(0.13, 0.03, this.length);
      stripeGeo.translate(0, 0.06, -this.length / 2);
      const stripe = new THREE.Mesh(stripeGeo, accentMat);
      stripe.position.x = sx * GANTRY.postX;
      this.group.add(stripe);
      this.rails.push(stripe);
      const coupler = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.3), accentMat);
      coupler.position.set(sx * GANTRY.postX, 0.02, -this.length);
      coupler.castShadow = true;
      this.group.add(coupler);
      this.couplers.push(coupler);
    }
    scene.add(this.group);
    this.setExtension(0);
  }

  /** 0 = retracted, 1 = connected to the next island. */
  setExtension(k: number): void {
    this.extension = THREE.MathUtils.clamp(k, 0, 1);
    const s = Math.max(0.001, this.extension);
    for (const r of this.rails) r.scale.z = s;
    const pop = this.extension >= 0.999 ? 1 : 0;
    for (const c of this.couplers) c.scale.setScalar(Math.max(0.001, pop));
  }
}
