import { describe, expect, it, vi } from 'vitest';
import { CRAFT } from '../orrery/craft';
import type { Logger } from './fetch-json';
import { HORIZONS_API, horizonsUrl, parseHorizons } from './horizons';
import { collectSpacecraft, craftState, parseSpacecraftData, stepToMs, trackEnd, type CraftTrack } from './spacecraft-data';

function recorder(): Logger & { lines: string[] } {
  const lines: string[] = [];
  const push = (...args: unknown[]) => lines.push(args.map(String).join(' '));
  return { lines, info: push, warn: push };
}

// Constructed in the shape of a Horizons vector table (CSV, VEC_TABLE 2); not real data.
const result = (rows: string[]) =>
  ['*******', 'Target body name: Test craft (-999)', '$$SOE', ...rows, '$$EOE', '*******'].join('\n');
const ROWS = [
  '2461327.500000000, A.D. 2026-Oct-14 00:00:00.0000,  1.0E+00,  0.0E+00,  0.0E+00,  0.0E+00,  1.72E-02,  0.0E+00,',
  '2461328.500000000, A.D. 2026-Oct-15 00:00:00.0000,  9.998E-01,  1.72E-02,  0.0E+00, -2.96E-04,  1.72E-02,  0.0E+00,'
];

describe('parseHorizons', () => {
  it('reads state vectors between $$SOE and $$EOE, converting TDB to UTC', () => {
    const r = parseHorizons({ signature: { version: '1.2' }, result: result(ROWS) });
    expect(r.ok && r.vectors.length).toBe(2);
    expect(r.ok && r.vectors[0]).toEqual({ ms: Date.parse('2026-10-14T00:00:00Z') - 69_184, x: 1, y: 0, z: 0, vx: 0, vy: 0.0172, vz: 0 });
  });

  it('reports where the trajectory on file ends', () => {
    const text = 'No ephemeris for target "Test craft" after A.D. 2027-MAR-01 00:00:00.0000 TDB';
    expect(parseHorizons({ result: text })).toEqual({
      ok: false,
      reason: `Horizons: ${text}`,
      coverage: { to: '2027-03-01' }
    });
  });

  it('passes on API errors', () => {
    expect(parseHorizons({ error: 'Cannot interpret date' })).toEqual({ ok: false, reason: 'Horizons: Cannot interpret date' });
    expect(parseHorizons('nope')).toMatchObject({ ok: false });
  });

  it('asks for heliocentric ecliptic vectors in AU', () => {
    const u = new URL(horizonsUrl('-31', '1977-09-10', '2027-10-14', '60 d'));
    expect(u.origin + u.pathname).toBe(HORIZONS_API);
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      COMMAND: "'-31'", CENTER: "'500@10'", REF_PLANE: "'ECLIPTIC'", OUT_UNITS: "'AU-D'", VEC_TABLE: "'2'", STEP_SIZE: "'60 d'"
    });
  });
});

// A circular 1 AU orbit sampled every 30 days (about half a radian): a straight line between
// samples would cut 3% inside the circle; the Hermite curve should stay on it.
function circle(stepDays: number, n: number): CraftTrack {
  const w = (2 * Math.PI) / 365.25;
  const p: number[] = [], v: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = w * i * stepDays;
    p.push(Math.cos(a), Math.sin(a), 0);
    v.push(-w * Math.sin(a), w * Math.cos(a), 0);
  }
  return { id: 'voyager-1', source: 'live', fetchedAt: '2026-10-14T00:00:00.000Z', start: '2026-01-01T00:00:00.000Z', stepMs: stepDays * 86_400_000, p, v };
}

describe('craftState', () => {
  const t = circle(30, 10);
  const t0 = Date.parse(t.start);

  it('follows a curved path between samples', () => {
    for (const f of [0.25, 0.5, 4.7, 8.5]) {
      const s = craftState(t, t0 + f * t.stepMs)!;
      expect(Math.hypot(s.pos.x, s.pos.y)).toBeCloseTo(1, 3);
      expect(Math.hypot(s.vel.x, s.vel.y)).toBeCloseTo((2 * Math.PI) / 365.25, 4);
    }
  });

  it('matches the samples exactly and is null outside them', () => {
    expect(craftState(t, t0)!.pos).toEqual({ x: 1, y: 0, z: 0 });
    expect(craftState(t, trackEnd(t))).not.toBeNull();
    expect(craftState(t, t0 - 1)).toBeNull();
    expect(craftState(t, trackEnd(t) + 1)).toBeNull();
  });
});

