// "Tonight's sky": what can be seen by eye from a place on Earth tonight. The planets and the Moon,
// when each is up after dusk, where to look and how bright it is, from Astronomy Engine's
// topocentric positions (with refraction), so it holds anywhere and on any date.

import { Body, Equator, Horizon, Illumination, MoonPhase, Observer, SearchAltitude, type FlexibleDateTime } from 'astronomy-engine';
import type { PlanetId } from './bodies';
import { planetById } from './bodies';
import { moonPhaseName } from './today';

export interface Place {
  latitude: number;
  longitude: number;
}

export interface SkyObject {
  id: PlanetId | 'moon';
  name: string;
  /** Apparent magnitude: lower is brighter; about 6 is the faintest the eye can see. */
  magnitude: number;
  /** When it is at least MIN_ALT above the horizon during the night. */
  from: number;
  to: number;
  /** Highest point in the night. */
  best: { ms: number; altitude: number; azimuth: number };
  /** Needs binoculars or a telescope (magnitude fainter than 6). */
  needsOptics: boolean;
}

export interface Tonight {
  /** The dark window: civil dusk (Sun 6° below the horizon) to dawn, or from now if already dark. */
  dark: { from: number; to: number } | null;
  /** Why there is no dark window: the Sun stays up, or (polar night) never rises. */
  polar?: 'midnight-sun' | 'polar-night';
  visible: SkyObject[];
  /** Planets not up after dark tonight (mostly too close to the Sun). */
  hidden: string[];
  moon: { phase: string; lit: number };
}

const HOUR = 3_600_000;
const STEP = 10 * 60_000;
/** Altitude a planet needs to be seen clear of trees, buildings and haze, degrees. */
export const MIN_ALT = 10;
/** Civil twilight: bright planets show once the Sun is this far below the horizon. */
const DUSK_ALT = -6;

const PLANETS: [PlanetId, Body][] = [
  ['mercury', Body.Mercury], ['venus', Body.Venus], ['mars', Body.Mars], ['jupiter', Body.Jupiter],
  ['saturn', Body.Saturn], ['uranus', Body.Uranus], ['neptune', Body.Neptune]
];

function altAz(body: Body, ms: number, obs: Observer) {
  const date = new Date(ms);
  const eq = Equator(body, date, obs, true, true);
  return Horizon(date, obs, eq.ra, eq.dec, 'normal');
}

const timeOf = (t: { date: Date } | null) => (t ? t.date.getTime() : null);
const search = (dir: 1 | -1, obs: Observer, from: FlexibleDateTime, days: number) => timeOf(SearchAltitude(Body.Sun, obs, dir, from, days, DUSK_ALT));

/** The night that `now` is in, or the next one if it is still day. */
function darkWindow(now: number, obs: Observer): Pick<Tonight, 'dark' | 'polar'> {
  const sunAlt = altAz(Body.Sun, now, obs).altitude;
  if (sunAlt < DUSK_ALT) {
    const dawn = search(1, obs, new Date(now), 2);
    // No dawn within two days: polar night. Use the next 12 hours.
    return dawn ? { dark: { from: now, to: dawn } } : { dark: { from: now, to: now + 12 * HOUR }, polar: 'polar-night' };
  }
  const dusk = search(-1, obs, new Date(now), 1.2);
  if (!dusk) return { dark: null, polar: 'midnight-sun' };
  const dawn = search(1, obs, new Date(dusk), 2) ?? dusk + 12 * HOUR;
  return { dark: { from: dusk, to: dawn } };
}

function track(id: PlanetId | 'moon', body: Body, name: string, dark: { from: number; to: number }, obs: Observer): SkyObject | null {
  let from: number | null = null, to = 0;
  let best = { ms: 0, altitude: -90, azimuth: 0 };
  // On a 10-minute grid, so times read 22:50 rather than 22:43.
  for (let ms = Math.ceil(dark.from / STEP) * STEP; ms <= dark.to; ms += STEP) {
    const h = altAz(body, ms, obs);
    if (h.altitude >= MIN_ALT) {
      from ??= ms;
      to = ms;
    }
    if (h.altitude > best.altitude) best = { ms, altitude: h.altitude, azimuth: h.azimuth };
  }
  if (from === null) return null;
  const magnitude = Illumination(body, new Date(best.ms)).mag;
  return { id, name, magnitude, from, to, best, needsOptics: magnitude > 6 };
}

export function tonightSky(now: number, place: Place): Tonight {
  const obs = new Observer(place.latitude, place.longitude, 0);
  const { dark, polar } = darkWindow(now, obs);
  const date = new Date(now);
  const moon = { phase: moonPhaseName(MoonPhase(date)), lit: Math.round(Illumination(Body.Moon, date).phase_fraction * 100) };
  if (!dark) return { dark, polar, visible: [], hidden: PLANETS.map(([id]) => planetById(id).name), moon };

  const visible: SkyObject[] = [];
  const hidden: string[] = [];
  const m = track('moon', Body.Moon, 'Moon', dark, obs);
  if (m) visible.push(m);
  for (const [id, body] of PLANETS) {
    const o = track(id, body, planetById(id).name, dark, obs);
    if (o) visible.push(o);
    else hidden.push(planetById(id).name);
  }
  // Moon first, then brightest first.
  visible.sort((a, b) => (a.id === 'moon' ? -1 : b.id === 'moon' ? 1 : a.magnitude - b.magnitude));
  return { dark, polar, visible, hidden, moon };
}

const POINTS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

/** Compass direction for an azimuth (degrees east of north): 200 → "south". */
export const compass = (azimuth: number) => POINTS[Math.round((((azimuth % 360) + 360) % 360) / 45) % 8];

/** How high, in words a person can use: "low", "halfway up", "high". */
export const height = (altitude: number) => (altitude < 25 ? 'low' : altitude < 55 ? 'halfway up' : 'high overhead');

/** "very bright", "bright", "easy to see", "faint", "needs binoculars". */
export function brightness(mag: number): string {
  if (mag < -2) return 'very bright';
  if (mag < 0.5) return 'bright';
  if (mag < 3) return 'easy to see';
  if (mag <= 6) return 'faint, best from a dark site';
  return mag < 9 ? 'needs binoculars' : 'needs a telescope';
}

/**
 * One line on when and where to look: "Up from 22:50 until dawn; highest around 04:00, halfway up
 * in the south." `time` formats a moment in the reader's time zone.
 */
export function whenAndWhere(o: SkyObject, dark: { from: number; to: number }, time: (ms: number) => string): string {
  const atDusk = o.from - dark.from < STEP, atDawn = dark.to - o.to < STEP;
  const span = atDusk && atDawn ? 'Up all night' : atDusk ? `Up at dusk until ${time(o.to)}` : atDawn ? `Up from ${time(o.from)} until dawn` : `Up from ${time(o.from)} to ${time(o.to)}`;
  const when = o.best.ms - dark.from < STEP ? 'highest at dusk' : dark.to - o.best.ms < STEP ? 'highest before dawn' : `highest around ${time(o.best.ms)}`;
  return `${span}; ${when}, ${height(o.best.altitude)} in the ${compass(o.best.azimuth)}.`;
}

/** Round a location to 0.1° (about 10 km): plenty for the sky, and kinder to privacy. */
export const roundPlace = (p: Place): Place => ({ latitude: Math.round(p.latitude * 10) / 10, longitude: Math.round(p.longitude * 10) / 10 });
