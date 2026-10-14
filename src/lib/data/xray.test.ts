import { describe, expect, it } from 'vitest';
import type { Logger } from './fetch-json';
import { flareClass, flareWords, radioBlackout, summarizeXray } from './xray';

function recorder(): Logger & { lines: string[] } {
  const lines: string[] = [];
  const push = (...args: unknown[]) => lines.push(args.map(String).join(' '));
  return { lines, info: push, warn: push };
}

const NOW = Date.parse('2026-10-14T12:00:00Z');
// Constructed records in the feed's shape (see xray.ts); not real data. Each minute has a long-
// and a short-wave record; the short-wave values are much higher here so using them by mistake shows.
const minute = (iso: string, long: number) => [
  { time_tag: iso, satellite: 19, flux: long, observed_flux: long, electron_correction: 0, electron_contaminaton: false, energy: '0.1-0.8nm' },
  { time_tag: iso, satellite: 19, flux: long * 50, observed_flux: long * 50, electron_correction: 0, electron_contaminaton: false, energy: '0.05-0.4nm' }
];
const SAMPLE = [
  ...minute('2026-10-13T10:00:00Z', 9e-7), // more than 24 h before the newest: outside the window
  ...minute('2026-10-14T08:00:00Z', 2.1e-6),
  ...minute('2026-10-14T08:05:00Z', 3.4e-5), // an M3.4 flare
  ...minute('2026-10-14T08:06:00Z', 2.2e-5),
  ...minute('2026-10-14T11:00:00Z', -99999), // a missing reading
  ...minute('2026-10-14T11:58:00Z', 1.45e-6)
];

describe('summarizeXray', () => {
  it('reads the long-wave channel, its peak and a 10-minute series', () => {
    const log = recorder();
    const r = summarizeXray(SAMPLE, log, { now: NOW });
    expect(r).toEqual({
      ok: true,
      summary: {
        latest: { time: '2026-10-14T11:58:00.000Z', flux: 1.45e-6, satellite: '19' },
        peak: { time: '2026-10-14T08:05:00.000Z', flux: 3.4e-5 },
        series: [
          { time: '2026-10-14T08:05:00.000Z', flux: 3.4e-5 },
          { time: '2026-10-14T11:58:00.000Z', flux: 1.45e-6 }
        ]
      }
    });
    expect(log.lines[0]).toContain('"0.1-0.8nm":6');
    expect(log.lines[1]).toContain('24 h peak M3.4');
  });

  it('rejects a feed whose newest reading is too old', () => {
    expect(summarizeXray(SAMPLE, recorder(), { now: Date.parse('2026-10-14T16:00:00Z') })).toMatchObject({
      ok: false,
      reason: expect.stringContaining('h old')
    });
  });

  it('explains a feed it cannot read', () => {
    expect(summarizeXray({}, recorder())).toEqual({ ok: false, reason: 'response is not a JSON array' });
    expect(summarizeXray([{ time_tag: '2026-10-14T11:58:00Z', flux: 1e-6, energy: '0.05-0.4nm' }], recorder(), { now: NOW })).toMatchObject({
      ok: false,
      reason: expect.stringContaining('0.1–0.8 nm')
    });
  });
});

describe('flare classes', () => {
  it('names the flux the way NOAA does', () => {
    expect(flareClass(5e-9)).toBe('A0.5');
    expect(flareClass(3e-6)).toBe('C3.0');
    expect(flareClass(9.99e-6)).toBe('C9.9');
    expect(flareClass(1e-5)).toBe('M1.0');
    expect(flareClass(3.4e-5)).toBe('M3.4');
    expect(flareClass(2.3e-4)).toBe('X2.3');
    expect(flareClass(1.2e-3)).toBe('X12.0');
  });

  it('follows NOAA’s radio blackout scale', () => {
    expect([9e-6, 1e-5, 5e-5, 1e-4, 1e-3, 2e-3].map(radioBlackout)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('describes the level', () => {
    expect(flareWords(5e-7)).toBe('Quiet');
    expect(flareWords(2e-6)).toContain('C-class');
    expect(flareWords(3e-5)).toContain('M-class');
    expect(flareWords(2e-4)).toContain('X-class');
  });
});
