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
  /** Up, in a dark enough sky, at the first moment of the window (so "now", when it starts now). */
  upAtStart: boolean;
  /** Fades out before civil dawn: fainter objects are lost as the sky starts to brighten. */
  fadesEarly: boolean;
  /** Best with binoculars or a telescope: fainter than magnitude 5, which a city or a hazy sky hides. */
  needsOptics: boolean;
}

export interface Tonight {
  /** When bright planets show: civil dusk (Sun 6° below the horizon) to civil dawn, or from now if
   * that has already begun. Fainter objects need a darker sky inside this window. */
  dark: { from: number; to: number } | null;
  /**
   * Unusual nights: the Sun stays up all night (midnight sun), sets but never gets 6° down (a white
   * night, as in Reykjavik in June), or never rises (polar night, when the window is the next 24 hours).
   */
  polar?: 'midnight-sun' | 'white-night' | 'polar-night';
  /** True when it was already dark at the moment asked, so the window starts now, not at dusk. */
  startsNow: boolean;
  /** The Moon and the planets that can be seen by eye, Moon first then brightest first. */
  visible: SkyObject[];
  /** Planets up in a dark sky but too faint to find without binoculars (Uranus, Neptune). */
  optics: SkyObject[];
  /** Planets not up after dark tonight: too close to the Sun or below the horizon. */
  hidden: string[];
  /** Planets up after dusk, but only while the sky is still too bright for them. */
  washedOut: string[];
  /** The Moon at dusk (or now, if already dark). */
  moon: { phase: string; lit: number };
}

const HOUR = 3_600_000;
/** In polar night there is no dusk or dawn, so the list covers the next day. */
export const POLAR_HOURS = 24;
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

/** Where an object appears: with atmospheric refraction, which lifts things near the horizon. */
function altAz(body: Body, ms: number, obs: Observer) {
  const date = new Date(ms);
  const eq = Equator(body, date, obs, true, true);
  return Horizon(date, obs, eq.ra, eq.dec, 'normal');
}

/**
 * The Sun's geometric altitude, without refraction, as SearchAltitude uses: twilight is defined that
 * way, and mixing the two put the Sun half a degree apart near −6°, enough to disagree about
 * whether a polar night ever gets light.
 */
function sunAltitude(ms: number, obs: Observer) {
  const date = new Date(ms);
  const eq = Equator(Body.Sun, date, obs, true, true);
  return Horizon(date, obs, eq.ra, eq.dec).altitude;
}

const timeOf = (t: { date: Date } | null) => (t ? t.date.getTime() : null);
const search = (dir: 1 | -1, obs: Observer, from: FlexibleDateTime, days: number) => timeOf(SearchAltitude(Body.Sun, obs, dir, from, days, DUSK_ALT));

/**
 * The night that `now` is in, or the next one if it is still day. Decided from the searches alone
 * (is the next dawn before the next dusk?), so the edge cases agree with the times found.
 */
function darkWindow(now: number, obs: Observer): Pick<Tonight, 'dark' | 'polar' | 'startsNow'> {
  const dusk = search(-1, obs, new Date(now), 1.2);
  const dawn = search(1, obs, new Date(now), 1.2);
  if (dawn !== null && (dusk === null || dawn < dusk)) return { dark: { from: now, to: dawn }, startsNow: true };
  if (dusk !== null) {
    const next = search(1, obs, new Date(dusk), 1.2);
    return next !== null ? { dark: { from: dusk, to: next }, startsNow: false } : { dark: { from: dusk, to: dusk + POLAR_HOURS * HOUR }, polar: 'polar-night', startsNow: false };
  }
  // Neither within a day: the Sun stays down (polar night), or never gets 6° down. Then tell the
  // midnight sun (never sets) from a white night (sets, but the sky stays bright).
  if (sunAltitude(now, obs) < DUSK_ALT) return { dark: { from: now, to: now + POLAR_HOURS * HOUR }, polar: 'polar-night', startsNow: true };
  let lowest = 90;
  for (let ms = now; ms < now + 24 * HOUR; ms += 20 * 60_000) lowest = Math.min(lowest, sunAltitude(ms, obs));
  return { dark: null, polar: lowest > 0 ? 'midnight-sun' : 'white-night', startsNow: false };
}

/** The object over the night, or why not: never clear of the horizon after dusk, or only in a sky too bright for it. */
function track(id: PlanetId | 'moon', body: Body, name: string, dark: { from: number; to: number }, sunAlts: Map<number, number>, obs: Observer): SkyObject | 'washed-out' | null {
  // Brightness hardly changes over a night: take it mid-window.
  const magnitude = Illumination(body, new Date((dark.from + dark.to) / 2)).mag;
  const limit = sunLimit(magnitude);
  let from: number | null = null, to = 0;
  let best: SkyObject['best'] | null = null;
  let firstDark: number | null = null, lastDark = 0;
  let upInTwilight = false;
  const gridStart = sunAlts.keys().next().value;
  for (const [ms, sun] of sunAlts) {
    const h = sun < DUSK_ALT ? altAz(body, ms, obs) : null;
    if (sun >= limit) {
      if (h && h.altitude >= MIN_ALT) upInTwilight = true;
      continue;
    }
    firstDark ??= ms;
    lastDark = ms;
    if (!h || h.altitude < MIN_ALT) continue;
    from ??= ms;
    to = ms;
    if (!best || h.altitude > best.altitude) best = { ms, altitude: h.altitude, azimuth: h.azimuth };
  }
  if (from === null || !best) return upInTwilight ? 'washed-out' : null;
  return {
    id, name, magnitude, from, to, best,
    fromDark: from === firstDark, untilDawn: to === lastDark, upAtStart: from === gridStart,
    fadesEarly: limit < DUSK_ALT, needsOptics: magnitude > OPTICS_MAG
  };
}

