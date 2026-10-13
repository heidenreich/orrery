import { describe, expect, it } from 'vitest';
import { PLANETS, type PlanetId } from './bodies';
import { planetPosition } from './ephemeris';
import { distance, length, orbitShape, type Vec3 } from './orbits';
import { SIM_MAX_MS, SIM_MIN_MS } from './time';

const at = (iso: string) => Date.parse(iso);
const lon = (p: Vec3) => (Math.atan2(p.y, p.x) * 180) / Math.PI;
const angle = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

describe('planet positions', () => {
  it('puts Earth at perihelion (0.9833 AU) on 3 Jan 2026 and aphelion (1.0166 AU) on 6 Jul 2026', () => {
    expect(length(planetPosition('earth', at('2026-01-03T17:00Z')))).toBeCloseTo(0.9833, 4);
    expect(length(planetPosition('earth', at('2026-07-06T18:00Z')))).toBeCloseTo(1.0166, 4);
  });

  it('matches the Mars close approach of 12 Jan 2025 (0.642 AU, 96 million km)', () => {
    const t = at('2025-01-12T12:00Z');
    expect(distance(planetPosition('earth', t), planetPosition('mars', t))).toBeCloseTo(0.642, 3);
  });

  // At opposition the planet and Earth share a heliocentric longitude. A wrong frame or epoch
  // shows up here as an offset of a degree or more.
  it.each([
    ['mars', '2025-01-16T02:00Z'],
    ['jupiter', '2026-01-10T08:00Z'],
    ['saturn', '2026-10-04T12:00Z']
  ] as [PlanetId, string][])('puts %s at opposition on %s', (id, iso) => {
    expect(angle(lon(planetPosition(id, at(iso))), lon(planetPosition('earth', at(iso))))).toBeLessThan(0.3);
  });
});

// The orbit lines are drawn from JPL's mean elements; the planets should sit on them on every
// date the clock allows, not just in JPL's 1800–2050 window.
describe('planets stay on their drawn orbits', () => {
  const years = Array.from({ length: 21 }, (_, i) => SIM_MIN_MS + (i / 20) * (SIM_MAX_MS - SIM_MIN_MS));

  it.each(PLANETS.map((p) => p))('$name', (p) => {
    for (const ms of years) {
      const pos = planetPosition(p.id as PlanetId, ms);
      const { a, e, normal } = orbitShape(p, ms);
      const r = length(pos);
      // Measured: under 0.03° off the plane and 0.6% outside the distance range (Saturn).
      expect(Math.abs(pos.x * normal.x + pos.y * normal.y + pos.z * normal.z) / r).toBeLessThan(Math.sin((0.1 * Math.PI) / 180));
      expect(r).toBeGreaterThan(a * (1 - e) * 0.99);
      expect(r).toBeLessThan(a * (1 + e) * 1.01);
    }
  });
});
