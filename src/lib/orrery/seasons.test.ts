import { describe, expect, it } from 'vitest';
import type { PlanetId } from './bodies';
import { axialTilt, clearSeasonCache, northSeason, seasons, sunGeometry, sunlight } from './seasons';

const at = (iso: string) => Date.parse(iso);
const J2000 = at('2000-01-01T12:00:00Z');

describe('axialTilt', () => {
  // Published obliquities to the orbit, degrees; checked to ±0.05°.
  it.each<[PlanetId, number]>([
    // Venus and Uranus spin backwards, so their IAU north poles sit 180° minus 177.36° and 97.77°.
    ['mercury', 0.03], ['venus', 2.64], ['earth', 23.44], ['mars', 25.19],
    ['jupiter', 3.13], ['saturn', 26.73], ['uranus', 82.23], ['neptune', 28.32]
  ])('%s is tilted about %s°', (id, expected) => {
    expect(axialTilt(id, J2000)).toBeCloseTo(expected, 1);
  });
});

describe('sunGeometry', () => {
  it('matches Allison & McEwen (2000) for Mars: Ls 341.558° on 25 Aug 2026 12:00 UTC', () => {
    // Curiosity's feed reports Ls 341 for that sol (whole degrees).
    expect(Math.abs(sunGeometry('mars', at('2026-08-25T12:00:00Z')).ls - 341.558)).toBeLessThan(0.02);
  });

  it('puts Earth’s equinoxes and solstices on the right dates', () => {
    // 2026: March equinox 20 Mar 14:46 UTC, June solstice 21 Jun 08:24 UTC. The Sun moves about
    // 0.041° of Ls per hour, so 0.011° is roughly 15 minutes.
    const march = sunGeometry('earth', at('2026-03-20T14:46:00Z')).ls;
    expect(Math.min(march, 360 - march)).toBeLessThan(0.011);
    const june = sunGeometry('earth', at('2026-06-21T08:24:00Z'));
    expect(Math.abs(june.ls - 90)).toBeLessThan(0.011);
    expect(june.subsolarLatitude).toBeCloseTo(23.44, 1);
  });
});

describe('seasons', () => {
  it('reports Earth’s current seasons and the next solstice', () => {
    const s = seasons('earth', at('2026-10-13T12:00:00Z'));
    expect(s.seasonal && [s.north, s.south]).toEqual(['autumn', 'spring']);
    expect(s.seasonal && s.next.name).toBe('northern winter solstice');
    // December solstice 2026: 21 Dec 20:50 UTC.
    expect(s.seasonal && Math.abs(s.next.ms - at('2026-12-21T20:50:00Z'))).toBeLessThan(30 * 60_000);
  });

  it('finds the next Mars equinox after late northern winter', () => {
    const s = seasons('mars', at('2026-08-25T12:00:00Z'));
    expect(s.seasonal && s.north).toBe('winter');
    expect(s.seasonal && s.next.name).toBe('northern spring equinox');
    // Allison & McEwen (2000) put Ls 0 at 2026-09-30 08:21 UTC. Our Ls differs by about 0.01°,
    // which near this point in the orbit is under half an hour.
    expect(s.seasonal && Math.abs(s.next.ms - at('2026-09-30T08:21:00Z'))).toBeLessThan(60 * 60_000);
  });

  it('says Mercury, Venus and Jupiter have almost no seasons', () => {
    for (const id of ['mercury', 'venus', 'jupiter'] as const) expect(seasons(id, J2000).seasonal).toBe(false);
  });

  it('gives Uranus seasons about 21 years long', () => {
    const s = seasons('uranus', J2000);
    expect(s.seasonal && s.seasonDays / 365.25).toBeCloseTo(21, 0);
  });
});

describe('sunlight', () => {
  it('is 1361 W/m² on average at Earth, a little more in January', () => {
    const jan = sunlight('earth', at('2026-01-03T00:00:00Z'));
    expect(jan.now).toBeCloseTo(1408, -1);
    expect(jan.min).toBeCloseTo(1316, -1);
  });

  it('ranges from about 6.3 to 14.5 kW/m² at Mercury and about 1.5 W/m² at Neptune', () => {
    const m = sunlight('mercury', J2000);
    expect(m.min / 1000).toBeCloseTo(6.27, 1);
    // 14.39 with today's 1361 W/m²; older sources say 14.46 because they used 1367.
    expect(m.max / 1000).toBeCloseTo(14.39, 1);
    expect(sunlight('neptune', J2000).now).toBeCloseTo(1.5, 1);
  });
});

describe('northSeason', () => {
  it('agrees with the full season calculation, and is null for planets without seasons', () => {
    const t = at('2026-10-13T12:00:00Z');
    for (const id of ['earth', 'mars', 'saturn', 'uranus', 'neptune'] as const) {
      const full = seasons(id, t);
      expect(northSeason(id, t)).toBe(full.seasonal ? full.north : null);
    }
    expect(northSeason('earth', t)).toBe('autumn');
    expect(northSeason('jupiter', t)).toBe(null);
  });
});

describe('next equinox or solstice cache', () => {
  it('gives the same answers as a fresh search, moving forward and backward in time', () => {
    const start = at('2026-10-13T12:00:00Z');
    const steps = [0, 1, 30, 60, 90, 200, 400, 120, 10, -30, -200, 700].map((d) => start + d * 86_400_000);
    for (const id of ['earth', 'mars', 'saturn'] as const) {
      for (const t of steps) {
        const cached = seasons(id, t);
        clearSeasonCache();
        const fresh = seasons(id, t);
        expect(cached.seasonal && fresh.seasonal && Math.abs(cached.next.ms - fresh.next.ms)).toBeLessThan(120_000);
        expect(cached.seasonal && cached.next.name).toBe(fresh.seasonal && fresh.next.name);
      }
    }
  });
});
