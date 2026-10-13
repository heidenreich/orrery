import { describe, expect, it } from 'vitest';
import type { PlanetId } from './bodies';
import { axialTilt, seasons, sunGeometry, sunlight } from './seasons';

const at = (iso: string) => Date.parse(iso);
const J2000 = at('2000-01-01T12:00:00Z');

describe('axialTilt', () => {
  // Published obliquities to the orbit, degrees.
  it.each<[PlanetId, number]>([
    // Venus and Uranus spin backwards, so their IAU north poles sit 180° minus 177.36° and 97.77°.
    ['mercury', 0.03], ['venus', 2.64], ['earth', 23.44], ['mars', 25.19],
    ['jupiter', 3.13], ['saturn', 26.73], ['uranus', 82.23], ['neptune', 28.32]
  ])('%s is tilted about %s°', (id, expected) => {
    expect(axialTilt(id, J2000)).toBeCloseTo(expected, 0);
  });
});

describe('sunGeometry', () => {
  it('matches the Ls that Curiosity reported for sol 4995 (25 Aug 2026, Ls 341)', () => {
    // Allison & McEwen (2000) give Ls 341.6° at 12:00 UTC; the feed rounds to whole degrees.
    expect(sunGeometry('mars', at('2026-08-25T12:00:00Z')).ls).toBeCloseTo(341.6, 0);
  });

  it('puts Earth’s equinoxes and solstices on the right dates', () => {
    // 2026: March equinox 20 Mar 14:46 UTC, June solstice 21 Jun 08:24 UTC.
    const march = sunGeometry('earth', at('2026-03-20T14:46:00Z')).ls;
    expect(Math.min(march, 360 - march)).toBeLessThan(0.1);
    const june = sunGeometry('earth', at('2026-06-21T08:24:00Z'));
    expect(june.ls).toBeCloseTo(90, 0);
    expect(june.subsolarLatitude).toBeCloseTo(23.44, 1);
  });
});

describe('seasons', () => {
  it('reports Earth’s current seasons and the next solstice', () => {
    const s = seasons('earth', at('2026-10-13T12:00:00Z'));
    expect(s.seasonal && [s.north, s.south]).toEqual(['autumn', 'spring']);
    expect(s.seasonal && s.next.name).toBe('northern winter solstice');
    // December solstice 2026: 21 Dec 20:50 UTC. Our elements ignore precession, so allow a day.
    expect(s.seasonal && Math.abs(s.next.ms - at('2026-12-21T20:50:00Z'))).toBeLessThan(86_400_000);
  });

  it('finds the next Mars equinox after late northern winter', () => {
    const s = seasons('mars', at('2026-08-25T12:00:00Z'));
    expect(s.seasonal && s.north).toBe('winter');
    expect(s.seasonal && s.next.name).toBe('northern spring equinox');
    // Ls 341 → 360 is about 19° of orbit, roughly five weeks near perihelion-to-aphelion transition.
    const days = s.seasonal ? (s.next.ms - at('2026-08-25T12:00:00Z')) / 86_400_000 : 0;
    expect(days).toBeGreaterThan(25);
    expect(days).toBeLessThan(45);
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
