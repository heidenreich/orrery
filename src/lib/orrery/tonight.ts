// "Tonight's sky": what can be seen from a place on Earth tonight. The planets and the Moon,
// when each is up after dusk, where to look and how bright it is, from Astronomy Engine's
// topocentric positions (with refraction), so it holds anywhere and on any date.
//
// Bright planets show in twilight, faint ones only in a properly dark sky, so each object counts
// as up only while the Sun is far enough down for its brightness (sunLimit).

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
  /** Already up when the sky got dark enough for it, and still up when dawn hid it. */
  fromDark: boolean;
  untilDawn: boolean;
  /** Best with binoculars or a telescope: fainter than magnitude 5, which a city or a hazy sky hides. */
  needsOptics: boolean;
}

export interface Tonight {
  /** When bright planets show: civil dusk (Sun 6° below the horizon) to civil dawn, or from now if
   * that has already begun. Fainter objects need a darker sky inside this window. */
  dark: { from: number; to: number } | null;
  /** Why there is no dark window: the Sun stays up, or (polar night) never rises. */
  polar?: 'midnight-sun' | 'polar-night';
  /** The Moon and the planets that can be seen by eye, Moon first then brightest first. */
  visible: SkyObject[];
  /** Planets up in a dark sky but too faint to find without binoculars (Uranus, Neptune). */
  optics: SkyObject[];
  /** Planets not up after dark tonight (mostly too close to the Sun). */
  hidden: string[];
  /** The Moon at dusk (or now, if already dark). */
  moon: { phase: string; lit: number };
}

const HOUR = 3_600_000;
const STEP = 10 * 60_000;
/** Altitude a planet needs to be seen clear of trees, buildings and haze, degrees. */
export const MIN_ALT = 10;
/** Civil twilight: the brightest planets show once the Sun is this far below the horizon. */
const DUSK_ALT = -6;
/** Fainter than this needs binoculars to find, in practice. */
const OPTICS_MAG = 5;

/**
 * How far below the horizon the Sun must be for something this bright to show: the Moon, Venus and
 * Jupiter in civil twilight, Saturn or Mars (around magnitude 1) once nautical twilight begins, and
 * anything fainter only in a fully dark sky.
 */
export const sunLimit = (mag: number) => (mag < -1 ? -6 : mag < 2 ? -9 : mag < 4 ? -12 : -18);

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

/**
 * The night that `now` is in, or the next one if it is still day. Decided from the searches alone
 * (is the next dawn before the next dusk?), so the edge cases agree with the times found.
 */
function darkWindow(now: number, obs: Observer): Pick<Tonight, 'dark' | 'polar'> {
  const dusk = search(-1, obs, new Date(now), 1.2);
  const dawn = search(1, obs, new Date(now), 1.2);
  if (dawn !== null && (dusk === null || dawn < dusk)) return { dark: { from: now, to: dawn } };
  if (dusk !== null) {
    const next = search(1, obs, new Date(dusk), 1.2);
    return next !== null ? { dark: { from: dusk, to: next } } : { dark: { from: dusk, to: dusk + 12 * HOUR }, polar: 'polar-night' };
  }
  // Neither within a day: the Sun stays up, or stays down.
  return altAz(Body.Sun, now, obs).altitude >= DUSK_ALT ? { dark: null, polar: 'midnight-sun' } : { dark: { from: now, to: now + 12 * HOUR }, polar: 'polar-night' };
}

function track(id: PlanetId | 'moon', body: Body, name: string, dark: { from: number; to: number }, sunAlts: Map<number, number>, obs: Observer): SkyObject | null {
  // Brightness hardly changes over a night: take it mid-window.
  const magnitude = Illumination(body, new Date((dark.from + dark.to) / 2)).mag;
  const limit = sunLimit(magnitude);
  let from: number | null = null, to = 0;
  let best: SkyObject['best'] | null = null;
  let firstDark: number | null = null, lastDark = 0;
  for (const [ms, sun] of sunAlts) {
    if (sun >= limit) continue;
    firstDark ??= ms;
    lastDark = ms;
    const h = altAz(body, ms, obs);
    if (h.altitude < MIN_ALT) continue;
    from ??= ms;
    to = ms;
    if (!best || h.altitude > best.altitude) best = { ms, altitude: h.altitude, azimuth: h.azimuth };
  }
  if (from === null || !best) return null;
  return { id, name, magnitude, from, to, best, fromDark: from === firstDark, untilDawn: to === lastDark, needsOptics: magnitude > OPTICS_MAG };
}

