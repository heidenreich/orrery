import { describe, expect, it } from 'vitest';
import { upcomingEvents } from './events';

const at = (iso: string) => Date.parse(iso);
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const find = (from: string, days: number, title: string) => upcomingEvents(at(from), days).filter((e) => e.title === title).map((e) => dayOf(e.ms));

// Dates from published almanacs (NASA eclipse catalogue, USNO phases, oppositions as widely listed).
describe('upcoming events', () => {
  it('finds 2026’s eclipses', () => {
    expect(find('2026-01-01T00:00Z', 365, 'Annular solar eclipse')).toEqual(['2026-02-17']);
    expect(find('2026-01-01T00:00Z', 365, 'Total solar eclipse')).toEqual(['2026-08-12']);
    expect(find('2026-01-01T00:00Z', 365, 'Total lunar eclipse')).toEqual(['2026-03-03']);
    expect(find('2026-01-01T00:00Z', 365, 'Partial lunar eclipse')).toEqual(['2026-08-28']);
  });

  it('finds oppositions', () => {
    expect(find('2026-01-01T00:00Z', 30, 'Jupiter at opposition')).toEqual(['2026-01-10']);
    expect(find('2026-09-01T00:00Z', 60, 'Saturn at opposition')).toEqual(['2026-10-04']);
    expect(find('2026-12-01T00:00Z', 120, 'Mars at opposition')).toEqual(['2027-02-19']);
  });

  it('finds Earth’s seasons and moon phases', () => {
    expect(find('2026-12-01T00:00Z', 40, 'December solstice')).toEqual(['2026-12-21']);
    expect(find('2026-10-01T00:00Z', 31, 'Full moon')).toEqual(['2026-10-26']);
    expect(find('2026-10-01T00:00Z', 31, 'New moon')).toEqual(['2026-10-10']);
  });

  it('lists meteor showers as approximate', () => {
    const g = upcomingEvents(at('2026-12-01T00:00Z'), 30).find((e) => e.title === 'Geminids meteor shower');
    expect(g && dayOf(g.ms)).toBe('2026-12-14');
    expect(g?.approximate).toBe(true);
  });

  it('returns events in order, inside the window', () => {
    const from = at('2026-10-15T00:00Z');
    const e = upcomingEvents(from, 90);
    expect(e.length).toBeGreaterThan(8);
    expect(e.map((x) => x.ms)).toEqual([...e.map((x) => x.ms)].sort((a, b) => a - b));
    expect(e.every((x) => x.ms >= from && x.ms <= from + 90 * 86_400_000)).toBe(true);
  });
});

describe('spacecraft flybys', () => {
  it('finds a constructed spacecraft passing Earth', async () => {
    const { planetPosition } = await import('./ephemeris');
    // Constructed track: sits where Earth will be on 1 Dec 2026, 0.001 AU out, for a few days.
    const DAY = 86_400_000, t0 = at('2026-11-28T00:00Z');
    const p: number[] = [], v: number[] = [];
    for (let i = 0; i <= 8; i++) {
      const e = planetPosition('earth', t0 + i * DAY);
      const off = 0.001 + Math.abs(i - 3) * 0.004; // closest on day 3
      p.push(e.x + off, e.y, e.z);
      // Earth's own velocity (AU/day, by finite difference) plus the offset's change.
      const n = planetPosition('earth', t0 + i * DAY + 3_600_000);
      v.push((n.x - e.x) * 24 + (i < 3 ? -0.004 : 0.004), (n.y - e.y) * 24, (n.z - e.z) * 24);
    }
    const data = { version: 1 as const, generatedAt: '', missing: [], moons: [], craft: [{ id: 'europa-clipper' as const, source: 'live' as const, fetchedAt: '', start: new Date(t0).toISOString(), stepMs: DAY, p, v }] };
    const f = upcomingEvents(at('2026-11-20T00:00Z'), 30, data).filter((e) => e.kind === 'flyby');
    expect(f.map((e) => e.title)).toEqual(['Europa Clipper flies past Earth']);
    // Closest at 1 Dec 00:00 in the samples; the search finds it to within half a day.
    expect(Math.abs(f[0].ms - at('2026-12-01T00:00Z'))).toBeLessThan(12 * 3_600_000);
    expect(f[0].focus).toBe('europa-clipper');
  });
});

describe('moon phase names', () => {
  it('names the phase from the Moon’s angle from the Sun', async () => {
    const { moonPhaseName } = await import('./today');
    expect([0, 45, 90, 135, 180, 225, 270, 315, 355].map(moonPhaseName)).toEqual([
      'New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent', 'New moon'
    ]);
  });
});
