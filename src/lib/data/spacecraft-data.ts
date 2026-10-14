// The spacecraft data file (/data/spacecraft.json): trajectories from JPL Horizons, fetched at
// build time, at a uniform step per spacecraft so only the first time and the step are stored.
// Kept apart from weather.json because it is larger (tens of KB) and only the 3D view needs it.

import { CRAFT, isCraftId, type Craft, type CraftId } from '../orrery/craft';
import type { Vec3 } from '../orrery/orbits';
import { fetchJson, type Logger } from './fetch-json';
import { horizonsUrl, parseHorizons, type StateVector } from './horizons';

export interface CraftTrack {
  id: CraftId;
  source: 'live' | 'previous';
  fetchedAt: string;
  /** Time of the first sample, ISO UTC. */
  start: string;
  stepMs: number;
  /** Heliocentric ecliptic positions, AU, flattened x, y, z per sample. */
  p: number[];
  /** Velocities, AU/day, flattened the same way. */
  v: number[];
  error?: string;
}

export interface SpacecraftData {
  version: 1;
  generatedAt: string;
  craft: CraftTrack[];
  /** Spacecraft that could not be fetched or reused, with why. */
  missing: { id: CraftId; reason: string }[];
}

const DAY_MS = 86_400_000;

/** "60 d" → ms, "6 h" → ms. */
export function stepToMs(step: string): number {
  const m = /^(\d+)\s*([dh])$/.exec(step.trim());
  if (!m) throw new Error(`unsupported step "${step}"`);
  return Number(m[1]) * (m[2] === 'd' ? DAY_MS : 3_600_000);
}

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

function toTrack(c: Craft, vectors: StateVector[], fetchedAt: string): CraftTrack | string {
  const stepMs = stepToMs(c.step);
  for (let i = 1; i < vectors.length; i++) {
    if (Math.abs(vectors[i].ms - vectors[i - 1].ms - stepMs) > 2000) return `samples are not evenly spaced at ${c.step}`;
  }
  return {
    id: c.id,
    source: 'live',
    fetchedAt,
    start: new Date(vectors[0].ms).toISOString(),
    stepMs,
    p: vectors.flatMap((s) => [round(s.x, 5), round(s.y, 5), round(s.z, 5)]),
    v: vectors.flatMap((s) => [round(s.vx, 7), round(s.vy, 7), round(s.vz, 7)])
  };
}

