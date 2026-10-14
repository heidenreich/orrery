// Parser for NOAA SWPC's GOES X-ray flux, the measurement solar flares are classified by:
// https://services.swpc.noaa.gov/json/goes/primary/xrays-1-day.json
// One record per minute per channel for the last day: { time_tag, satellite, flux, energy, ... }.
// Flares are classed from the long-wave channel, energy "0.1-0.8nm"; the short-wave
// "0.05-0.4nm" channel is ignored. The parser logs the channels it saw in case that changes.

import type { Logger } from './fetch-json';

export const XRAY_URL = 'https://services.swpc.noaa.gov/json/goes/primary/xrays-1-day.json';

export interface XrayPoint {
  /** ISO UTC */
  time: string;
  /** W/m², 0.1–0.8 nm */
  flux: number;
}

export interface XraySummary {
  latest: XrayPoint & { satellite: string | null };
  /** Highest reading in the window. */
  peak: XrayPoint;
  /** The last 24 hours, the highest reading in each 10-minute step, oldest first. */
  series: XrayPoint[];
}

export const XRAY_MAX_AGE_HOURS = 3;
const FUTURE_TOLERANCE_MS = 10 * 60_000;
const LONG_CHANNEL = /0\.1\s*-\s*0\.8/;

function toIso(tag: unknown): string | null {
  if (typeof tag !== 'string') return null;
  const t = tag.trim().replace(' ', 'T');
  const ms = Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(t) ? t : `${t}Z`);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

const toNumber = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

export function summarizeXray(
  body: unknown,
  log: Logger,
  opts: { now?: number; windowHours?: number; stepMinutes?: number; maxAgeHours?: number } = {}
): { ok: true; summary: XraySummary } | { ok: false; reason: string } {
  const { now = Date.now(), windowHours = 24, stepMinutes = 10, maxAgeHours = XRAY_MAX_AGE_HOURS } = opts;
  if (!Array.isArray(body)) return { ok: false, reason: 'response is not a JSON array' };

  const channels: Record<string, number> = {};
  const byTime = new Map<string, XrayPoint & { satellite: string | null }>();
  for (const r of body) {
    if (typeof r !== 'object' || r === null || Array.isArray(r)) continue;
    const o = r as Record<string, unknown>;
    const energy = typeof o.energy === 'string' ? o.energy : 'unknown';
    channels[energy] = (channels[energy] ?? 0) + 1;
    if (!LONG_CHANNEL.test(energy)) continue;
    const time = toIso(o.time_tag);
    const flux = toNumber(o.flux);
    // Flux is positive; the feed has used negative and zero values for missing readings.
    if (!time || flux === null || flux <= 0 || Date.parse(time) > now + FUTURE_TOLERANCE_MS) continue;
    const satellite = o.satellite === undefined || o.satellite === null ? null : String(o.satellite);
    byTime.set(time, { time, flux, satellite });
  }
  log.info('[xray]', `${body.length} records; by channel:`, JSON.stringify(channels));
  if (!byTime.size) return { ok: false, reason: `none of the ${body.length} records had a 0.1–0.8 nm flux` };

  const ordered = [...byTime.values()].sort((a, b) => a.time.localeCompare(b.time));
  const latest = ordered[ordered.length - 1];
  const ageHours = (now - Date.parse(latest.time)) / 3_600_000;
  if (ageHours > maxAgeHours) {
    return { ok: false, reason: `newest reading is ${ageHours.toFixed(1)} h old (${latest.time}); limit is ${maxAgeHours} h` };
  }

  const since = Date.parse(latest.time) - windowHours * 3_600_000;
  const stepMs = stepMinutes * 60_000;
  const buckets = new Map<number, XrayPoint>();
  let peak: XrayPoint = { time: latest.time, flux: latest.flux };
  for (const p of ordered) {
    const t = Date.parse(p.time);
    if (t < since) continue;
    if (p.flux > peak.flux) peak = { time: p.time, flux: p.flux };
    const k = Math.floor(t / stepMs);
    const b = buckets.get(k);
    if (!b || p.flux > b.flux) buckets.set(k, { time: p.time, flux: p.flux });
  }
  const series = [...buckets.values()];
  log.info('[xray]', `latest ${flareClass(latest.flux)} at ${latest.time}; 24 h peak ${flareClass(peak.flux)} at ${peak.time}; ${series.length} points`);
  return { ok: true, summary: { latest, peak, series } };
}

const CLASSES = [
  ['X', 1e-4],
  ['M', 1e-5],
  ['C', 1e-6],
  ['B', 1e-7],
  ['A', 1e-8]
] as const;

/** "C3.2", "X1.0", "A0.5". The letter sets the decade, the number the multiple within it. */
export function flareClass(flux: number): string {
  // A small allowance so float error (3e-6 / 1e-6 = 2.9999…) doesn't turn C3.0 into C2.9.
  const [letter, base] = CLASSES.find(([, b]) => flux >= b * (1 - 1e-9)) ?? CLASSES[CLASSES.length - 1];
  return `${letter}${(Math.floor((flux / base) * 10 + 1e-6) / 10).toFixed(1)}`;
}

/** NOAA radio blackout scale: R1 from M1, R2 from M5, R3 from X1, R4 from X10, R5 from X20. */
export function radioBlackout(flux: number): number {
  return flux >= 2e-3 ? 5 : flux >= 1e-3 ? 4 : flux >= 1e-4 ? 3 : flux >= 5e-5 ? 2 : flux >= 1e-5 ? 1 : 0;
}

/** "Quiet", "C-class: a common, small flare", "X-class: a major flare". */
export function flareWords(flux: number): string {
  if (flux >= 1e-4) return 'X-class: a major flare';
  if (flux >= 1e-5) return 'M-class: a medium flare';
  if (flux >= 1e-6) return 'C-class: a small flare or an active Sun';
  return 'Quiet';
}
