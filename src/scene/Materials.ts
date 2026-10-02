import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/** Link's Awakening inspired toy palette. */
export const PAL = {
  navy: 0x1b2140,
  navyDeep: 0x121733,
  grass: 0x66c94a,
  grassTuft: 0x86e85c,
  grassDark: 0x4ca838,
  dirt: 0xb3773f,
  dirtDark: 0x8a5a2b,
  wood: 0x9b6a3c,
  woodLight: 0xd9a066,
  leaf: 0x4fc96a,
  leafLight: 0x8ae07b,
  water: 0x5cc8ff,
  cloud: 0xfaf6ff,
  stone: 0x9aa3ad,
  flowerPink: 0xff9fcf,
  flowerYellow: 0xffe066,
  rupee: 0x3ddc84,
  heart: 0xff5577,
  shell: 0xffd6b5,
  shellRidge: 0xff9fb0,
  acornBody: 0xc48a4e,
  acornCap: 0x6b4423,
  mushroomCap: 0xe84b4b,
  mushroomStem: 0xfff1d6,
  star: 0xffd23f,
  rock: 0x8f98a3,
  bomb: 0x2b2d42,
  fuse: 0xd8c49b,
  spark: 0xff8c1a,
  weight: 0x32343f,
  weightHandle: 0x55596b,
  buttonBase: 0xffc83d,
  buttonCap: 0xff3b3b,
  gantry: 0xf5f5f7,
  gantryAccent: 0x4d6cff,
  claw: 0xd8dbe6,
  clawDark: 0x8d93a8,
  cable: 0x3a3d4d,
} as const;

export interface PlasticOpts {
  roughness?: number;
  metalness?: number;
  flat?: boolean;
  emissive?: number;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
}

const plasticCache = new Map<string, THREE.MeshStandardMaterial>();

/** Glossy toy plastic — the default look for everything solid. */
export function plastic(hex: number, opts: PlasticOpts = {}): THREE.MeshStandardMaterial {
  const key = JSON.stringify([hex, opts]);
  const cached = plasticCache.get(key);
  if (cached) return cached;
  const m = new THREE.MeshStandardMaterial({
    color: hex,
    roughness: opts.roughness ?? 0.45,
    metalness: opts.metalness ?? 0,
    flatShading: opts.flat ?? false,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
  });
  plasticCache.set(key, m);
  return m;
}

let gradientMap: THREE.DataTexture | null = null;
function getGradientMap(): THREE.DataTexture {
  if (!gradientMap) {
    gradientMap = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
    gradientMap.minFilter = THREE.NearestFilter;
    gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.generateMipmaps = false;
    gradientMap.needsUpdate = true;
  }
  return gradientMap;
}

const toonCache = new Map<number, THREE.MeshToonMaterial>();

/** Three-band toon shading, used for foliage. */
export function toon(hex: number): THREE.MeshToonMaterial {
  const cached = toonCache.get(hex);
  if (cached) return cached;
  const m = new THREE.MeshToonMaterial({ color: hex, gradientMap: getGradientMap() });
  toonCache.set(hex, m);
  return m;
}

/** Soft studio reflections so plastics pick up gentle highlights. */
export function setupEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.35;
  pmrem.dispose();
}
