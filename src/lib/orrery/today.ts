// "Solar system today": one line per world from the latest readings (fetched hourly at build time)
// and today's geometry. Always about the real now, whatever the clock shows, because the readings
// are. The Moon's phase is in "Tonight's sky" instead.

import { craftState, type SpacecraftData } from '../data/spacecraft-data';
import type { WeatherData } from '../data/weather-data';
import { flareClass, XRAY_MAX_AGE_HOURS } from '../data/xray';
import { SOLAR_WIND_MAX_AGE_HOURS } from '../data/solar-wind';
import { KP_MAX_AGE_HOURS, kpStep, kpWords } from '../data/kp';
import { celsius, km, lightTime } from '../format';
import type { WorldId } from './craft';
import { planetPosition } from './ephemeris';
import { distance } from './orbits';

export interface TodayLine {
  focus: WorldId;
  label: string;
  text: string;
}

/** "Waxing gibbous", from the Moon's ecliptic longitude east of the Sun (0 new, 180 full). */
export function moonPhaseName(angle: number): string {
  const a = ((angle % 360) + 360) % 360;
  if (a < 10 || a >= 350) return 'New moon';
  if (a < 80) return 'Waxing crescent';
  if (a < 100) return 'First quarter';
  if (a < 170) return 'Waxing gibbous';
  if (a < 190) return 'Full moon';
  if (a < 260) return 'Waning gibbous';
  if (a < 280) return 'Last quarter';
  return 'Waning crescent';
}

/** What the latest X-ray level means: "minor flare activity" for C-class, and so on. */
const flareLevel = (flux: number) =>
  flux >= 1e-4 ? 'a major flare' : flux >= 1e-5 ? 'a moderate flare' : flux >= 1e-6 ? 'minor flare activity' : 'quiet';

const auroraShort = (raw: number, kp = kpStep(raw)) =>
  kp >= 7 ? 'auroras possible far from the poles' : kp >= 5 ? 'auroras may reach mid-latitudes' : kp >= 3 ? 'auroras at high latitudes' : 'auroras near the poles only';

export function todayLines(now: number, weather: WeatherData | null, spacecraft: SpacecraftData | null): TodayLine[] {
  const lines: TodayLine[] = [];
  // Each reading only while it is recent enough to describe now, as in the Sun and Earth panels.
  const fresh = <T extends { time: string }>(p: T | undefined, hours: number) => (p && now - Date.parse(p.time) <= hours * 3_600_000 ? p : undefined);
  const xl = fresh(weather?.xray.summary?.latest, XRAY_MAX_AGE_HOURS), wl = fresh(weather?.solarWind.summary?.latest, SOLAR_WIND_MAX_AGE_HOURS);
  if (xl || wl) {
    const parts = [xl ? `X-rays at ${flareClass(xl.flux)}, ${flareLevel(xl.flux)}` : null, wl ? `solar wind ${Math.round(wl.speed)} km/s` : null];
    lines.push({ focus: 'sun', label: 'Sun', text: parts.filter(Boolean).join(' · ') });
  }
  const k = freshKp(weather, now);
  if (k) {
    const words = kpWords(k.kp);
    // "Unsettled" → "unsettled", but keep "G1 minor storm" as it is.
    const level = /^G\d/.test(words) ? words : words.toLowerCase();
    lines.push({ focus: 'earth', label: 'Earth', text: `Kp ${k.kp.toFixed(k.kp % 1 ? 1 : 0)}, ${level}: ${auroraShort(k.kp)}` });
  }

  const r = weather?.mars.report;
  if (r && (r.minTemp !== null || r.maxTemp !== null)) {
    const range = [r.minTemp, r.maxTemp].map((t) => (t === null ? '?' : celsius(t))).join(' to ');
    const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${r.earthDate}T12:00:00Z`));
    lines.push({ focus: 'mars', label: 'Mars', text: `Air ${range} at Gale Crater in Curiosity's latest report, for sol ${r.sol} (${day} on Earth)` });
  }

  const v1 = spacecraft?.craft.find((t) => t.id === 'voyager-1');
  const s = v1 ? craftState(v1, now) : null;
  if (s) {
    const d = distance(s.pos, planetPosition('earth', now));
    lines.push({ focus: 'voyager-1', label: 'Voyager 1', text: `${km(d)} from Earth; a radio signal takes ${lightTime(d)} one way` });
  }
  return lines;
}

/** The latest Kp, unless it is too old to describe now (the same limit as the Earth panel). */
function freshKp(weather: WeatherData | null, now: number) {
  const k = weather?.kp.summary?.latest;
  if (!k) return null;
  const ageHours = (now - Date.parse(k.time)) / 3_600_000 - 3;
  return ageHours > KP_MAX_AGE_HOURS ? null : k;
}

/**
 * When the oldest of the space weather readings shown was fetched (each feed can fall back to an
 * older copy on its own), or null if none is shown. Mars's report gives its own date.
 */
export function readingsFetchedAt(weather: WeatherData | null, now: number): { at: string; feeds: number } | null {
  if (!weather) return null;
  const shown = todayLines(now, weather, null).map((l) => l.label);
  const times = [
    shown.includes('Sun') && weather.xray?.summary && weather.xray.fetchedAt,
    shown.includes('Sun') && weather.solarWind.summary && weather.solarWind.fetchedAt,
    shown.includes('Earth') && weather.kp.fetchedAt
  ].filter((t): t is string => !!t);
  return times.length ? { at: times.sort()[0], feeds: times.length } : null;
}
