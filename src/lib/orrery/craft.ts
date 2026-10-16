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
  /** A NASA 3D model (static/models/), shown when selected, and how to point it. */
  model?: CraftModel;
}

export type ModelFile = 'voyager' | 'parker' | 'new-horizons' | 'europa-clipper' | 'juice';

export interface CraftModel {
  file: ModelFile;
  /** The model's axis that should point at `toward`: Voyager's and New Horizons' dishes (+y) and
   * Europa Clipper's (−y) and JUICE's (−x) at Earth, Parker's heat shield (−z) at the Sun. Read
   * from the models. */
  axis: [number, number, number];
  toward: 'earth' | 'sun';
  /** Drawn this much larger than the usual model size: for craft whose longest part is a thin
   * array or boom, so the body itself is not lost. */
  scale?: number;
}

const VOYAGER_MODEL: CraftModel = { file: 'voyager', axis: [0, 1, 0], toward: 'earth' };

export const CRAFT: Craft[] = [
  {
    id: 'voyager-1', name: 'Voyager 1', horizonsId: '-31', launched: '1977-09-05', agency: 'NASA',
    from: '1977-09-10', daysAhead: 365, step: '60 d', model: VOYAGER_MODEL,
    about: [
      'The most distant human-made object, in interstellar space since August 2012.',
      'Flew past Jupiter (1979) and Saturn (1980), then turned back to take the “Pale Blue Dot” photo of Earth in 1990.'
    ]
  },
  {
    id: 'voyager-2', name: 'Voyager 2', horizonsId: '-32', launched: '1977-08-20', agency: 'NASA',
    from: '1977-08-25', daysAhead: 365, step: '60 d', model: VOYAGER_MODEL,
    about: [
      'The only spacecraft to visit Uranus (1986) and Neptune (1989), after Jupiter and Saturn.',
      'Crossed into interstellar space in November 2018.'
    ]
  },
  {
    id: 'new-horizons', name: 'New Horizons', horizonsId: '-98', launched: '2006-01-19', agency: 'NASA',
    from: '2006-01-25', daysAhead: 365, step: '30 d',
    model: { file: 'new-horizons', axis: [0, 1, 0], toward: 'earth' },
    about: [
      'Flew past Pluto in July 2015 and the Kuiper belt object Arrokoth in January 2019.',
      'Still heading outward through the Kuiper belt.'
    ]
  },
  {
    id: 'parker', name: 'Parker Solar Probe', horizonsId: '-96', launched: '2018-08-12', agency: 'NASA',
    from: { daysBack: 90 }, daysAhead: 90, step: '6 h',
    model: { file: 'parker', axis: [0, 0, -1], toward: 'sun' },
    about: [
      'Flies through the Sun’s outer atmosphere; its closest passes, 6.1 million km from the surface, began in December 2024.',
      'The fastest object ever built, about 190 km/s at closest approach.'
    ]
  },
  {
    id: 'europa-clipper', name: 'Europa Clipper', horizonsId: '-159', launched: '2024-10-14', agency: 'NASA',
    // Daily, as its Earth flyby (December 2026) turns it within hours.
    from: '2024-10-20', daysAhead: 365, step: '1 d',
    // Its solar arrays span 30 m, so at the usual size its body would be a speck.
    model: { file: 'europa-clipper', axis: [0, -1, 0], toward: 'earth', scale: 1.8 },
    about: [
      'On its way to Jupiter, due in 2030, to study whether Europa’s ocean under the ice could support life.',
      'Uses gravity assists from Mars (2025) and Earth (2026) to get there.'
    ]
  },
  {
    id: 'juice', name: 'JUICE', horizonsId: '-28', launched: '2023-04-14', agency: 'ESA',
    // Daily for its flybys; two years back keeps the file small.
    from: { daysBack: 730 }, daysAhead: 365, step: '1 d',
    // Its two cross-shaped solar arrays span 27 m.
    model: { file: 'juice', axis: [-1, 0, 0], toward: 'earth', scale: 1.8 },
    about: [
      'ESA’s Jupiter Icy Moons Explorer, due at Jupiter in 2031 to study Ganymede, Callisto and Europa.',
      'On its way it flew past the Moon and Earth in August 2024 (the first lunar-Earth double flyby), Venus in August 2025 and Earth again in September 2026.'
    ]
  }
];

export const craftById = (id: CraftId) => CRAFT.find((c) => c.id === id)!;
export const isCraftId = (id: string): id is CraftId => CRAFT.some((c) => c.id === id);
