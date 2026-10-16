// The spacecraft data file (/data/spacecraft.json): trajectories from JPL Horizons, fetched at
// build time, at a uniform step per object so only the first time and the step are stored.
// Spacecraft are heliocentric; Titan and Triton are relative to their planet. Kept apart from
// weather.json because it is larger (tens of KB) and only the 3D view needs it.

import { CRAFT, isCraftId, type CraftId } from '../orrery/craft';
import { isMoonId, MOONS, type MoonId } from '../orrery/moons';
import type { Vec3 } from '../orrery/orbits';
import { fetchJson, type Logger } from './fetch-json';
import { horizonsUrl, parseHorizons, type StateVector } from './horizons';

export interface Track<Id extends string = string> {
  id: Id;
  source: 'live' | 'previous';
  fetchedAt: string;
  /** Time of the first sample, ISO UTC. */
  start: string;
  stepMs: number;
  /** Positions, AU, flattened x, y, z per sample: heliocentric ecliptic for spacecraft,
   * planet-centred ecliptic for moons. */
  p: number[];
  /** Velocities, AU/day, flattened the same way. */
  v: number[];
  error?: string;
}

export type CraftTrack = Track<CraftId>;
export type MoonTrack = Track<MoonId>;

export interface SpacecraftData {
  version: 1;
  generatedAt: string;
  craft: CraftTrack[];
  /** Moons Astronomy Engine doesn't cover (Titan, Triton). Absent in files from before them. */
  moons: MoonTrack[];
  /** Anything that could not be fetched or reused, with why. */
  missing: { id: CraftId | MoonId; reason: string }[];
}

const DAY_MS = 86_400_000;

/** "60 d" → ms, "6 h" → ms. */
export function stepToMs(step: string): number {
  const m = /^(\d+)\s*([dh])$/.exec(step.trim());
  if (!m) throw new Error(`unsupported step "${step}"`);
  return Number(m[1]) * (m[2] === 'd' ? DAY_MS : 3_600_000);
}

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

/** One Horizons request's worth: what to ask for and how to store it. */
interface Target<Id extends string> {
  id: Id;
  name: string;
  target: string;
  /** Horizons centre: 500@10 is the Sun, 500@699 Saturn, 500@899 Neptune. */
  center: string;
  from: string | { daysBack: number };
  daysAhead: number;
  step: string;
  /** Decimal places for positions: 5 (1,500 km) is plenty across the solar system, but a moon a
   * few hundred thousand km from its planet needs finer. */
  dp: number;
}

const CRAFT_TARGETS: Target<CraftId>[] = CRAFT.map((c) => ({
  id: c.id, name: c.name, target: c.horizonsId, center: '500@10', from: c.from, daysAhead: c.daysAhead, step: c.step, dp: 5
}));

const MOON_TARGETS: Target<MoonId>[] = MOONS.flatMap((m) =>
  m.horizons
    ? [{ id: m.id, name: m.name, target: m.horizons.target, center: m.horizons.center, from: { daysBack: 180 }, daysAhead: 180, step: m.horizons.step, dp: 8 }]
    : []
);

function toTrack<Id extends string>(c: Target<Id>, vectors: StateVector[], fetchedAt: string): Track<Id> | string {
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
    p: vectors.flatMap((s) => [round(s.x, c.dp), round(s.y, c.dp), round(s.z, c.dp)]),
    v: vectors.flatMap((s) => [round(s.vx, c.dp + 2), round(s.vy, c.dp + 2), round(s.vz, c.dp + 2)])
  };
}

