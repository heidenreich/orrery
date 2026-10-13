// The site's weather data file (/data/weather.json): built on the server at build time from
// NASA and NOAA, small enough for every visitor to download.

import { fetchJson, type Logger } from './fetch-json';
import { STORED_MARS_REPORT, type MarsReport } from './mars-report';
import { isIsoDate, REMS_FEED_URL, summarizeRems, type MarsHistoryPoint } from './rems';
import { SOLAR_WIND_URL, summarizeSolarWind, type SolarWindPoint, type SolarWindSummary } from './solar-wind';

/**
 * live: fetched for this build.
 * previous: the source failed this build, so the last deployed copy was kept.
 * stored: no data could be fetched; the report bundled with the site is shown.
 */
export type DataSource = 'live' | 'previous' | 'stored';

export interface MarsData {
  source: DataSource;
  /** When the data was fetched from NASA; null for the stored report. */
  fetchedAt: string | null;
  report: MarsReport;
  history: MarsHistoryPoint[];
  /** Why the latest fetch failed, when it did. */
  error?: string;
}

export interface SolarWindData {
  source: Exclude<DataSource, 'stored'> | 'none';
  fetchedAt: string | null;
  summary: SolarWindSummary | null;
  error?: string;
}

export interface WeatherData {
  version: 1;
  generatedAt: string;
  mars: MarsData;
  solarWind: SolarWindData;
}

export const STORED_WEATHER = (generatedAt: string): WeatherData => ({
  version: 1,
  generatedAt,
  mars: { source: 'stored', fetchedAt: null, report: STORED_MARS_REPORT, history: [] },
  solarWind: { source: 'none', fetchedAt: null, summary: null }
});

/** A reused solar wind reading older than this is dropped instead of being carried forward. */
export const PREVIOUS_SOLAR_WIND_MAX_AGE_HOURS = 24;

// ---- Validation ----
// The data file is read back from the live site (at build time) and by every visitor, so check
// every field and rebuild a clean copy: anything malformed is rejected with a reason instead of
// crashing the page or being carried into the next build.

class Invalid extends Error {}
type Obj = Record<string, unknown>;

function obj(v: unknown, at: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Invalid(`${at} is not an object`);
  return v as Obj;
}
/** Finite number, or null. Undefined counts as null so files from before a field existed still load. */
function numOrNull(v: unknown, at: string): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Invalid(`${at} is not a number`);
  return v;
}
function num(v: unknown, at: string): number {
  const n = numOrNull(v, at);
  if (n === null) throw new Invalid(`${at} is missing`);
  return n;
}
function textOrNull(v: unknown, at: string, max = 40): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string' || v.length > max) throw new Invalid(`${at} is not a short string`);
  return v;
}
function date(v: unknown, at: string): string {
  if (typeof v !== 'string' || !isIsoDate(v)) throw new Invalid(`${at} is not a YYYY-MM-DD date`);
  return v;
}
function instant(v: unknown, at: string): string {
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) throw new Invalid(`${at} is not a timestamp`);
  return v;
}
function instantOrNull(v: unknown, at: string): string | null {
  return v === null || v === undefined ? null : instant(v, at);
}
function oneOf<T extends string>(v: unknown, options: readonly T[], at: string): T {
  if (!options.includes(v as T)) throw new Invalid(`${at} is not one of ${options.join(', ')}`);
  return v as T;
}
function list<T>(v: unknown, at: string, item: (x: unknown, at: string) => T, max = 500): T[] {
  if (!Array.isArray(v) || v.length > max) throw new Invalid(`${at} is not a list of up to ${max}`);
  return v.map((x, i) => item(x, `${at}[${i}]`));
}

function report(v: unknown, at: string): MarsReport {
  const r = obj(v, at);
  const sol = num(r.sol, `${at}.sol`);
  if (!Number.isInteger(sol) || sol < 0) throw new Invalid(`${at}.sol is not a sol number`);
  return {
    sol,
    earthDate: date(r.earthDate, `${at}.earthDate`),
    ls: numOrNull(r.ls, `${at}.ls`),
    month: numOrNull(r.month, `${at}.month`),
    minTemp: numOrNull(r.minTemp, `${at}.minTemp`),
    maxTemp: numOrNull(r.maxTemp, `${at}.maxTemp`),
    pressure: numOrNull(r.pressure, `${at}.pressure`),
    sunrise: textOrNull(r.sunrise, `${at}.sunrise`),
    sunset: textOrNull(r.sunset, `${at}.sunset`),
    opacity: textOrNull(r.opacity, `${at}.opacity`),
    minGroundTemp: numOrNull(r.minGroundTemp, `${at}.minGroundTemp`),
    maxGroundTemp: numOrNull(r.maxGroundTemp, `${at}.maxGroundTemp`),
    uvIndex: textOrNull(r.uvIndex, `${at}.uvIndex`)
  };
}

function historyPoint(v: unknown, at: string): MarsHistoryPoint {
  const h = obj(v, at);
  return {
    sol: num(h.sol, `${at}.sol`),
    earthDate: date(h.earthDate, `${at}.earthDate`),
    minTemp: numOrNull(h.minTemp, `${at}.minTemp`),
    maxTemp: numOrNull(h.maxTemp, `${at}.maxTemp`),
    pressure: numOrNull(h.pressure, `${at}.pressure`)
  };
}

