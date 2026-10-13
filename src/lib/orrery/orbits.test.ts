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
  it('agrees with Curiosity sol numbering (landing ≈ MSD 49269)', () => {
    // Curiosity reported sol 4995 on 2026-08-25.
    const sol = Math.floor(marsSolDate(at('2026-08-25T12:00:00Z'))) - 49269;
    expect(Math.abs(sol - 4995)).toBeLessThanOrEqual(1);
  });
});
