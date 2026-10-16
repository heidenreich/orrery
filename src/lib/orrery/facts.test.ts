import { describe, expect, it } from 'vitest';
import { ALL_BODIES } from './bodies';
import { FACTS, gravityText, massText } from './facts';

describe('body facts', () => {
  it('covers every body', () => {
    for (const b of ALL_BODIES) expect(FACTS[b.id], b.id).toBeDefined();
  });

  it('formats mass relative to Earth', () => {
    expect(massText(0.0553)).toBe('0.055 × Earth');
    expect(massText(317.8)).toBe('318 × Earth');
    expect(massText(333_000)).toBe('333,000 × Earth');
    expect(massText(1)).toBe('5.97 × 10²⁴ kg');
  });

  it('formats gravity relative to Earth', () => {
    expect(gravityText(3.7)).toBe('3.7 m/s² · 0.38× Earth’s');
    expect(gravityText(23.1)).toBe('23.1 m/s² · 2.35× Earth’s');
    expect(gravityText(274)).toBe('274 m/s² · 28× Earth’s');
    expect(gravityText(9.0)).toBe('9.0 m/s² · 0.92× Earth’s');
    expect(gravityText(9.8)).toBe('9.8 m/s²');
  });

  // Surface gravity follows from mass and radius (g = GM/r²); a typo in either would show here.
  // NASA gives the giants' gravity at the equator, where they bulge and their fast spin offsets
  // some of it, so those use the equatorial radius (km) and rotation period (hours).
  const EQUATOR: Record<string, [number, number]> = {
    jupiter: [71_492, 9.925], saturn: [60_268, 10.656], uranus: [25_559, 17.24], neptune: [24_764, 16.11]
  };

  it('has gravity consistent with mass and radius', () => {
    for (const b of ALL_BODIES) {
      const f = FACTS[b.id];
      const [rKm, hours] = EQUATOR[b.id] ?? [b.radiusKm, Infinity];
      const r = rKm * 1000, spin = (2 * Math.PI) / (hours * 3600);
      const g = (6.674e-11 * f.massEarths * 5.972e24) / r ** 2 - spin ** 2 * r;
      expect(Math.abs(g - f.gravity) / f.gravity, b.id).toBeLessThan(0.05);
      const escape = Math.sqrt((2 * 6.674e-11 * f.massEarths * 5.972e24) / r) / 1000;
      expect(Math.abs(escape - f.escapeKms) / f.escapeKms, `${b.id} escape`).toBeLessThan(0.03);
    }
  });
});
