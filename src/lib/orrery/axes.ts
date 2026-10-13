import * as THREE from 'three';
import type { PlanetId } from './bodies';
import type { Vec3 } from './orbits';
import { northPole } from './seasons';

// Ecliptic (z = north) to scene axes (y = up).
export const toScene = (p: Vec3) => new THREE.Vector3(p.x, p.z, -p.y);

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Turns a planet's holder so its local +y, the axis its mesh spins about and its rings circle,
 * points along the IAU north pole that seasons.ts uses.
 */
export const poleQuaternion = (id: PlanetId, ms: number) =>
  new THREE.Quaternion().setFromUnitVectors(UP, toScene(northPole(id, ms)).normalize());
