import { describe, expect, it } from 'vitest';
import { planetById } from './bodies';
import { distance, heliocentric, length, marsSolDate } from './orbits';

const earth = planetById('earth');
const mars = planetById('mars');
const at = (iso: string) => Date.parse(iso);

describe('heliocentric positions', () => {
  it('keeps Earth near 1 AU from the Sun', () => {
    for (const d of ['2000-01-01', '2026-01-03', '2026-07-04']) {
      expect(length(heliocentric(earth, at(d)))).toBeGreaterThan(0.98);
      expect(length(heliocentric(earth, at(d)))).toBeLessThan(1.02);
    }
  });

  it('puts Earth at perihelion in early January and aphelion in early July', () => {
    expect(length(heliocentric(earth, at('2026-01-03')))).toBeCloseTo(0.983, 2);
    expect(length(heliocentric(earth, at('2026-07-06')))).toBeCloseTo(1.017, 2);
  });

  it('matches the Mars close approach of 12 Jan 2025 (0.642 AU, 96 million km)', () => {
    const d = distance(heliocentric(earth, at('2025-01-12')), heliocentric(mars, at('2025-01-12')));
    expect(d).toBeCloseTo(0.642, 2);
  });
});

describe('marsSolDate', () => {
  // Curiosity counts sols in Gale Crater's local time (137.4° E), with landing on sol 0 at about
  // MSD 49269.25. It reported sol 4995 for 25 Aug 2026.
  const galeSol = (ms: number) => Math.floor(marsSolDate(ms) + 137.4 / 360) - 49269;

  it('agrees with Curiosity sol numbering', () => {
    expect(galeSol(at('2026-08-25T00:00:00Z'))).toBe(4995);
    expect(galeSol(at('2026-08-25T12:00:00Z'))).toBe(4995);
  });

  it('puts the Curiosity landing (6 Aug 2012, 05:17 UTC) mid-afternoon on sol 0 at Gale', () => {
    const msd = marsSolDate(at('2012-08-06T05:17:57Z'));
    expect(galeSol(at('2012-08-06T05:17:57Z'))).toBe(0);
    // Landing was about 15:00 local mean solar time.
    const localHours = ((msd + 137.4 / 360) % 1) * 24;
    expect(localHours).toBeGreaterThan(14.5);
    expect(localHours).toBeLessThan(15.5);
  });
});