function windPoint(v: unknown, at: string): SolarWindPoint {
  const p = obj(v, at);
  return {
    time: instant(p.time, `${at}.time`),
    speed: num(p.speed, `${at}.speed`),
    density: numOrNull(p.density, `${at}.density`),
    temperature: numOrNull(p.temperature, `${at}.temperature`)
  };
}

function windSummary(v: unknown, at: string): SolarWindSummary | null {
  if (v === null || v === undefined) return null;
  const s = obj(v, at);
  const l = obj(s.latest, `${at}.latest`);
  const source = textOrNull(l.source, `${at}.latest.source`);
  if (source === null) throw new Invalid(`${at}.latest.source is missing`);
  return { latest: { ...windPoint(l, `${at}.latest`), source }, series: list(s.series, `${at}.series`, windPoint) };
}

const errorText = (v: unknown, at: string) => textOrNull(v, at, 300) ?? undefined;

/** Check a weather data file and return a clean copy, or the first problem found. */
export function parseWeatherData(v: unknown): { ok: true; data: WeatherData } | { ok: false; reason: string } {
  try {
    const d = obj(v, 'file');
    if (d.version !== 1) throw new Invalid(`unsupported version ${JSON.stringify(d.version)}`);
    const m = obj(d.mars, 'mars');
    const w = obj(d.solarWind, 'solarWind');
    const mars: MarsData = {
      source: oneOf(m.source, ['live', 'previous', 'stored'] as const, 'mars.source'),
      fetchedAt: instantOrNull(m.fetchedAt, 'mars.fetchedAt'),
      report: report(m.report, 'mars.report'),
      history: list(m.history, 'mars.history', historyPoint)
    };
    const marsError = errorText(m.error, 'mars.error');
    if (marsError) mars.error = marsError;
    const solarWind: SolarWindData = {
      source: oneOf(w.source, ['live', 'previous', 'none'] as const, 'solarWind.source'),
      fetchedAt: instantOrNull(w.fetchedAt, 'solarWind.fetchedAt'),
      summary: windSummary(w.summary, 'solarWind.summary')
    };
    const windError = errorText(w.error, 'solarWind.error');
    if (windError) solarWind.error = windError;
    return { ok: true, data: { version: 1, generatedAt: instant(d.generatedAt, 'generatedAt'), mars, solarWind } };
  } catch (err) {
    if (err instanceof Invalid) return { ok: false, reason: err.message };
    throw err;
  }
}

interface CollectOptions {
  fetch?: typeof fetch;
  log?: Logger;
  /** URL of the currently deployed data file, used when a source fails. */
  previousUrl?: string;
  /** Skip all network requests (tests, offline builds). */
  offline?: boolean;
  now?: () => Date;
}

export async function collectWeather(opts: CollectOptions = {}): Promise<WeatherData> {
  const { fetch: doFetch = fetch, log = console, previousUrl, offline = false, now = () => new Date() } = opts;
  const at = () => now().toISOString();
  const data = STORED_WEATHER(at());
  if (offline) {
    log.info('[data]', 'offline build: using the stored report, no solar wind');
    return data;
  }

  const [rems, wind] = await Promise.all([
    fetchJson(REMS_FEED_URL, { fetch: doFetch, log, tag: '[rems]', timeoutMs: 30_000 }),
    fetchJson(SOLAR_WIND_URL, { fetch: doFetch, log, tag: '[solar-wind]', timeoutMs: 30_000 })
  ]);

  const mars = rems.ok ? summarizeRems(rems.body, log) : rems;
  if (mars.ok) data.mars = { source: 'live', fetchedAt: at(), report: mars.report, history: mars.history };
  else data.mars.error = mars.reason;

  const sw = wind.ok ? summarizeSolarWind(wind.body, log, { now: now().getTime() }) : wind;
  if (sw.ok) data.solarWind = { source: 'live', fetchedAt: at(), summary: sw.summary };
  else data.solarWind.error = sw.reason;

  // Keep the last good data for anything that failed this time.
  if ((!mars.ok || !sw.ok) && previousUrl) {
    const prev = await fetchJson(previousUrl, { fetch: doFetch, log, tag: '[data]', timeoutMs: 15_000 });
    const parsed = prev.ok ? parseWeatherData(prev.body) : prev;
    if (parsed.ok) {
      const p = parsed.data;
      if (!mars.ok && p.mars.source !== 'stored') data.mars = { ...p.mars, source: 'previous', error: mars.reason };
      if (!sw.ok && p.solarWind.summary) {
        const ageHours = (now().getTime() - Date.parse(p.solarWind.summary.latest.time)) / 3_600_000;
        if (ageHours <= PREVIOUS_SOLAR_WIND_MAX_AGE_HOURS) data.solarWind = { ...p.solarWind, source: 'previous', error: sw.reason };
        else log.warn('[solar-wind]', `previous reading is ${ageHours.toFixed(0)} h old; not reusing it`);
      }
    } else {
      log.warn('[data]', `previous data unavailable: ${parsed.reason}`);
    }
  }

  if (!mars.ok) log.warn('[rems]', `NASA feed failed (${mars.reason}); Mars data is ${data.mars.source}`);
  if (!sw.ok) log.warn('[solar-wind]', `NOAA feed failed (${sw.reason}); solar wind is ${data.solarWind.source}`);
  return data;
}
