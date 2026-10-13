import { describe, expect, it } from 'vitest';
import { marsSolDate } from './orbits';

const at = (iso: string) => Date.parse(iso);

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
