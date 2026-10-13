// Parser for NOAA SWPC's real-time solar wind feed:
// https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json
// An array of 1-minute plasma records, about 2.6 MB. Records from several spacecraft are
// interleaved; each has "source" and "active". On 2026-10-13 the feed held 3591 records:
// SOLAR1 1165 (all active), ACE 1217 and IMAP 1209 (all inactive). So "active": true marks the
// spacecraft NOAA currently uses; the parser logs counts per source in case that changes.

import type { Logger } from './fetch-json';

export const SOLAR_WIND_URL = 'https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json';

export interface SolarWindPoint {
  /** ISO timestamp, UTC. */
  time: string;
  /** km/s */
  speed: number;
  /** protons per cm³ */
  density: number | null;
  /** kelvin */
  temperature: number | null;
}

export interface SolarWindSummary {
  latest: SolarWindPoint & { source: string };
  /** Last 24 hours at 10-minute spacing, oldest first. */
  series: SolarWindPoint[];
}

const finite = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** NOAA time tags have no zone ("2026-10-13T12:55:03"); they are UTC. */
function toIso(tag: unknown): string | null {
  if (typeof tag !== 'string') return null;
  const ms = Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(tag) ? tag : `${tag}Z`);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

type Row = SolarWindPoint & { source: string; active: boolean };

/** Readings older than this are treated as a failed fetch rather than shown as current. */
export const SOLAR_WIND_MAX_AGE_HOURS = 3;
/** Allowance for clock differences between NOAA and the build machine. */
const FUTURE_TOLERANCE_MS = 10 * 60_000;

export function summarizeSolarWind(
  body: unknown,
  log: Logger,
  opts: { windowHours?: number; stepMinutes?: number; now?: number; maxAgeHours?: number } = {}
): { ok: true; summary: SolarWindSummary } | { ok: false; reason: string } {
  const { windowHours = 24, stepMinutes = 10, now = Date.now(), maxAgeHours = SOLAR_WIND_MAX_AGE_HOURS } = opts;
  if (!Array.isArray(body)) return { ok: false, reason: 'response is not a JSON array' };

  const rows: Row[] = [];
  const counts: Record<string, { active: number; inactive: number }> = {};
  for (const r of body as Record<string, unknown>[]) {
    if (typeof r !== 'object' || r === null) continue;
    const source = typeof r.source === 'string' ? r.source : 'unknown';
    const active = r.active === true;
    const c = (counts[source] ??= { active: 0, inactive: 0 });
    c[active ? 'active' : 'inactive']++;
    const time = toIso(r.time_tag);
    const speed = finite(r.proton_speed);
    if (!time || speed === null || Date.parse(time) > now + FUTURE_TOLERANCE_MS) continue;
    rows.push({ time, speed, density: finite(r.proton_density), temperature: finite(r.proton_temperature), source, active });
  }
  log.info('[solar-wind]', `${body.length} records; by source:`, JSON.stringify(counts));
  if (!rows.length) return { ok: false, reason: `none of the ${body.length} records had a time and proton speed` };

  // Prefer the active spacecraft; if no record is flagged active, use every source.
  const anyActive = rows.some((r) => r.active);
  if (!anyActive) log.warn('[solar-wind]', 'no records flagged active; using all sources');
  const byTime = new Map<string, Row>();
  for (const r of rows) {
    if (anyActive && !r.active) continue;
    if (!byTime.has(r.time)) byTime.set(r.time, r);
  }
  const ordered = [...byTime.values()].sort((a, b) => a.time.localeCompare(b.time));
  const newest = ordered[ordered.length - 1];
  const ageHours = (now - Date.parse(newest.time)) / 3_600_000;
  if (ageHours > maxAgeHours) {
    return { ok: false, reason: `newest reading is ${ageHours.toFixed(1)} h old (${newest.time}); limit is ${maxAgeHours} h` };
  }

  // Downsample to one point per step: the last reading in each bucket.
  const since = Date.parse(newest.time) - windowHours * 3_600_000;
  const stepMs = stepMinutes * 60_000;
  const buckets = new Map<number, SolarWindPoint>();
  for (const r of ordered) {
    const t = Date.parse(r.time);
    if (t < since) continue;
    buckets.set(Math.floor(t / stepMs), { time: r.time, speed: r.speed, density: r.density, temperature: r.temperature });
  }
  const series = [...buckets.values()];

  const latest = { time: newest.time, speed: newest.speed, density: newest.density, temperature: newest.temperature, source: newest.source };
  log.info('[solar-wind]', `latest ${latest.speed} km/s at ${latest.time} from ${latest.source}; ${series.length} points`);
  return { ok: true, summary: { latest, series } };
}
