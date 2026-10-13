// Sunlight and seasons for each planet, computed from its orbit and the direction of its north pole.
// Poles: IAU WGCCRE mean poles (Archinal et al. 2011), J2000 equatorial right ascension and
// declination with their linear drift; Neptune includes its main periodic term. The 2015 Mars model
// is avoided on purpose: its constant terms omit large periodic terms and are off by about 1.5°.
// Earth's pole is precessed from its J2000 direction so equinoxes land on the right dates.
// "North" is the IAU north pole (the one on the north side of the solar system's invariable plane),
// so Venus and Uranus, which spin backwards, measure 2.6° and 82.2° from their orbit normals.

import { PLANETS, type PlanetId } from './bodies';
import { centuriesSinceJ2000, heliocentric, length, orbitShape, type Vec3 } from './orbits';

const DEG = Math.PI / 180;
const DAY_MS = 86_400_000;
/** Total solar irradiance at 1 AU, W/m² (SORCE/TSIS, solar minimum). */
export const SOLAR_CONSTANT = 1361;
/** J2000 obliquity of the ecliptic. */
const OBLIQUITY = 23.4392911 * DEG;
/** Below this tilt, seasons are negligible. */
const MIN_SEASONAL_TILT = 5;

/** Pole right ascension and declination, degrees, as functions of Julian centuries T since J2000. */
const POLES: Record<Exclude<PlanetId, 'earth'>, (T: number) => { ra: number; dec: number }> = {
  mercury: (T) => ({ ra: 281.0097 - 0.0328 * T, dec: 61.4143 - 0.0049 * T }),
  venus: () => ({ ra: 272.76, dec: 67.16 }),
  mars: (T) => ({ ra: 317.68143 - 0.1061 * T, dec: 52.8865 - 0.0609 * T }),
  jupiter: (T) => ({ ra: 268.056595 - 0.006499 * T, dec: 64.495303 + 0.002413 * T }),
  saturn: (T) => ({ ra: 40.589 - 0.036 * T, dec: 83.537 - 0.004 * T }),
  uranus: () => ({ ra: 257.311, dec: -15.175 }),
  neptune: (T) => {
    const N = (357.85 + 52.316 * T) * DEG;
    return { ra: 299.36 + 0.7 * Math.sin(N), dec: 43.46 - 0.51 * Math.cos(N) };
  }
};
/** General precession in longitude, degrees per Julian century. */
const PRECESSION = 1.3969713;

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const unit = (a: Vec3): Vec3 => { const l = length(a); return { x: a.x / l, y: a.y / l, z: a.z / l }; };

/** North pole as a unit vector in ecliptic J2000 coordinates. */
export function northPole(id: PlanetId, ms: number): Vec3 {
  const T = centuriesSinceJ2000(ms);
  if (id === 'earth') {
    // The J2000 pole points to ecliptic longitude 90°; precession turns it westward about the ecliptic pole.
    const lon = (90 - PRECESSION * T) * DEG;
    return { x: Math.sin(OBLIQUITY) * Math.cos(lon), y: Math.sin(OBLIQUITY) * Math.sin(lon), z: Math.cos(OBLIQUITY) };
  }
  const { ra, dec } = POLES[id](T);
  const x = Math.cos(dec * DEG) * Math.cos(ra * DEG);
  const y = Math.cos(dec * DEG) * Math.sin(ra * DEG);
  const z = Math.sin(dec * DEG);
  return { x, y: y * Math.cos(OBLIQUITY) + z * Math.sin(OBLIQUITY), z: -y * Math.sin(OBLIQUITY) + z * Math.cos(OBLIQUITY) };
}

const planet = (id: PlanetId) => PLANETS.find((p) => p.id === id)!;

/** Angle between the IAU north pole and the orbit normal, degrees (Uranus ≈ 82°, Venus ≈ 2.6°; see above). */
export function axialTilt(id: PlanetId, ms: number): number {
  return Math.acos(Math.min(1, Math.max(-1, dot(northPole(id, ms), orbitShape(planet(id), ms).normal)))) / DEG;
}

/** Tilt as usually quoted, from the spin axis: Uranus 97.8°, Venus 177.4°. */
export const SPIN_TILT: Partial<Record<PlanetId, number>> = { venus: 177.36, uranus: 97.77 };

