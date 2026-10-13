// Physical facts for each body's panel. Mass, gravity, escape velocity, density and atmospheres are
// from NASA's Planetary Fact Sheet (nssdc.gsfc.nasa.gov/planetary/factsheet); gravity for the giant
// planets is at the 1 bar level. Atmospheres are by volume, Sun composition by mass.
//
// Moon counts keep rising for the giant planets as small moons are found, and sources disagree on
// which candidates count, so those are given as floors ("100+"). Checked 2026-10-13: NASA listed
// Jupiter at 115 and Saturn at 293 (mid-2026), with 101 and 285 as the officially recognised
// totals after the March 2026 announcements; Uranus 29 (S/2025 U1, 2025), Neptune 16.

import type { BodyId } from './bodies';

export interface BodyFacts {
  /** Mass in Earth masses. */
  massEarths: number;
  /** Surface gravity, m/s². */
  gravity: number;
  escapeKms: number;
  /** Mean density, g/cm³. */
  density: number;
  atmosphere: string;
  moons?: { count: string; notable?: string };
  rings?: string;
  /** Spacecraft that went there, best known first. */
  visited?: string;
}

/** Earth's surface gravity, m/s², for comparisons. */
export const EARTH_GRAVITY = 9.81;
export const MOONS_CHECKED = 'mid-2026';

export const FACTS: Record<BodyId, BodyFacts> = {
  sun: {
    massEarths: 333_000, gravity: 274, escapeKms: 617.7, density: 1.41,
    atmosphere: 'Hydrogen 73%, helium 25% (by mass)',
    visited: 'Parker Solar Probe (closest ever, 6.1 million km), SOHO, Solar Orbiter'
  },
  mercury: {
    massEarths: 0.0553, gravity: 3.7, escapeKms: 4.3, density: 5.43,
    atmosphere: 'Almost none: a thin exosphere of oxygen, sodium, hydrogen and helium',
    moons: { count: '0' },
    visited: 'Mariner 10, MESSENGER, BepiColombo'
  },
  venus: {
    massEarths: 0.815, gravity: 8.9, escapeKms: 10.4, density: 5.24,
    atmosphere: 'Carbon dioxide 96.5%, nitrogen 3.5%',
    moons: { count: '0' },
    visited: 'Venera landers, Magellan, Venus Express, Akatsuki'
  },
  earth: {
    massEarths: 1, gravity: 9.8, escapeKms: 11.2, density: 5.51,
    atmosphere: 'Nitrogen 78%, oxygen 21%, argon 0.9%',
    moons: { count: '1', notable: 'The Moon, a quarter of Earth’s width and slowly drifting away, about 3.8 cm a year' }
  },
  mars: {
    massEarths: 0.107, gravity: 3.7, escapeKms: 5.0, density: 3.93,
    atmosphere: 'Carbon dioxide 95%, nitrogen 2.8%, argon 2%',
    moons: { count: '2', notable: 'Phobos and Deimos, small and potato-shaped; Phobos is slowly spiralling inward' },
    visited: 'Viking, Curiosity, Perseverance and many orbiters'
  },
  jupiter: {
    massEarths: 317.8, gravity: 23.1, escapeKms: 59.5, density: 1.33,
    atmosphere: 'Hydrogen 90%, helium 10%',
    moons: { count: '100+', notable: 'Ganymede (the largest moon in the solar system), volcanic Io, ice-covered Europa, Callisto' },
    rings: 'Faint dust rings',
    visited: 'Pioneer, Voyager, Galileo, Juno'
  },
  saturn: {
    massEarths: 95.2, gravity: 9.0, escapeKms: 35.5, density: 0.69,
    atmosphere: 'Hydrogen 96%, helium 3%',
    moons: { count: '290+', notable: 'Titan, with a thick atmosphere and methane lakes, and Enceladus, whose geysers spray ice into space' },
    rings: 'Bright ice rings, up to about 280,000 km across but mostly only tens of metres thick',
    visited: 'Pioneer 11, Voyager, Cassini–Huygens (landed on Titan)'
  },
  uranus: {
    massEarths: 14.5, gravity: 8.7, escapeKms: 21.3, density: 1.27,
    atmosphere: 'Hydrogen 83%, helium 15%, methane 2% (the methane makes it blue-green)',
    moons: { count: '29', notable: 'Titania, Oberon, Umbriel, Ariel and Miranda, named after Shakespeare and Pope characters' },
    rings: '13 dark, narrow rings',
    visited: 'Voyager 2 only, flying past in 1986'
  },
  neptune: {
    massEarths: 17.1, gravity: 11.0, escapeKms: 23.5, density: 1.64,
    atmosphere: 'Hydrogen 80%, helium 19%, methane 1.5%',
    moons: { count: '16', notable: 'Triton, which orbits backwards and has nitrogen geysers; probably a captured dwarf planet' },
    rings: '5 faint, dark rings',
    visited: 'Voyager 2 only, flying past in 1989'
  }
};

/** "0.055 × Earth", "318 × Earth", "333,000 × Earth", "Earth = 1". */
export function massText(m: number): string {
  if (m === 1) return '5.97 × 10²⁴ kg';
  const n = m < 1 ? m.toPrecision(2) : m < 1000 ? String(Math.round(m)) : m.toLocaleString('en-US');
  return `${n} × Earth`;
}

/** "3.7 m/s² · 0.38× Earth’s". */
export function gravityText(g: number): string {
  if (g === 9.8) return '9.8 m/s²';
  const r = g / EARTH_GRAVITY;
  return `${g < 100 ? g.toFixed(1) : g} m/s² · ${r < 10 ? r.toFixed(2) : Math.round(r)}× Earth’s`;
}
