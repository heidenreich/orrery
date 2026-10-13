// Where each planet actually is, from Astronomy Engine (MIT, https://github.com/cosinekitty/astronomy).
// It uses a truncated VSOP87 theory, checked by its author against NOVAS and JPL Horizons to about
// 1 arcminute. VSOP87 itself holds for thousands of years either side of 2000, which covers
// every date the page can show (SIM_MIN_MS to SIM_MAX_MS).
//
// The drawn orbit ellipses still come from JPL's mean elements (orbits.ts): over centuries those
// drift mostly along the orbit, which moves the planet on the ellipse, not the ellipse itself.

import { Body, HelioVector } from 'astronomy-engine';
import type { PlanetId } from './bodies';
import type { Vec3 } from './orbits';

const DEG = Math.PI / 180;
/** J2000 obliquity of the ecliptic, to turn Astronomy Engine's equatorial vectors to ecliptic. */
const OBLIQUITY = 23.4392911 * DEG;
const COS_E = Math.cos(OBLIQUITY), SIN_E = Math.sin(OBLIQUITY);

const BODY: Record<PlanetId, Body> = {
  mercury: Body.Mercury,
  venus: Body.Venus,
  earth: Body.Earth,
  mars: Body.Mars,
  jupiter: Body.Jupiter,
  saturn: Body.Saturn,
  uranus: Body.Uranus,
  neptune: Body.Neptune
};

/** Heliocentric position (AU) in ecliptic J2000 coordinates, as orbits.ts uses. */
export function planetPosition(id: PlanetId, ms: number): Vec3 {
  // Takes UTC and applies the TT−UT difference itself.
  const v = HelioVector(BODY[id], new Date(ms));
  return { x: v.x, y: v.y * COS_E + v.z * SIN_E, z: -v.y * SIN_E + v.z * COS_E };
}
