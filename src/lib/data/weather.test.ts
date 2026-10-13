import { describe, expect, it, vi } from 'vitest';
import sample from './fixtures/rems-sample.json';
import { STORED_MARS_REPORT } from './mars-report';
import { parseSol } from './rems';
import { fetchLatestMarsReport, type Logger } from './weather';

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });

function recorder(): Logger & { lines: string[] } {
  const lines: string[] = [];
  const push = (...args: unknown[]) => lines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  return { lines, info: push, warn: push };
}

describe('parseSol', () => {
  it('converts the feed strings to numbers and keeps text fields', () => {
    const r = parseSol(sample.soles[0]);
    expect(r).toEqual({
      ok: true,
      missing: [],
      report: {
        sol: 4995, earthDate: '2026-08-25', ls: 341, month: 12, minTemp: -78, maxTemp: -4,
        pressure: 862, sunrise: '05:35', sunset: '17:41', opacity: 'Sunny'
      }
    });
  });

  it('treats "--" as a missing reading and lists what is missing', () => {
    const r = parseSol(sample.soles[1]);
    expect(r.ok && r.report.minTemp).toBe(null);
    expect(r.ok && r.missing).toEqual(['min_temp', 'max_temp', 'pressure', 'atmo_opacity']);
  });

  it('rejects entries without a usable sol or date', () => {
    expect(parseSol({ sol: '--', terrestrial_date: '2026-08-25' })).toMatchObject({ ok: false });
    expect(parseSol({ sol: '4995', terrestrial_date: 'Aug 25' })).toMatchObject({ ok: false });
    expect(parseSol({ sol: '49.5', terrestrial_date: '2026-08-25' })).toMatchObject({ ok: false });
  });
});

describe('fetchLatestMarsReport', () => {
  it('returns the newest valid sol and logs each step', async () => {
    const log = recorder();
    const reversed = { soles: [...sample.soles].reverse() };
    const result = await fetchLatestMarsReport({ fetch: vi.fn(async () => json(reversed)), log });

    expect(result.source).toBe('live');
    expect(result.report.sol).toBe(4995);
    expect(log.lines[0]).toMatch(/^\[weather\] GET https:\/\/mars\.nasa\.gov/);
    expect(log.lines.some((l) => l.includes('HTTP 200'))).toBe(true);
    expect(log.lines.some((l) => l.includes('2 sols in feed'))).toBe(true);
    expect(log.lines.at(-1)).toMatch(/live report: sol 4995/);
  });

  it('skips invalid entries and logs why', async () => {
    const log = recorder();
    const body = { soles: [{ sol: '5000', terrestrial_date: '' }, sample.soles[0]] };
    const result = await fetchLatestMarsReport({ fetch: async () => json(body), log });
    expect(result.report.sol).toBe(4995);
    expect(log.lines.some((l) => l.includes('skipping entry: invalid terrestrial_date'))).toBe(true);
  });

  it.each([
    ['a network or CORS failure', async () => { throw new TypeError('Failed to fetch'); }, /blocked by CORS or the network/],
    ['an HTTP error', async () => json({}, { status: 503 }), /HTTP 503/],
    ['a non-JSON body', async () => new Response('<html>', { status: 200 }), /not JSON/],
    ['an unexpected shape', async () => json({ data: [] }), /no "soles" array \(keys: data\)/],
    ['no valid entries', async () => json({ soles: [{ sol: 'x' }] }), /none of the 1 entries/]
  ])('falls back to the stored report on %s', async (_, fakeFetch, reason) => {
    const log = recorder();
    const result = await fetchLatestMarsReport({ fetch: fakeFetch as typeof fetch, log });
    expect(result).toMatchObject({ source: 'stored', report: STORED_MARS_REPORT });
    expect(result.source === 'stored' && result.reason).toMatch(reason);
    expect(log.lines.at(-1)).toMatch(/\[weather\] using stored report/);
  });

  it('gives up after the timeout', async () => {
    const hang: typeof fetch = (_, init) =>
      new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    const result = await fetchLatestMarsReport({ fetch: hang, log: recorder(), timeoutMs: 20 });
    expect(result.source === 'stored' && result.reason).toBe('timed out after 20 ms');
  });
});