/** Horizons time strings: dates for day steps, minutes for hour steps. */
function timeText(ms: number, step: string) {
  const iso = new Date(ms).toISOString();
  return step.endsWith('h') ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}` : iso.slice(0, 10);
}

// ---- Validation (the file is read back by the next build and by every visitor) ----

class Invalid extends Error {}

function track(v: unknown, at: string): CraftTrack {
  if (typeof v !== 'object' || v === null) throw new Invalid(`${at} is not an object`);
  const t = v as Record<string, unknown>;
  if (typeof t.id !== 'string' || !isCraftId(t.id)) throw new Invalid(`${at}.id is not a known spacecraft`);
  if (t.source !== 'live' && t.source !== 'previous') throw new Invalid(`${at}.source is not live or previous`);
  for (const k of ['fetchedAt', 'start'] as const) {
    if (typeof t[k] !== 'string' || Number.isNaN(Date.parse(t[k] as string))) throw new Invalid(`${at}.${k} is not a timestamp`);
  }
  if (typeof t.stepMs !== 'number' || !(t.stepMs >= 60_000 && t.stepMs <= 400 * DAY_MS)) throw new Invalid(`${at}.stepMs is not a plausible step`);
  const nums = (k: 'p' | 'v', limit: number) => {
    const a = t[k];
    if (!Array.isArray(a) || a.length < 6 || a.length % 3 !== 0 || a.length > 3 * 5000) throw new Invalid(`${at}.${k} is not a list of 3D samples`);
    if (!a.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < limit)) throw new Invalid(`${at}.${k} has an implausible value`);
    return a as number[];
  };
  const p = nums('p', 1000);
  const vel = nums('v', 1);
  if (p.length !== vel.length) throw new Invalid(`${at} has ${p.length / 3} positions but ${vel.length / 3} velocities`);
  const out: CraftTrack = { id: t.id, source: t.source, fetchedAt: t.fetchedAt as string, start: t.start as string, stepMs: t.stepMs, p, v: vel };
  if (typeof t.error === 'string') out.error = t.error.slice(0, 300);
  return out;
}

export function parseSpacecraftData(v: unknown): { ok: true; data: SpacecraftData } | { ok: false; reason: string } {
  try {
    if (typeof v !== 'object' || v === null) throw new Invalid('file is not an object');
    const d = v as Record<string, unknown>;
    if (d.version !== 1) throw new Invalid(`unsupported version ${JSON.stringify(d.version)}`);
    if (typeof d.generatedAt !== 'string' || Number.isNaN(Date.parse(d.generatedAt))) throw new Invalid('generatedAt is not a timestamp');
    if (!Array.isArray(d.craft) || d.craft.length > CRAFT.length) throw new Invalid('craft is not a list of spacecraft');
    const craft = d.craft.map((t, i) => track(t, `craft[${i}]`));
    const missing = Array.isArray(d.missing)
      ? d.missing.flatMap((m) => {
          const r = m as Record<string, unknown>;
          return typeof r?.id === 'string' && isCraftId(r.id) && typeof r.reason === 'string' ? [{ id: r.id, reason: r.reason.slice(0, 300) }] : [];
        })
      : [];
    return { ok: true, data: { version: 1, generatedAt: d.generatedAt, craft, missing } };
  } catch (err) {
    if (err instanceof Invalid) return { ok: false, reason: err.message };
    throw err;
  }
}

// ---- Building the file ----

interface CollectOptions {
  fetch?: typeof fetch;
  log?: Logger;
  previousUrl?: string;
  offline?: boolean;
  now?: () => Date;
}

export async function collectSpacecraft(opts: CollectOptions = {}): Promise<SpacecraftData> {
  const { fetch: doFetch = fetch, log = console, previousUrl, offline = false, now = () => new Date() } = opts;
  const at = now().toISOString();
  const data: SpacecraftData = { version: 1, generatedAt: at, craft: [], missing: [] };
  if (offline) {
    log.info('[craft]', 'offline build: no spacecraft');
    return data;
  }

  const failed: { c: Craft; reason: string }[] = [];
  // One request at a time: Horizons asks clients not to send them in parallel.
  for (const c of CRAFT) {
    const startMs = typeof c.from === 'string' ? Date.parse(`${c.from}T00:00:00Z`) : now().getTime() - c.from.daysBack * DAY_MS;
    let stop = timeText(now().getTime() + c.daysAhead * DAY_MS, c.step);
    const start = timeText(startMs, c.step);
    let result = parseFetched(await fetchJson(horizonsUrl(c.horizonsId, start, stop, c.step), { fetch: doFetch, log, tag: '[craft]', timeoutMs: 30_000 }));
    // The predicted trajectory on file can end sooner than asked; try again up to where it ends.
    if (!result.ok && result.coverage?.to && result.coverage.to > start.slice(0, 10)) {
      stop = result.coverage.to;
      log.info('[craft]', `${c.name}: trajectory ends ${stop}; asking again`);
      result = parseFetched(await fetchJson(horizonsUrl(c.horizonsId, start, stop, c.step), { fetch: doFetch, log, tag: '[craft]', timeoutMs: 30_000 }));
    }
    const t = result.ok ? toTrack(c, result.vectors, at) : result.reason;
    if (typeof t === 'string') {
      log.warn('[craft]', `${c.name}: ${t}`);
      failed.push({ c, reason: t });
    } else {
      log.info('[craft]', `${c.name}: ${t.p.length / 3} samples from ${t.start} every ${c.step}`);
      data.craft.push(t);
    }
  }

  if (failed.length && previousUrl) {
    const prev = await fetchJson(previousUrl, { fetch: doFetch, log, tag: '[craft]', timeoutMs: 15_000 });
    const parsed = prev.ok ? parseSpacecraftData(prev.body) : prev;
    if (!parsed.ok) log.warn('[craft]', `previous spacecraft data unavailable: ${parsed.reason}`);
    for (const f of failed) {
      const old = parsed.ok ? parsed.data.craft.find((t) => t.id === f.c.id) : undefined;
      if (old) data.craft.push({ ...old, source: 'previous', error: f.reason });
      else data.missing.push({ id: f.c.id, reason: f.reason });
    }
  } else {
    data.missing.push(...failed.map((f) => ({ id: f.c.id, reason: f.reason })));
  }
  // Keep catalogue order whatever was reused.
  data.craft.sort((a, b) => CRAFT.findIndex((c) => c.id === a.id) - CRAFT.findIndex((c) => c.id === b.id));
  return data;
}

function parseFetched(r: Awaited<ReturnType<typeof fetchJson>>) {
  return r.ok ? parseHorizons(r.body) : { ok: false as const, reason: r.reason, coverage: undefined };
}

// ---- Using the file ----

export const trackEnd = (t: CraftTrack) => Date.parse(t.start) + (t.p.length / 3 - 1) * t.stepMs;

/**
 * Position (AU) and velocity (AU/day) at a moment, by cubic Hermite interpolation between the
 * samples on either side, which uses their velocities and so follows curves (Parker's swing
 * past the Sun) far better than a straight line. Null outside the trajectory.
 */
export function craftState(t: CraftTrack, ms: number): { pos: Vec3; vel: Vec3 } | null {
  const t0 = Date.parse(t.start);
  const n = t.p.length / 3;
  const f = (ms - t0) / t.stepMs;
  if (f < 0 || f > n - 1) return null;
  const i = Math.min(n - 2, Math.floor(f));
  const s = f - i;
  const h = t.stepMs / DAY_MS;
  const s2 = s * s, s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
  // Derivatives of the basis, per unit s.
  const d00 = 6 * s2 - 6 * s, d10 = 3 * s2 - 4 * s + 1, d01 = -6 * s2 + 6 * s, d11 = 3 * s2 - 2 * s;
  const a = i * 3, b = a + 3;
  const comp = (k: number) => {
    const p0 = t.p[a + k], p1 = t.p[b + k], m0 = t.v[a + k] * h, m1 = t.v[b + k] * h;
    return [h00 * p0 + h10 * m0 + h01 * p1 + h11 * m1, (d00 * p0 + d10 * m0 + d01 * p1 + d11 * m1) / h];
  };
  const [x, vx] = comp(0), [y, vy] = comp(1), [z, vz] = comp(2);
  return { pos: { x, y, z }, vel: { x: vx, y: vy, z: vz } };
}

/** AU/day to km/s. */
export const AU_PER_DAY_KMS = 149_597_870.7 / 86_400;