export interface SunGeometry {
  /** Solar longitude, degrees: 0 northern spring equinox, 90 northern summer solstice, 180, 270. */
  ls: number;
  /** Latitude where the Sun is overhead at noon, degrees (positive = north). */
  subsolarLatitude: number;
}

export function sunGeometry(id: PlanetId, ms: number): SunGeometry {
  const n = northPole(id, ms);
  const k = orbitShape(planet(id), ms).normal;
  const p = heliocentric(planet(id), ms);
  const toSun = unit({ x: -p.x, y: -p.y, z: -p.z });
  // At the northern spring equinox the Sun lies along n × k; Ls grows as the planet moves along its orbit.
  const e = unit(cross(n, k));
  const f = cross(k, e);
  const ls = (Math.atan2(dot(toSun, f), dot(toSun, e)) / DEG + 360) % 360;
  return { ls, subsolarLatitude: Math.asin(Math.max(-1, Math.min(1, dot(n, toSun)))) / DEG };
}

export interface Sunlight {
  /** W/m² at the top of the atmosphere, now. */
  now: number;
  /** As a fraction of Earth's mean (1361 W/m²). */
  relativeToEarth: number;
  /** At aphelion and perihelion. */
  min: number;
  max: number;
}

export function sunlight(id: PlanetId, ms: number): Sunlight {
  const r = length(heliocentric(planet(id), ms));
  const { a, e } = orbitShape(planet(id), ms);
  const now = SOLAR_CONSTANT / (r * r);
  return {
    now,
    relativeToEarth: now / SOLAR_CONSTANT,
    min: SOLAR_CONSTANT / (a * (1 + e)) ** 2,
    max: SOLAR_CONSTANT / (a * (1 - e)) ** 2
  };
}

const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
const OPPOSITE = { spring: 'autumn', summer: 'winter', autumn: 'spring', winter: 'summer' } as const;
const EVENTS = ['northern spring equinox', 'northern summer solstice', 'northern autumn equinox', 'northern winter solstice'];

export type Seasons =
  | { seasonal: false; tilt: number }
  | {
      seasonal: true;
      tilt: number;
      ls: number;
      subsolarLatitude: number;
      north: (typeof SEASONS)[number];
      south: (typeof SEASONS)[number];
      /** The next equinox or solstice. */
      next: { name: string; ms: number };
      /** Length of one season (a quarter orbit), days, on average. */
      seasonDays: number;
    };

/** The northern hemisphere's season, or null for planets tilted too little to have seasons. Cheap: no event search. */
export function northSeason(id: PlanetId, ms: number): (typeof SEASONS)[number] | null {
  if (axialTilt(id, ms) < MIN_SEASONAL_TILT) return null;
  return SEASONS[Math.floor(sunGeometry(id, ms).ls / 90)];
}

export function seasons(id: PlanetId, ms: number): Seasons {
  const tilt = axialTilt(id, ms);
  if (tilt < MIN_SEASONAL_TILT) return { seasonal: false, tilt };

  const { ls, subsolarLatitude } = sunGeometry(id, ms);
  const quarter = Math.floor(ls / 90);
  const north = SEASONS[quarter];
  const yearDays = 365.25 * orbitShape(planet(id), ms).a ** 1.5;
  return {
    seasonal: true,
    tilt,
    ls,
    subsolarLatitude,
    north,
    south: OPPOSITE[north],
    next: { name: EVENTS[(quarter + 1) % 4], ms: nextLs(id, ms, ((quarter + 1) % 4) * 90, yearDays) },
    seasonDays: yearDays / 4
  };
}

/** When Ls next reaches `target` (0, 90, 180 or 270): step forward, then bisect to about a minute. */
function nextLs(id: PlanetId, ms: number, target: number, yearDays: number): number {
  const ahead = (t: number) => (target - sunGeometry(id, t).ls + 360) % 360;
  const step = (yearDays / 72) * DAY_MS;
  let lo = ms;
  let hi = ms + step;
  // Distance to the target shrinks until we pass it, then jumps back near 360.
  while (ahead(hi) <= ahead(lo) && hi - ms < yearDays * 1.1 * DAY_MS) {
    lo = hi;
    hi += step;
  }
  for (let i = 0; i < 40 && hi - lo > 60_000; i++) {
    const mid = (lo + hi) / 2;
    if (ahead(mid) <= ahead(lo)) lo = mid;
    else hi = mid;
  }
  return hi;
}