export function tonightSky(now: number, place: Place): Tonight {
  const obs = new Observer(place.latitude, place.longitude, 0);
  const { dark, polar } = darkWindow(now, obs);
  // The Moon as it will be this evening, not at the moment of asking.
  const moon = moonAt(dark ? dark.from : now);
  if (!dark) return { dark, polar, visible: [], optics: [], hidden: PLANETS.map(([id]) => planetById(id).name), moon };

  // The Sun's altitude on a 10-minute grid, so times read 22:50 rather than 22:43.
  const sunAlts = new Map<number, number>();
  for (let ms = Math.ceil(dark.from / STEP) * STEP; ms <= dark.to; ms += STEP) sunAlts.set(ms, altAz(Body.Sun, ms, obs).altitude);

  const seen: SkyObject[] = [];
  const hidden: string[] = [];
  const m = track('moon', Body.Moon, 'Moon', dark, sunAlts, obs);
  if (m) seen.push(m);
  for (const [id, body] of PLANETS) {
    const o = track(id, body, planetById(id).name, dark, sunAlts, obs);
    if (o) seen.push(o);
    else hidden.push(planetById(id).name);
  }
  // Moon first, then brightest first.
  seen.sort((a, b) => (a.id === 'moon' ? -1 : b.id === 'moon' ? 1 : a.magnitude - b.magnitude));
  return { dark, polar, visible: seen.filter((o) => !o.needsOptics), optics: seen.filter((o) => o.needsOptics), hidden, moon };
}

/** The Moon's phase name and how much of it is lit at a moment. */
export function moonAt(ms: number): { phase: string; lit: number } {
  const date = new Date(ms);
  return { phase: moonPhaseName(MoonPhase(date)), lit: Math.round(Illumination(Body.Moon, date).phase_fraction * 100) };
}

const POINTS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

/** Compass direction for an azimuth (degrees east of north): 200 → "south". */
export const compass = (azimuth: number) => POINTS[Math.round((((azimuth % 360) + 360) % 360) / 45) % 8];

/** How high, in words a person can use: "low", "halfway up", "high", "almost overhead". */
export const height = (altitude: number) => (altitude < 20 ? 'low' : altitude < 50 ? 'halfway up' : altitude < 75 ? 'high' : 'almost overhead');

/** "very bright", "bright", "easy to see", "faint", "needs binoculars". */
export function brightness(mag: number): string {
  if (mag < -2) return 'very bright';
  if (mag < 0.5) return 'bright';
  if (mag < 3) return 'easy to see';
  if (mag <= OPTICS_MAG) return 'faint, best away from city lights';
  return mag < 6.5 ? 'just visible from a very dark site; easier with binoculars' : mag < 9 ? 'needs binoculars' : 'needs a telescope';
}

/**
 * One line on when and where to look: "Visible from 22:50 until dawn; highest around 04:00, halfway up
 * in the south." `time` formats a moment in the reader's time zone.
 */
export function whenAndWhere(o: SkyObject, time: (ms: number) => string): string {
  const start = o.fromDark ? (sunLimit(o.magnitude) === DUSK_ALT ? 'dusk' : 'nightfall') : time(o.from);
  const span =
    o.to - o.from < 2 * STEP ? `Visible briefly around ${time(o.from)}`
    : o.fromDark && o.untilDawn ? 'Visible all night'
    : `Visible from ${start} ${o.untilDawn ? 'until dawn' : `to ${time(o.to)}`}`;
  const at = o.best.ms === o.from && o.fromDark ? `highest at ${start}` : o.best.ms === o.to && o.untilDawn ? 'highest before dawn' : `highest around ${time(o.best.ms)}`;
  return o.to - o.from < 2 * STEP ? `${span}, ${height(o.best.altitude)} in the ${compass(o.best.azimuth)}.` : `${span}; ${at}, ${height(o.best.altitude)} in the ${compass(o.best.azimuth)}.`;
}

/** Round a location to 0.1° (about 10 km): plenty for the sky, and kinder to privacy. */
export const roundPlace = (p: Place): Place => ({ latitude: Math.round(p.latitude * 10) / 10, longitude: Math.round(p.longitude * 10) / 10 });
