import { describe, expect, it } from 'vitest';
import type { Logger } from './fetch-json';
import { auroraWords, kpWords, stormLevel, summarizeKp } from './kp';

function recorder(): Logger & { lines: string[] } {
  const lines: string[] = [];
  const push = (...args: unknown[]) => lines.push(args.map(String).join(' '));
  return { lines, info: push, warn: push };
}

const NOW = Date.parse('2026-10-14T13:00:00Z');
// Constructed samples in the two shapes NOAA has used for this product (see kp.ts); not real data.
const HEADER = ['time_tag', 'Kp', 'a_running', 'station_count'];
const ROWS = [
  HEADER,
  ['2026-10-13 06:00:00.000', '2.33', '9', '8'],
  ['2026-10-13 09:00:00.000', '5.33', '56', '8'],
  ['2026-10-14 06:00:00.000', '3.00', '15', '8'],
  ['2026-10-14 09:00:00.000', '3.67', '22', '8']
];
const OBJECTS = ROWS.slice(1).map(([time_tag, Kp]) => ({ time_tag, Kp: Number(Kp), a_running: 9, station_count: 8 }));

describe('summarizeKp', () => {
  it.each([
    ['rows with a header', ROWS],
    ['objects', OBJECTS]
  ])('reads %s', (shape, body) => {
    const log = recorder();
    const r = summarizeKp(body, log, { now: NOW });
    expect(r).toEqual({
      ok: true,
      summary: {
        latest: { time: '2026-10-14T09:00:00.000Z', kp: 3.67 },
        series: [
          { time: '2026-10-13T06:00:00.000Z', kp: 2.33 },
          { time: '2026-10-13T09:00:00.000Z', kp: 5.33 },
          { time: '2026-10-14T06:00:00.000Z', kp: 3 },
          { time: '2026-10-14T09:00:00.000Z', kp: 3.67 }
        ]
      }
    });
    expect(log.lines[0]).toContain(shape);
  });

  it('keeps only the last three days', () => {
    const r = summarizeKp([HEADER, ['2026-10-10 06:00:00.000', '1'], ...ROWS.slice(1)], recorder(), { now: NOW });
    expect(r.ok && r.summary.series.map((p) => p.time)).not.toContain('2026-10-10T06:00:00.000Z');
  });

  it('rejects a feed whose newest value is too old', () => {
    const r = summarizeKp(ROWS, recorder(), { now: Date.parse('2026-10-15T09:00:00Z') });
    expect(r).toMatchObject({ ok: false, reason: expect.stringContaining('h old') });
  });

  it('skips values in the future or off the 0–9 scale', () => {
    const body = [HEADER, ['2026-10-14 09:00:00.000', '3.67'], ['2026-10-14 12:00:00.000', '-1'], ['2026-10-15 00:00:00.000', '4']];
    const r = summarizeKp(body, recorder(), { now: NOW });
    expect(r.ok && r.summary.latest).toEqual({ time: '2026-10-14T09:00:00.000Z', kp: 3.67 });
  });

  it('explains a feed it cannot read', () => {
    expect(summarizeKp({}, recorder())).toEqual({ ok: false, reason: 'response is not a JSON array' });
    expect(summarizeKp([['date', 'value']], recorder())).toMatchObject({ ok: false, reason: expect.stringContaining('no time_tag and Kp columns') });
    expect(summarizeKp([{ when: 'x' }], recorder())).toMatchObject({ ok: false, reason: expect.stringContaining('none of the 1 entries') });
  });
});

describe('Kp in words', () => {
  it('follows NOAA’s storm scale', () => {
    expect([4.67, 5, 5.67, 6, 7, 8, 9].map(stormLevel)).toEqual([0, 1, 1, 2, 3, 4, 5]);
    expect(kpWords(1)).toBe('Quiet');
    expect(kpWords(3.33)).toBe('Unsettled');
    expect(kpWords(4.33)).toBe('Active');
    expect(kpWords(6.33)).toBe('G2 moderate storm');
  });

  it('says where auroras may reach', () => {
    expect(auroraWords(2)).toContain('polar regions');
    expect(auroraWords(5.33)).toContain('Scotland');
    expect(auroraWords(8)).toContain('far from the poles');
  });
});