describe('spacecraft data file', () => {
  it('reads step sizes', () => {
    expect(stepToMs('60 d')).toBe(60 * 86_400_000);
    expect(stepToMs('6 h')).toBe(6 * 3_600_000);
  });

  it('validates tracks', () => {
    const good = { version: 1, generatedAt: '2026-10-14T00:00:00Z', craft: [circle(30, 3)], missing: [] };
    expect(parseSpacecraftData(good)).toMatchObject({ ok: true, data: { craft: [{ id: 'voyager-1' }] } });
    const bad = (mutate: (t: any) => void) => {
      const f = JSON.parse(JSON.stringify(good));
      mutate(f.craft[0]);
      return parseSpacecraftData(f);
    };
    expect(bad((t) => (t.id = 'enterprise'))).toEqual({ ok: false, reason: 'craft[0].id is not a known object' });
    expect(bad((t) => t.v.pop())).toMatchObject({ ok: false });
    expect(bad((t) => (t.p[0] = 'far'))).toEqual({ ok: false, reason: 'craft[0].p has an implausible value' });
  });

  it('fetches each spacecraft, retries a window that runs past the trajectory, and reuses the previous file', async () => {
    const now = () => new Date('2026-10-14T12:00:00Z');
    const prev = { version: 1, generatedAt: '2026-10-14T00:00:00Z', craft: [{ ...circle(30, 3), id: 'juice' }], missing: [] };
    const calls: string[] = [];
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith('spacecraft.json')) return new Response(JSON.stringify(prev));
      const q = new URL(url).searchParams;
      const id = q.get('COMMAND');
      if (id === "'-28'") return new Response('upstream error', { status: 503 });
      if (id === "'-32'" && q.get('STOP_TIME') !== "'2027-03-01'")
        return new Response(JSON.stringify({ result: 'No ephemeris for target "Voyager 2" after A.D. 2027-MAR-01 00:00:00.0000 TDB' }));
      // Any other request gets two samples at its requested step.
      const step = stepToMs(q.get('STEP_SIZE')!.replace(/'/g, ''));
      const jd0 = Date.parse('2026-01-01T00:01:09.184Z') / 86_400_000 + 2440587.5;
      const rows = [0, 1].map((i) => `${jd0 + (i * step) / 86_400_000}, A.D. x, 1, ${i}, 0, 0, 0.01, 0,`);
      return new Response(JSON.stringify({ result: result(rows) }));
    }) as unknown as typeof globalThis.fetch;

    const log = recorder();
    const d = await collectSpacecraft({ fetch, log, now, previousUrl: 'https://example.test/orrery/data/spacecraft.json' });
    expect(d.craft.map((t) => [t.id, t.source])).toEqual(CRAFT.map((c) => [c.id, c.id === 'juice' ? 'previous' : 'live']));
    expect(d.craft.find((t) => t.id === 'juice')?.error).toBe('HTTP 503');
    expect(d.missing).toEqual([]);
    // Titan and Triton come from the same service, centred on their planets.
    expect(d.moons.map((t) => t.id)).toEqual(['titan', 'triton']);
    expect(calls.some((u) => u.includes("COMMAND=%27606%27") && u.includes("CENTER=%27500%40699%27"))).toBe(true);
    expect(calls.some((u) => u.includes("COMMAND=%27801%27") && u.includes("CENTER=%27500%40899%27"))).toBe(true);
    expect(log.lines.some((l) => l.includes('Voyager 2: trajectory ends 2027-03-01; asking again'))).toBe(true);
    expect(parseSpacecraftData(JSON.parse(JSON.stringify(d)))).toEqual({ ok: true, data: d });
  });

  it('makes no requests when offline', async () => {
    const fetch = vi.fn() as unknown as typeof globalThis.fetch;
    const d = await collectSpacecraft({ fetch, log: recorder(), offline: true });
    expect(d.craft).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});
