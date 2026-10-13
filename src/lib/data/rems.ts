// Parser for NASA's Curiosity REMS weather feed.
// The feed is undocumented: every value is a string, and missing readings appear as "--".
// It sends the whole mission history (4745 sols as of 2026-10-13), newest first.

import type { Logger } from './fetch-json';
import type { MarsReport } from './mars-report';

export const REMS_FEED_URL = 'https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json';

export type RemsSol = Record<string, unknown>;

export type ParseResult = { ok: true; report: MarsReport; missing: string[] } | { ok: false; reason: string };

const MISSING = new Set(['', '--', 'null', 'undefined', 'n/a']);

function text(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return MISSING.has(s.toLowerCase()) ? null : s;
}

function num(v: unknown): number | null {
  const s = text(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** True for a real calendar date in YYYY-MM-DD form (rejects 2026-13-45 and 2026-02-30). */
export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const ms = Date.parse(`${s}T00:00:00Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === s;
}

/** "Month 12" → 12 */
function month(v: unknown): number | null {
  const m = text(v)?.match(/(\d{1,2})/);
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 12 ? n : null;
}

const OPTIONAL = {
  ls: 'ls',
  month: 'season',
  minTemp: 'min_temp',
  maxTemp: 'max_temp',
  pressure: 'pressure',
  sunrise: 'sunrise',
  sunset: 'sunset',
  opacity: 'atmo_opacity',
  minGroundTemp: 'min_gts_temp',
  maxGroundTemp: 'max_gts_temp',
  uvIndex: 'local_uv_irradiance_index'
} as const;

/** Turn one raw feed entry into a report. Sol and Earth date are required; everything else may be missing. */
export function parseSol(raw: RemsSol): ParseResult {
  const sol = num(raw.sol);
  if (sol === null || sol < 0 || !Number.isInteger(sol)) return { ok: false, reason: `invalid sol ${JSON.stringify(raw.sol)}` };
  const earthDate = text(raw.terrestrial_date);
  if (!earthDate || !isIsoDate(earthDate)) {
    return { ok: false, reason: `invalid terrestrial_date ${JSON.stringify(raw.terrestrial_date)}` };
  }

  const report: MarsReport = {
    sol,
    earthDate,
    ls: num(raw.ls),
    month: month(raw.season),
    minTemp: num(raw.min_temp),
    maxTemp: num(raw.max_temp),
    pressure: num(raw.pressure),
    sunrise: text(raw.sunrise),
    sunset: text(raw.sunset),
    opacity: text(raw.atmo_opacity),
    minGroundTemp: num(raw.min_gts_temp),
    maxGroundTemp: num(raw.max_gts_temp),
    uvIndex: text(raw.local_uv_irradiance_index)
  };
  const missing = Object.entries(OPTIONAL)
    .filter(([key]) => report[key as keyof typeof OPTIONAL] === null)
    .map(([, field]) => field);
  return { ok: true, report, missing };
}

/** The feed's sol list, or a reason it doesn't look like the REMS feed. */
export function solesOf(body: unknown): { ok: true; soles: RemsSol[] } | { ok: false; reason: string } {
  if (typeof body !== 'object' || body === null) return { ok: false, reason: 'response is not a JSON object' };
  const soles = (body as { soles?: unknown }).soles;
  if (!Array.isArray(soles)) return { ok: false, reason: `no "soles" array (keys: ${Object.keys(body).join(', ')})` };
  return { ok: true, soles: soles.filter((s): s is RemsSol => typeof s === 'object' && s !== null) };
}

export interface MarsHistoryPoint {
  sol: number;
  earthDate: string;
  minTemp: number | null;
  maxTemp: number | null;
  pressure: number | null;
}

export type MarsSummary = { ok: true; report: MarsReport; history: MarsHistoryPoint[] } | { ok: false; reason: string };

/**
 * Reduce the full feed (the whole mission, thousands of sols) to the newest valid report
 * plus the last `historySols` valid sols, oldest first.
 */
export function summarizeRems(body: unknown, log: Logger, historySols = 60): MarsSummary {
  const list = solesOf(body);
  if (!list.ok) return list;
  log.info('[rems]', `${list.soles.length} sols in feed; newest raw entry:`, JSON.stringify(list.soles[0] ?? null));

  // Parse every entry before sorting: an unparseable sol would make the comparator inconsistent
  // and could put an older sol first.
  const parsed: { report: MarsReport; missing: string[] }[] = [];
  let skipped = 0;
  for (const raw of list.soles) {
    const p = parseSol(raw);
    if (p.ok) parsed.push(p);
    else if (skipped++ < 5) log.warn('[rems]', `skipping entry: ${p.reason}`);
  }
  if (skipped > 5) log.warn('[rems]', `skipped ${skipped} invalid entries in total`);
  if (!parsed.length) return { ok: false, reason: `none of the ${list.soles.length} entries had a valid sol and date` };

  parsed.sort((a, b) => b.report.sol - a.report.sol);
  const valid = parsed.slice(0, historySols).map((p) => p.report);
  if (parsed[0].missing.length) log.info('[rems]', `sol ${valid[0].sol} has no reading for: ${parsed[0].missing.join(', ')}`);

  const history = valid
    .map(({ sol, earthDate, minTemp, maxTemp, pressure }) => ({ sol, earthDate, minTemp, maxTemp, pressure }))
    .reverse();
  log.info('[rems]', `latest sol ${valid[0].sol} (${valid[0].earthDate}); kept ${history.length} sols of history`);
  return { ok: true, report: valid[0], history };
}
