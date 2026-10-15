// "Solar system today": one line per world from the latest readings (fetched hourly at build time)
// and today's geometry. Always about the real now, whatever the clock shows, because the readings
// are. The Moon's phase is in "Tonight's sky" instead.

import { craftState, type SpacecraftData } from '../data/spacecraft-data';
import type { WeatherData } from '../data/weather-data';
import { flareClass } from '../data/xray';
import { kpStep, kpWords } from '../data/kp';
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

const flareLevel = (flux: number) =>
  flux >= 1e-4 ? 'A major X-class flare' : flux >= 1e-5 ? 'An M-class flare' : flux >= 1e-6 ? 'Small C-class flares' : 'Quiet';

const auroraShort = (raw: number, kp = kpStep(raw)) =>
  kp >= 7 ? 'auroras possible far from the poles' : kp >= 5 ? 'auroras may reach mid-latitudes' : kp >= 3 ? 'auroras at high latitudes' : 'auroras near the poles only';

export function todayLines(now: number, weather: WeatherData | null, spacecraft: SpacecraftData | null): TodayLine[] {
  const lines: TodayLine[] = [];
  const x = weather?.xray.summary, w = weather?.solarWind.summary;
  if (x || w) {
    const parts = [x ? `${flareLevel(x.latest.flux)} (${flareClass(x.latest.flux)})` : null, w ? `solar wind ${Math.round(w.latest.speed)} km/s` : null];
    lines.push({ focus: 'sun', label: 'Sun', text: parts.filter(Boolean).join(' · ') });
  }
  const k = weather?.kp.summary;
  if (k) lines.push({ focus: 'earth', label: 'Earth', text: `Kp ${k.latest.kp.toFixed(k.latest.kp % 1 ? 1 : 0)}, ${kpWords(k.latest.kp).toLowerCase()}: ${auroraShort(k.latest.kp)}` });

  const r = weather?.mars.report;
  if (r && (r.minTemp !== null || r.maxTemp !== null)) {
    const range = [r.minTemp, r.maxTemp].map((t) => (t === null ? '?' : celsius(t))).join(' to ');
    lines.push({ focus: 'mars', label: 'Mars', text: `${range} at Gale Crater in Curiosity's latest report (sol ${r.sol})` });
  }

  const v1 = spacecraft?.craft.find((t) => t.id === 'voyager-1');
  const s = v1 ? craftState(v1, now) : null;
  if (s) {
    const d = distance(s.pos, planetPosition('earth', now));
    lines.push({ focus: 'voyager-1', label: 'Voyager 1', text: `${km(d)} from Earth; a radio signal takes ${lightTime(d)} to reach it` });
  }
  return lines;
}

/** When the newest space weather reading was fetched (Mars's report gives its own sol), or null. */
export function readingsFetchedAt(weather: WeatherData | null): string | null {
  if (!weather) return null;
  const times = [weather.xray?.fetchedAt, weather.solarWind.fetchedAt, weather.kp.fetchedAt].filter((t): t is string => !!t);
  return times.length ? times.sort().at(-1)! : null;
}
