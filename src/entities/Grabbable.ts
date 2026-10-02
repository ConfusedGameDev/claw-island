import type RAPIER from '@dimforge/rapier3d-compat';
import type * as THREE from 'three';

export interface GrabDef {
  /** Distance from the body origin to the top of the thing (used while held). */
  top: number;
  /** Distance from the body origin to its bottom. */
  bottom: number;
  /** Grip tolerance as a fraction of the claw's reach (0..1). */
  grip: number;
}

/** Anything the claw can pick up. */
export interface Grabbable {
  readonly kind: string;
  readonly name: string;
  readonly body: RAPIER.RigidBody;
  readonly def: GrabDef;
  removed: boolean;
  held: boolean;
  /** Seconds after which the thing wriggles free on its own (chickens). */
  readonly escapeAfter?: number;
  onGrab(): void;
  onRelease(vel: THREE.Vector3Like): void;
}

export interface GrabbableUserData {
  grabbable: Grabbable;
}

export function grabbableOf(body: RAPIER.RigidBody | null): Grabbable | null {
  const ud = body?.userData as Partial<GrabbableUserData> | undefined;
  return ud?.grabbable ?? null;
}
