// Parser for NOAA SWPC's planetary K-index (Kp), the standard 0–9 measure of how disturbed
// Earth's magnetic field is: https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json
// One value per 3-hour interval for about the last week, labelled with the interval's start.
//
// NOAA has served this product as an array of rows with a header row first
// (["time_tag","Kp","a_running","station_count"], then ["2026-10-07 00:00:00.000","2.33",...])
// and as an array of objects ({ "time_tag": ..., "Kp": 2.33, ... }). The parser accepts both,
// numbers or numeric strings, and logs which shape it saw. On 2026-10-14 it served 62 objects
// (about 8 days), the newest for the interval that had ended most recently.

import type { Logger } from './fetch-json';

export const KP_URL = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json';

export interface KpPoint {
  /** Start of the 3-hour interval, ISO UTC. */
  time: string;
  kp: number;
}

export interface KpSummary {
  latest: KpPoint;
  /** The last three days, oldest first. */
  series: KpPoint[];
}

/** Kp is published every 3 hours; a newest value older than this counts as a failed fetch. */
export const KP_MAX_AGE_HOURS = 9;
const INTERVAL_MS = 3 * 3_600_000;
const FUTURE_TOLERANCE_MS = 10 * 60_000;

const toNumber = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** "2026-10-07 00:00:00.000" or "2026-10-07T00:00:00", both UTC. */
function toIso(tag: unknown): string | null {
  if (typeof tag !== 'string') return null;
  const t = tag.trim().replace(' ', 'T');
  const ms = Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(t) ? t : `${t}Z`);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

export function summarizeKp(
  body: unknown,
  log: Logger,
  opts: { now?: number; windowHours?: number; maxAgeHours?: number } = {}
): { ok: true; summary: KpSummary } | { ok: false; reason: string } {
  const { now = Date.now(), windowHours = 72, maxAgeHours = KP_MAX_AGE_HOURS } = opts;
  if (!Array.isArray(body)) return { ok: false, reason: 'response is not a JSON array' };

  // Rows as arrays: find the time and Kp columns from the header row.
  let read: (row: unknown) => { tag: unknown; kp: unknown } | null;
  let shape: string;
  const header = body[0];
  if (Array.isArray(header) && header.every((h) => typeof h === 'string')) {
    const names = header.map((h: string) => h.toLowerCase());
    const ti = names.indexOf('time_tag');
    const ki = names.findIndex((n) => n === 'kp' || n === 'kp_index' || n === 'estimated_kp');
    if (ti < 0 || ki < 0) return { ok: false, reason: `header has no time_tag and Kp columns (${header.join(', ')})` };
    read = (r) => (Array.isArray(r) ? { tag: r[ti], kp: r[ki] } : null);
    shape = 'rows with a header';
  } else {
    read = (r) => {
      if (typeof r !== 'object' || r === null || Array.isArray(r)) return null;
      const o = r as Record<string, unknown>;
      return { tag: o.time_tag, kp: o.Kp ?? o.kp ?? o.kp_index ?? o.estimated_kp };
    };
    shape = 'objects';
  }

  const byTime = new Map<string, KpPoint>();
  for (const r of body) {
    const v = read(r);
    if (!v) continue;
    const time = toIso(v.tag);
    const kp = toNumber(v.kp);
    if (!time || kp === null || kp < 0 || kp > 9 || Date.parse(time) > now + FUTURE_TOLERANCE_MS) continue;
    byTime.set(time, { time, kp: Math.round(kp * 100) / 100 });
  }
  log.info('[kp]', `${body.length} entries as ${shape}; ${byTime.size} usable`);
  if (!byTime.size) return { ok: false, reason: `none of the ${body.length} entries had a time and a Kp value` };

  const ordered = [...byTime.values()].sort((a, b) => a.time.localeCompare(b.time));
  const latest = ordered[ordered.length - 1];
  // The value covers the 3 hours from its time tag, so measure age from the end of the interval.
  const ageHours = (now - Date.parse(latest.time) - INTERVAL_MS) / 3_600_000;
  if (ageHours > maxAgeHours) {
    return { ok: false, reason: `newest Kp is ${ageHours.toFixed(1)} h old (${latest.time}); limit is ${maxAgeHours} h` };
  }
  const since = Date.parse(latest.time) - windowHours * 3_600_000;
  const series = ordered.filter((p) => Date.parse(p.time) > since);
  log.info('[kp]', `latest Kp ${latest.kp} for ${latest.time}; ${series.length} intervals`);
  return { ok: true, summary: { latest, series } };
}

/** NOAA geomagnetic storm scale: G1 at Kp 5 up to G5 at Kp 9; 0 below that. */
export const stormLevel = (kp: number) => (kp >= 5 ? Math.min(5, Math.floor(kp) - 4) : 0);

const STORM_NAMES = ['', 'minor', 'moderate', 'strong', 'severe', 'extreme'];

/** "Quiet", "Active", "G2 moderate storm". */
export function kpWords(kp: number): string {
  const g = stormLevel(kp);
  if (g) return `G${g} ${STORM_NAMES[g]} storm`;
  return kp >= 4 ? 'Active' : kp >= 3 ? 'Unsettled' : 'Quiet';
}

/** Where auroras might be seen, roughly, at this level (they also need a dark, clear sky). */
export function auroraWords(kp: number): string {
  if (kp >= 8) return `${kp >= 9 ? 'An extreme' : 'A severe'} storm: auroras may be seen far from the poles, possibly as far south as the southern United States and southern Europe.`;
  if (kp >= 7) return 'A strong storm: auroras may be seen far from the poles, possibly as far as the central United States and central Europe.';
  if (kp >= 5) return 'Auroras may reach Scotland, southern Scandinavia and the northern United States.';
  if (kp >= 3) return 'Auroras likely at high latitudes, such as Iceland, northern Scandinavia, Alaska and northern Canada.';
  return 'Auroras mostly confined to the polar regions.';
}
