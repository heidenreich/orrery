// The site's weather data file (/data/weather.json): built on the server at build time from
// NASA and NOAA, small enough for every visitor to download.

import { fetchJson, type Logger } from './fetch-json';
import { STORED_MARS_REPORT, type MarsReport } from './mars-report';
import { REMS_FEED_URL, summarizeRems, type MarsHistoryPoint } from './rems';
import { SOLAR_WIND_URL, summarizeSolarWind, type SolarWindSummary } from './solar-wind';

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

/** Loose check that a value is a weather data file this code understands. */
export function isWeatherData(v: unknown): v is WeatherData {
  const d = v as WeatherData;
  return (
    typeof d === 'object' && d !== null && d.version === 1 &&
    typeof d.mars?.report?.sol === 'number' && typeof d.mars.report.earthDate === 'string' &&
    Array.isArray(d.mars.history) && typeof d.solarWind?.source === 'string'
  );
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

  const sw = wind.ok ? summarizeSolarWind(wind.body, log) : wind;
  if (sw.ok) data.solarWind = { source: 'live', fetchedAt: at(), summary: sw.summary };
  else data.solarWind.error = sw.reason;

  // Keep the last good data for anything that failed this time.
  if ((!mars.ok || !sw.ok) && previousUrl) {
    const prev = await fetchJson(previousUrl, { fetch: doFetch, log, tag: '[data]', timeoutMs: 15_000 });
    if (prev.ok && isWeatherData(prev.body)) {
      if (!mars.ok && prev.body.mars.source !== 'stored') data.mars = { ...prev.body.mars, source: 'previous', error: mars.reason };
      if (!sw.ok && prev.body.solarWind.summary) data.solarWind = { ...prev.body.solarWind, source: 'previous', error: sw.reason };
    } else {
      log.warn('[data]', `previous data unavailable: ${prev.ok ? 'unrecognised format' : prev.reason}`);
    }
  }

  if (!mars.ok) log.warn('[rems]', `NASA feed failed (${mars.reason}); Mars data is ${data.mars.source}`);
  if (!sw.ok) log.warn('[solar-wind]', `NOAA feed failed (${sw.reason}); solar wind is ${data.solarWind.source}`);
  return data;
}
