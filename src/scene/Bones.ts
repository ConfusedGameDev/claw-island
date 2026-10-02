import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { plastic } from './Materials';

/** Warm ivory used for every bone in the spooky campaign. */
export const BONE = 0xfff1dc;
export const BONE_DARK = 0xd9c4a3;

export const boneMat = (): THREE.MeshStandardMaterial => plastic(BONE, { roughness: 0.55 });
export const boneDarkMat = (): THREE.MeshStandardMaterial => plastic(BONE_DARK, { roughness: 0.6 });

/** Give every geometry uvs and an index so geometries from different generators merge. */
function normalise(g: THREE.BufferGeometry): THREE.BufferGeometry {
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.index) g.setIndex(Array.from({ length: g.attributes.position.count }, (_, i) => i));
  return g;
}

const boneCache = new Map<string, THREE.BufferGeometry>();

/**
 * A cartoon bone along +Y, centred on the origin: a shaft with two round
 * knobs at each end.
 */
export function boneGeometry(length: number, radius: number): THREE.BufferGeometry {
  const key = `${length.toFixed(3)}:${radius.toFixed(3)}`;
  const cached = boneCache.get(key);
  if (cached) return cached;
  const shaft = new THREE.CylinderGeometry(radius, radius, length, 10, 1, true);
  const parts: THREE.BufferGeometry[] = [normalise(shaft)];
  const knob = radius * 1.75;
  for (const sy of [-1, 1]) {
    for (const sx of [-1, 1]) {
      const s = new THREE.SphereGeometry(knob, 12, 9);
      s.translate(sx * radius * 0.95, sy * length / 2, 0);
      parts.push(normalise(s));
    }
  }
  const geo = mergeGeometries(parts, false)!;
  geo.userData.shared = true;
  boneCache.set(key, geo);
  return geo;
}

/** A bone mesh between two points. */
export function boneBetween(a: THREE.Vector3, b: THREE.Vector3, radius: number, mat: THREE.Material = boneMat()): THREE.Mesh {
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(boneGeometry(len, radius), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  m.castShadow = true;
  return m;
}

const vertCache = new Map<string, THREE.BufferGeometry>();

/**
 * A spine running along +Z from 0 to -length (the rail direction): rounded
 * vertebra discs on a thin cord. Scaling the mesh on Z stretches it evenly.
 */
export function spineGeometry(length: number, radius: number, spacing = 0.22): THREE.BufferGeometry {
  const key = `${length.toFixed(3)}:${radius.toFixed(3)}:${spacing}`;
  const cached = vertCache.get(key);
  if (cached) return cached;
  const parts: THREE.BufferGeometry[] = [];
  const cord = new THREE.CylinderGeometry(radius * 0.45, radius * 0.45, length, 8, 1, true);
  cord.rotateX(Math.PI / 2);
  cord.translate(0, 0, -length / 2);
  parts.push(normalise(cord));
  const n = Math.max(2, Math.round(length / spacing));
  for (let i = 0; i <= n; i++) {
    const z = -(i / n) * length;
    const disc = new THREE.SphereGeometry(radius, 12, 8);
    disc.scale(1.15, 0.85, 0.55);
    disc.translate(0, 0, z);
    parts.push(normalise(disc));
    // A little spinous process on top of each vertebra.
    const nub = new THREE.SphereGeometry(radius * 0.45, 8, 6);
    nub.scale(0.6, 1.2, 0.8);
    nub.translate(0, radius * 0.85, z);
    parts.push(normalise(nub));
  }
  const geo = mergeGeometries(parts, false)!;
  geo.userData.shared = true;
  vertCache.set(key, geo);
  return geo;
}

/**
 * A kawaii skull: a round cranium, a softer jaw, big round eye sockets and a
 * tiny heart-ish nose. `eyeMat` lets callers make the sockets glow.
 */
export function skullMesh(scale = 1, eyeMat?: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const bone = boneMat();
  const dark = eyeMat ?? plastic(0x2a2230, { roughness: 0.5 });
  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 16), bone);
  cranium.scale.set(1, 0.92, 0.95);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), bone);
  jaw.position.set(0, -0.32, 0.1);
  jaw.scale.set(1, 0.6, 0.9);
  g.add(cranium, jaw);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10), dark);
    eye.position.set(s * 0.19, -0.02, 0.4);
    eye.scale.set(1, 1.1, 0.5);
    g.add(eye);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), plastic(0xffffff, { roughness: 0.2 }));
    shine.position.set(s * 0.19 + 0.04, 0.04, 0.47);
    g.add(shine);
  }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.08, 3), dark);
  nose.rotation.x = Math.PI;
  nose.position.set(0, -0.18, 0.46);
  g.add(nose);
  for (let i = -2; i <= 2; i++) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.02), dark);
    tooth.position.set(i * 0.07, -0.36, 0.38);
    g.add(tooth);
  }
  g.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
  g.scale.setScalar(scale);
  return g;
}
