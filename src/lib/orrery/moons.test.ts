import { describe, expect, it } from 'vitest';
import { planetById } from './bodies';
import { computedMoonOffsets, displayRadius, MOONS, moonById } from './moons';
import { length } from './orbits';

const AU_KM = 149_597_870.7;
const at = (iso: string) => Date.parse(iso);

describe('moon positions', () => {
  it('keeps each computed moon near its mean distance', () => {
    for (const iso of ['2026-01-01T00:00Z', '2026-10-14T12:00Z', '2030-06-01T00:00Z']) {
      const o = computedMoonOffsets(at(iso));
      for (const [id, v] of Object.entries(o)) {
        const km = length(v!) * AU_KM;
        // The Moon's orbit is eccentric (363,000–406,000 km); the Galilean moons' are nearly circular.
        expect(km / moonById(id as never).distanceKm, `${id} ${iso}`).toBeGreaterThan(0.93);
        expect(km / moonById(id as never).distanceKm, `${id} ${iso}`).toBeLessThan(1.07);
      }
    }
  });

  // New moon: the Moon lies between Earth and the Sun. 21 Sep 2025 19:54 UTC was a new moon
  // (with a partial solar eclipse), so the Moon's direction from Earth points sunward.
  it('puts the Moon sunward of Earth at new moon', async () => {
    const { planetPosition } = await import('./ephemeris');
    const t = at('2025-09-21T19:54Z');
    const m = computedMoonOffsets(t).moon!;
    const e = planetPosition('earth', t);
    const cos = -(m.x * e.x + m.y * e.y + m.z * e.z) / (length(m) * length(e));
    expect(cos).toBeGreaterThan(0.999); // within about 2.5°
  });

  it('draws moons in their real order outward, at compressed distances', () => {
    const r = (id: string) => displayRadius(moonById(id as never), planetById(moonById(id as never).parent).radiusKm);
    expect(r('io')).toBeLessThan(r('europa'));
    expect(r('europa')).toBeLessThan(r('ganymede'));
    expect(r('ganymede')).toBeLessThan(r('callisto'));
    for (const m of MOONS) expect(r(m.id), m.id).toBeGreaterThan(2.5);
    expect(r('moon')).toBeLessThan(5);
  });
});