export function tonightSky(now: number, place: Place): Tonight {
  const obs = new Observer(place.latitude, place.longitude, 0);
  const { dark, polar, startsNow } = darkWindow(now, obs);
  // The Moon as it will be this evening, not at the moment of asking.
  const moon = moonAt(dark ? dark.from : now);
  if (!dark) return { dark, polar, startsNow, visible: [], optics: [], hidden: [], washedOut: [], moon };

  // The Sun's altitude on a 10-minute grid, so times read 22:50 rather than 22:43.
  const sunAlts = new Map<number, number>();
  for (let ms = Math.ceil(dark.from / STEP) * STEP; ms <= dark.to; ms += STEP) sunAlts.set(ms, sunAltitude(ms, obs));

  const seen: SkyObject[] = [];
  const hidden: string[] = [], washedOut: string[] = [];
  const m = track('moon', Body.Moon, 'Moon', dark, sunAlts, obs);
  if (m && m !== 'washed-out') seen.push(m);
  for (const [id, body] of PLANETS) {
    const o = track(id, body, planetById(id).name, dark, sunAlts, obs);
    if (o && o !== 'washed-out') seen.push(o);
    // Uranus and Neptune can't be seen by eye anyway, so they aren't listed as missing.
    else if (id === 'uranus' || id === 'neptune') continue;
    else (o === 'washed-out' ? washedOut : hidden).push(planetById(id).name);
  }
  // Moon first, then brightest first.
  seen.sort((a, b) => (a.id === 'moon' ? -1 : b.id === 'moon' ? 1 : a.magnitude - b.magnitude));
  return { dark, polar, startsNow, visible: seen.filter((o) => !o.needsOptics), optics: seen.filter((o) => o.needsOptics), hidden, washedOut, moon };
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
 * in the south." `time` formats a moment in the reader's time zone. When the window starts now
 * (already dark) it says "now" rather than "dusk"; in polar night, with no dusk or dawn, it gives times.
 */
export function whenAndWhere(o: SkyObject, time: (ms: number) => string, night: Pick<Tonight, 'startsNow' | 'polar'>): string {
  const where = `${height(o.best.altitude)} in the ${compass(o.best.azimuth)}`;
  const polar = night.polar === 'polar-night';
  // "now" only if it is up in a dark enough sky at this moment; "dusk" (or "nightfall", for the
  // fainter objects that wait for a darker sky) if it was up as soon as the sky allowed; else a time.
  const start = night.startsNow && o.upAtStart ? 'now' : o.fromDark && !night.startsNow && !polar ? (o.fadesEarly ? 'nightfall' : 'dusk') : time(o.from);
  const toDawn = o.untilDawn && !polar;
  // Polar night: no dusk or dawn, and the window is the next 24 hours.
  if (polar && o.to - o.from >= 2 * STEP) {
    const span = o.upAtStart && o.untilDawn ? 'Up all day and night' : o.upAtStart ? `Visible now until ${time(o.to)}` : o.untilDawn ? `Visible from ${time(o.from)} onward` : `Visible from ${time(o.from)} to ${time(o.to)}`;
    return `${span}; highest around ${time(o.best.ms)}, ${where}.`;
  }
  // Fainter objects are lost in the brightening sky some time before civil dawn.
  const end = toDawn ? (o.fadesEarly ? 'until the sky brightens' : 'until dawn') : `${start === 'now' ? 'until' : 'to'} ${time(o.to)}`;
  if (o.to - o.from < 2 * STEP && !(start === 'now' && toDawn)) return `Visible briefly around ${time(o.from)}, ${where}.`;
  const span =
    start === 'dusk' && o.untilDawn && !o.fadesEarly && !polar ? 'Visible all night'
    : start === 'now' ? `Visible now ${end}`
    : `Visible from ${start} ${end}`;
  const at =
    o.best.ms === o.from && start !== time(o.from) ? `highest ${start === 'now' ? 'now' : `at ${start}`}`
    : o.best.ms === o.to && toDawn ? (o.fadesEarly ? 'highest as the sky brightens' : 'highest before dawn')
    : `highest around ${time(o.best.ms)}`;
  return `${span}; ${at}, ${where}.`;
}

/**
 * A typed latitude or longitude: "51.5", "−0.1" (typographic minus), "51,5" (decimal comma) or
 * "33.9 S" / "0.1W". `axis` says which letters apply; null if it can't be read or is out of range.
 */
export function parseCoordinate(text: string, axis: 'latitude' | 'longitude'): number | null {
  const [pos, neg, max] = axis === 'latitude' ? ['N', 'S', 90] : ['E', 'W', 180];
  const m = /^([+\-−–]?)\s*(\d+(?:[.,]\d+)?)\s*°?\s*([A-Za-z]?)$/.exec(text.trim());
  if (!m) return null;
  const letter = m[3].toUpperCase();
  if (letter && letter !== pos && letter !== neg) return null;
  if (letter && m[1]) return null;
  const v = Number(m[2].replace(',', '.')) * (m[1] && m[1] !== '+' ? -1 : letter === neg ? -1 : 1);
  return Math.abs(v) <= max ? v : null;
}

/** A saved place that is still a real place. */
export const isPlace = (p: unknown): p is Place =>
  typeof p === 'object' && p !== null && Math.abs((p as Place).latitude) <= 90 && Math.abs((p as Place).longitude) <= 180;

/** Round a location to 0.1° (about 10 km): plenty for the sky, and kinder to privacy. */
export const roundPlace = (p: Place): Place => ({ latitude: Math.round(p.latitude * 10) / 10, longitude: Math.round(p.longitude * 10) / 10 });
