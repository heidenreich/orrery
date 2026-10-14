import type { BodyId } from './bodies';

// Spacecraft shown in the orrery, with what the build asks JPL Horizons for. Trajectories are
// fetched at build time (src/lib/data/spacecraft-data.ts); this file is only the catalogue.

export type CraftId = 'voyager-1' | 'voyager-2' | 'new-horizons' | 'parker' | 'europa-clipper' | 'juice';
/** Anything that can be selected: the Sun, a planet or a spacecraft. */
export type WorldId = BodyId | CraftId;

export interface Craft {
  id: CraftId;
  name: string;
  /** Horizons target number (spacecraft have negative IDs). */
  horizonsId: string;
  launched: string;
  agency: string;
  /** Trajectory window: a fixed start date, or this many days before the build. */
  from: string | { daysBack: number };
  /** Predicted trajectory to include past the build date. */
  daysAhead: number;
  /** Horizons step size, e.g. "60 d" or "6 h". Uniform, so the file stores only the first time. */
  step: string;
  about: string[];
}

export const CRAFT: Craft[] = [
  {
    id: 'voyager-1', name: 'Voyager 1', horizonsId: '-31', launched: '1977-09-05', agency: 'NASA',
    from: '1977-09-10', daysAhead: 365, step: '60 d',
    about: [
      'The most distant human-made object, in interstellar space since August 2012.',
      'Flew past Jupiter (1979) and Saturn (1980), then turned back to take the “Pale Blue Dot” photo of Earth in 1990.'
    ]
  },
  {
    id: 'voyager-2', name: 'Voyager 2', horizonsId: '-32', launched: '1977-08-20', agency: 'NASA',
    from: '1977-08-25', daysAhead: 365, step: '60 d',
    about: [
      'The only spacecraft to visit Uranus (1986) and Neptune (1989), after Jupiter and Saturn.',
      'Crossed into interstellar space in November 2018.'
    ]
  },
  {
    id: 'new-horizons', name: 'New Horizons', horizonsId: '-98', launched: '2006-01-19', agency: 'NASA',
    from: '2006-01-25', daysAhead: 365, step: '30 d',
    about: [
      'Flew past Pluto in July 2015 and the Kuiper belt object Arrokoth in January 2019.',
      'Still heading outward through the Kuiper belt.'
    ]
  },
  {
    id: 'parker', name: 'Parker Solar Probe', horizonsId: '-96', launched: '2018-08-12', agency: 'NASA',
    from: { daysBack: 90 }, daysAhead: 90, step: '6 h',
    about: [
      'Flies through the Sun’s outer atmosphere; its closest passes, 6.1 million km from the surface, began in December 2024.',
      'The fastest object ever built, about 190 km/s at closest approach.'
    ]
  },
  {
    id: 'europa-clipper', name: 'Europa Clipper', horizonsId: '-159', launched: '2024-10-14', agency: 'NASA',
    from: '2024-10-20', daysAhead: 365, step: '5 d',
    about: [
      'On its way to Jupiter, due in 2030, to study whether Europa’s ocean under the ice could support life.',
      'Uses gravity assists from Mars (2025) and Earth (2026) to get there.'
    ]
  },
  {
    id: 'juice', name: 'JUICE', horizonsId: '-28', launched: '2023-04-14', agency: 'ESA',
    from: '2023-04-20', daysAhead: 365, step: '7 d',
    about: [
      'ESA’s Jupiter Icy Moons Explorer, due at Jupiter in 2031 to study Ganymede, Callisto and Europa.',
      'Made the first ever lunar-Earth double flyby in 2024 on its way.'
    ]
  }
];

export const craftById = (id: CraftId) => CRAFT.find((c) => c.id === id)!;
export const isCraftId = (id: string): id is CraftId => CRAFT.some((c) => c.id === id);
