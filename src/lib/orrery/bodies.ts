import type { OrbitalElements } from './orbits';

export type BodyId =
  | 'sun'
  | 'mercury'
  | 'venus'
  | 'earth'
  | 'mars'
  | 'jupiter'
  | 'saturn'
  | 'uranus'
  | 'neptune';

export interface Body {
  id: BodyId;
  name: string;
  kind: string;
  radiusKm: number;
  temp: string;
  weather: string[];
  year?: string;
  day?: string;
  pressure?: string;
}

export interface Planet extends Body, OrbitalElements {
  color: string;
  bands?: string[];
  rings?: boolean;
  /** Axial tilt in degrees, when it matters visually. */
  tilt?: number;
}

export const SUN: Body = {
  id: 'sun',
  name: 'Sun',
  kind: 'G-type star',
  radiusKm: 696_000,
  temp: '≈ 5,500 °C surface',
  weather: [
    'Its weather is space weather: the solar wind streams outward at about 400 km/s, punctuated by flares and coronal mass ejections.',
    'NOAA publishes live solar-wind readings, a candidate data feed for this app.'
  ]
};

// Orbital elements: JPL Approximate Positions of the Planets, Table 1 (1800–2050 AD).
export const PLANETS: Planet[] = [
  {
    id: 'mercury', name: 'Mercury', kind: 'Terrestrial planet', color: '#a59d94', radiusKm: 2440,
    el: [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593],
    rt: [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
    year: '88 days', day: '176 Earth days (solar)', temp: '−180 to 430 °C', pressure: 'Near vacuum',
    weather: [
      'Too little atmosphere for weather: a thin exosphere of atoms knocked off the surface.',
      'Has the widest day–night temperature swing of any planet.'
    ]
  },
  {
    id: 'venus', name: 'Venus', kind: 'Terrestrial planet', color: '#e3c58f', radiusKm: 6052,
    el: [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255],
    rt: [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418],
    year: '225 days', day: '117 Earth days (solar), retrograde', temp: '≈ 465 °C surface', pressure: '≈ 92 bar',
    weather: [
      'Sulfuric acid clouds wrap the whole planet.',
      'Cloud tops super-rotate, circling the planet in about 4 days at roughly 360 km/h.',
      "Runaway greenhouse makes the surface hotter than Mercury's."
    ]
  },
  {
    id: 'earth', name: 'Earth', kind: 'Terrestrial planet', color: '#4f86c6', radiusKm: 6371,
    el: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
    rt: [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
    year: '365.25 days', day: '24 h', temp: '≈ 15 °C mean', pressure: '1.013 bar',
    weather: ['The reference point: water clouds, rain, and the only liquid surface oceans we know of.']
  },
  {
    id: 'mars', name: 'Mars', kind: 'Terrestrial planet', color: '#c8643b', radiusKm: 3390,
    el: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    rt: [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
    year: '687 days (668.6 sols)', day: '24 h 39 m (one sol)', temp: '≈ −63 °C mean', pressure: '≈ 6 mbar (0.6% of Earth)',
    weather: [
      'Dust storms can grow to cover the whole planet for weeks.',
      'Up to a quarter of the CO₂ atmosphere freezes onto the poles each winter, so pressure rises and falls with the seasons.',
      'Curiosity (Gale Crater) and Perseverance (Jezero Crater) both carry weather stations.'
    ]
  },
  {
    id: 'jupiter', name: 'Jupiter', kind: 'Gas giant', color: '#c9a27e', radiusKm: 69911,
    bands: ['#d8c2a3', '#b07f57', '#e6d6bd', '#a8714c', '#cfb592'],
    el: [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
    rt: [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
    year: '11.9 years', day: '9 h 56 m', temp: '≈ −110 °C cloud tops', pressure: 'No surface',
    weather: [
      'The Great Red Spot is a storm wider than Earth that has lasted for centuries.',
      'Alternating jet streams split the clouds into light zones and dark belts.',
      "Lightning more powerful than Earth's flickers in deep water clouds."
    ]
  },
  {
    id: 'saturn', name: 'Saturn', kind: 'Gas giant', color: '#d9c08d', radiusKm: 58232,
    bands: ['#e4d1a6', '#c8ab76', '#efe0bd', '#bfa06c'], rings: true, tilt: 26.7,
    el: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
    rt: [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
    year: '29.5 years', day: '10 h 33 m', temp: '≈ −140 °C at 1 bar', pressure: 'No surface',
    weather: [
      'Equatorial winds reach about 1,800 km/h.',
      'A six-sided jet stream, the hexagon, circles the north pole.',
      'Giant white storms erupt roughly once per Saturn year.'
    ]
  },
  {
    id: 'uranus', name: 'Uranus', kind: 'Ice giant', color: '#9fd3d8', radiusKm: 25362,
    bands: ['#a6dbe0', '#93c8cf', '#b0e2e6'], tilt: 97.8,
    el: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503],
    rt: [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
    year: '84 years', day: '17 h 14 m, retrograde', temp: '≈ −195 °C at 1 bar', pressure: 'No surface',
    weather: [
      'Tipped on its side, so each pole gets about 42 years of daylight followed by 42 years of night.',
      'Holds the record low for a planetary atmosphere, around −224 °C.'
    ]
  },
  {
    id: 'neptune', name: 'Neptune', kind: 'Ice giant', color: '#4a6fd1', radiusKm: 24622,
    bands: ['#5277d6', '#3f62c0', '#6386de'],
    el: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
    rt: [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664],
    year: '165 years', day: '16 h 6 m', temp: '≈ −200 °C at 1 bar', pressure: 'No surface',
    weather: [
      'Fastest winds measured in the solar system, up to about 2,100 km/h.',
      'Voyager 2 saw a dark storm the size of Earth in 1989; it had vanished by 1994.'
    ]
  }
];

export const ALL_BODIES: Body[] = [SUN, ...PLANETS];
export const bodyById = (id: BodyId) => ALL_BODIES.find((b) => b.id === id)!;
export const planetById = (id: Exclude<BodyId, 'sun'>) => PLANETS.find((p) => p.id === id)!;
