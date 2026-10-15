// Moons shown in the orrery. Earth's Moon and Jupiter's four large moons come from Astronomy
// Engine for any date; Titan and Triton come from JPL Horizons at build time (spacecraft-data.ts),
// like the spacecraft, for about six months around the build.
//
// Directions from each planet are real; distances are compressed for display (see displayRadius),
// as the planets themselves are drawn far larger than life.

import { GeoMoon, JupiterMoons } from 'astronomy-engine';
import type { PlanetId } from './bodies';
import { eqjToEcliptic } from './ephemeris';
import type { Vec3 } from './orbits';

export type MoonId = 'moon' | 'io' | 'europa' | 'ganymede' | 'callisto' | 'titan' | 'triton';

export interface Moon {
  id: MoonId;
  name: string;
  parent: PlanetId;
  radiusKm: number;
  /** Mean distance from the planet's centre, km. */
  distanceKm: number;
  color: string;
  /** Where its position comes from. */
  source: 'astronomy-engine' | 'horizons';
  /** For Horizons: target and centre (the planet's body centre). */
  horizons?: { target: string; center: string; step: string };
}

export const MOONS: Moon[] = [
  { id: 'moon', name: 'Moon', parent: 'earth', radiusKm: 1737.4, distanceKm: 384_400, color: '#b8b4ad', source: 'astronomy-engine' },
  { id: 'io', name: 'Io', parent: 'jupiter', radiusKm: 1821.6, distanceKm: 421_700, color: '#d8c36b', source: 'astronomy-engine' },
  { id: 'europa', name: 'Europa', parent: 'jupiter', radiusKm: 1560.8, distanceKm: 671_034, color: '#cfc2a6', source: 'astronomy-engine' },
  { id: 'ganymede', name: 'Ganymede', parent: 'jupiter', radiusKm: 2634.1, distanceKm: 1_070_412, color: '#9b9182', source: 'astronomy-engine' },
  { id: 'callisto', name: 'Callisto', parent: 'jupiter', radiusKm: 2410.3, distanceKm: 1_882_709, color: '#6f665c', source: 'astronomy-engine' },
  {
    id: 'titan', name: 'Titan', parent: 'saturn', radiusKm: 2574.7, distanceKm: 1_221_870, color: '#d6a25b', source: 'horizons',
    // About 16-day orbit: daily samples, with velocities, follow it closely.
    horizons: { target: '606', center: '500@699', step: '1 d' }
  },
  {
    id: 'triton', name: 'Triton', parent: 'neptune', radiusKm: 1353.4, distanceKm: 354_759, color: '#cbb6aa', source: 'horizons',
    // About 6-day orbit, backwards: two samples a day.
    horizons: { target: '801', center: '500@899', step: '12 h' }
  }
];

export const moonById = (id: MoonId) => MOONS.find((m) => m.id === id)!;
export const isMoonId = (id: string): id is MoonId => MOONS.some((m) => m.id === id);
export const moonsOf = (planet: PlanetId) => MOONS.filter((m) => m.parent === planet);

/** Offset from the parent planet (AU, ecliptic J2000) for the moons Astronomy Engine covers. */
export function computedMoonOffsets(ms: number): Partial<Record<MoonId, Vec3>> {
  const date = new Date(ms);
  const j = JupiterMoons(date);
  return {
    moon: eqjToEcliptic(GeoMoon(date)),
    io: eqjToEcliptic(j.io),
    europa: eqjToEcliptic(j.europa),
    ganymede: eqjToEcliptic(j.ganymede),
    callisto: eqjToEcliptic(j.callisto)
  };
}

/**
 * How far from its planet's centre to draw a moon, in units of the planet's drawn radius. Real
 * distances (60 Earth radii for the Moon, 26 Jupiter radii for Callisto) would put moons among
 * the neighbouring planets at this scale, so the ratio is compressed on a log scale, which keeps
 * their order and spacing readable: Io 2.9, Callisto 4.1, the Moon 4.8 planet radii.
 */
export const displayRadius = (m: Moon, planetRadiusKm: number) => 1.5 + 0.8 * Math.log(m.distanceKm / planetRadiusKm);