/** Horizons time strings: dates for day steps, minutes for hour steps. */
function timeText(ms: number, step: string) {
  const iso = new Date(ms).toISOString();
  return step.endsWith('h') ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}` : iso.slice(0, 10);
}

// ---- Validation (the file is read back by the next build and by every visitor) ----

class Invalid extends Error {}

function track<Id extends string>(v: unknown, at: string, isId: (id: string) => id is Id): Track<Id> {
  if (typeof v !== 'object' || v === null) throw new Invalid(`${at} is not an object`);
  const t = v as Record<string, unknown>;
  if (typeof t.id !== 'string' || !isId(t.id)) throw new Invalid(`${at}.id is not a known object`);
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
  const out: Track<Id> = { id: t.id, source: t.source, fetchedAt: t.fetchedAt as string, start: t.start as string, stepMs: t.stepMs, p, v: vel };
  if (typeof t.error === 'string') out.error = t.error.slice(0, 300);
  return out;
}

const isTrackId = (id: string): id is CraftId | MoonId => isCraftId(id) || isMoonId(id);

export function parseSpacecraftData(v: unknown): { ok: true; data: SpacecraftData } | { ok: false; reason: string } {
  try {
    if (typeof v !== 'object' || v === null) throw new Invalid('file is not an object');
    const d = v as Record<string, unknown>;
    if (d.version !== 1) throw new Invalid(`unsupported version ${JSON.stringify(d.version)}`);
    if (typeof d.generatedAt !== 'string' || Number.isNaN(Date.parse(d.generatedAt))) throw new Invalid('generatedAt is not a timestamp');
    if (!Array.isArray(d.craft) || d.craft.length > CRAFT.length) throw new Invalid('craft is not a list of spacecraft');
    const craft = d.craft.map((t, i) => track(t, `craft[${i}]`, isCraftId));
    const rawMoons = d.moons ?? [];
    if (!Array.isArray(rawMoons) || rawMoons.length > MOONS.length) throw new Invalid('moons is not a list of moons');
    const moons = rawMoons.map((t, i) => track(t, `moons[${i}]`, isMoonId));
    const missing = Array.isArray(d.missing)
      ? d.missing.flatMap((m) => {
          const r = m as Record<string, unknown>;
          return typeof r?.id === 'string' && isTrackId(r.id) && typeof r.reason === 'string' ? [{ id: r.id, reason: r.reason.slice(0, 300) }] : [];
        })
      : [];
    return { ok: true, data: { version: 1, generatedAt: d.generatedAt, craft, moons, missing } };
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
  const data: SpacecraftData = { version: 1, generatedAt: at, craft: [], moons: [], missing: [] };
  if (offline) {
    log.info('[craft]', 'offline build: no spacecraft or Horizons moons');
    return data;
  }

  // One request at a time: Horizons asks clients not to send them in parallel.
  async function fetchAll<Id extends string>(targets: Target<Id>[]) {
    const tracks: Track<Id>[] = [];
    const failed: { id: Id; reason: string }[] = [];
    for (const c of targets) {
      const startMs = typeof c.from === 'string' ? Date.parse(`${c.from}T00:00:00Z`) : now().getTime() - c.from.daysBack * DAY_MS;
      let stop = timeText(now().getTime() + c.daysAhead * DAY_MS, c.step);
      const start = timeText(startMs, c.step);
      const get = () => fetchJson(horizonsUrl(c.target, start, stop, c.step, c.center), { fetch: doFetch, log, tag: '[craft]', timeoutMs: 30_000 });
      let result = parseFetched(await get());
      // The predicted trajectory on file can end sooner than asked; try again up to where it ends.
      if (!result.ok && result.coverage?.to && result.coverage.to > start.slice(0, 10)) {
        stop = result.coverage.to;
        log.info('[craft]', `${c.name}: trajectory ends ${stop}; asking again`);
        result = parseFetched(await get());
      }
      const t = result.ok ? toTrack(c, result.vectors, at) : result.reason;
      if (typeof t === 'string') {
        log.warn('[craft]', `${c.name}: ${t}`);
        failed.push({ id: c.id, reason: t });
      } else {
        log.info('[craft]', `${c.name}: ${t.p.length / 3} samples from ${t.start} every ${c.step}`);
        tracks.push(t);
      }
    }
    return { tracks, failed };
  }
  const craft = await fetchAll(CRAFT_TARGETS);
  const moons = await fetchAll(MOON_TARGETS);
  data.craft = craft.tracks;
  data.moons = moons.tracks;

  const failedCount = craft.failed.length + moons.failed.length;
  const previous = failedCount && previousUrl ? await loadPrevious(previousUrl, doFetch, log) : null;
  const reuse = <Id extends CraftId | MoonId>(failed: { id: Id; reason: string }[], old: Track<Id>[] | undefined, into: Track<Id>[]) => {
    for (const f of failed) {
      const t = old?.find((o) => o.id === f.id);
      if (t) into.push({ ...t, source: 'previous', error: f.reason });
      else data.missing.push(f);
    }
  };
  reuse(craft.failed, previous?.craft, data.craft);
  reuse(moons.failed, previous?.moons, data.moons);
  // Keep catalogue order whatever was reused.
  data.craft.sort((a, b) => CRAFT.findIndex((c) => c.id === a.id) - CRAFT.findIndex((c) => c.id === b.id));
  data.moons.sort((a, b) => MOONS.findIndex((m) => m.id === a.id) - MOONS.findIndex((m) => m.id === b.id));
  return data;
}

async function loadPrevious(url: string, doFetch: typeof fetch, log: Logger): Promise<SpacecraftData | null> {
  const prev = await fetchJson(url, { fetch: doFetch, log, tag: '[craft]', timeoutMs: 15_000 });
  const parsed = prev.ok ? parseSpacecraftData(prev.body) : prev;
  if (!parsed.ok) log.warn('[craft]', `previous spacecraft data unavailable: ${parsed.reason}`);
  return parsed.ok ? parsed.data : null;
}

function parseFetched(r: Awaited<ReturnType<typeof fetchJson>>) {
  return r.ok ? parseHorizons(r.body) : { ok: false as const, reason: r.reason, coverage: undefined };
}

// ---- Using the file ----

export const trackEnd = (t: Track) => Date.parse(t.start) + (t.p.length / 3 - 1) * t.stepMs;

/**
 * Position (AU) and velocity (AU/day) at a moment, by cubic Hermite interpolation between the
 * samples on either side, which uses their velocities and so follows curves (Parker's swing
 * past the Sun) far better than a straight line. Null outside the trajectory.
 */
export function craftState(t: Track, ms: number): { pos: Vec3; vel: Vec3 } | null {
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

/**
 * Within this distance of Earth (7.5 million km) a spacecraft is on a flyby, which bends its path
 * within hours, faster than even daily samples follow; distances from Earth are then rough.
 */
export const FLYBY_AU = 0.05;

/** AU/day to km/s. */
export const AU_PER_DAY_KMS = 149_597_870.7 / 86_400;
