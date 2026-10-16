// What is coming up in the solar system after a given moment: moon phases, eclipses, Earth's
// equinoxes and solstices, planets at opposition, Mercury and Venus at greatest elongation, Mars's
// seasons, the main meteor showers, and spacecraft flybys found in the trajectories on file.
// Everything but the meteor showers is computed (Astronomy Engine, seasons.ts, the spacecraft
// data), so it holds for any date the clock can show.

import {
  Body,
  Illumination,
  NextGlobalSolarEclipse,
  NextLunarEclipse,
  NextMoonQuarter,
  SearchGlobalSolarEclipse,
  SearchLunarEclipse,
  SearchMaxElongation,
  SearchMoonQuarter,
  SearchRelativeLongitude,
  Seasons,
  type GlobalSolarEclipseInfo,
  type LunarEclipseInfo
} from 'astronomy-engine';
import type { SpacecraftData } from '../data/spacecraft-data';
import { craftState } from '../data/spacecraft-data';
import { PLANETS, planetById, type PlanetId } from './bodies';
import { craftById, type WorldId } from './craft';
import { planetPosition } from './ephemeris';
import { distance } from './orbits';
import { km } from '../format';
import { seasons } from './seasons';

export interface SkyEvent {
  ms: number;
  /** "Full moon", "Total solar eclipse", "Jupiter at opposition". */
  title: string;
  /** One line on what it means or where to see it. */
  detail: string;
  /** What to select when the event is picked. */
  focus: WorldId | null;
  kind: 'moon' | 'eclipse' | 'season' | 'planet' | 'meteors' | 'flyby';
  /** True for dates known only to about a day (meteor shower peaks). */
  approximate?: boolean;
}

const DAY_MS = 86_400_000;

const ECLIPSE_WORDS: Record<string, string> = { total: 'Total', annular: 'Annular', partial: 'Partial', penumbral: 'Penumbral', hybrid: 'Hybrid' };

/**
 * Meteor shower peaks (IMO calendar), month and day; they vary by about a day from year to year.
 * `zhr` is the zenithal hourly rate: what one observer would see with the radiant overhead in a
 * perfectly dark sky. Real counts are usually a half or less.
 */
const SHOWERS: { name: string; month: number; day: number; zhr: number; note?: string }[] = [
  { name: 'Quadrantids', month: 1, day: 3, zhr: 80, note: 'best from the north' },
  { name: 'Lyrids', month: 4, day: 22, zhr: 18 },
  { name: 'Eta Aquariids', month: 5, day: 6, zhr: 50, note: 'best from the south' },
  { name: 'Perseids', month: 8, day: 12, zhr: 100 },
  { name: 'Orionids', month: 10, day: 21, zhr: 20 },
  { name: 'Leonids', month: 11, day: 17, zhr: 15 },
  { name: 'Geminids', month: 12, day: 14, zhr: 150, note: 'the year’s best' }
];

/** What the Moon does to a shower: a bright Moon washes out all but the brightest meteors. */
function moonlight(ms: number): string {
  const lit = Illumination(Body.Moon, new Date(ms)).phase_fraction;
  return lit > 0.6 ? ' This year a bright Moon will wash out many of them.' : lit < 0.3 ? ' Little moonlight this year: a good year for it.' : '';
}

const OUTER: PlanetId[] = ['mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
const BODY: Record<PlanetId, Body> = {
  mercury: Body.Mercury, venus: Body.Venus, earth: Body.Earth, mars: Body.Mars,
  jupiter: Body.Jupiter, saturn: Body.Saturn, uranus: Body.Uranus, neptune: Body.Neptune
};

const eclipseDetail = (e: GlobalSolarEclipseInfo) =>
  e.latitude !== undefined && e.longitude !== undefined
    ? `Greatest eclipse at ${Math.abs(e.latitude).toFixed(0)}° ${e.latitude >= 0 ? 'N' : 'S'}, ${Math.abs(e.longitude).toFixed(0)}° ${e.longitude >= 0 ? 'E' : 'W'}.`
    : 'The Moon’s shadow only grazes Earth.';

/** Events from `fromMs` up to `days` later, soonest first. */
export function upcomingEvents(fromMs: number, days = 120, spacecraft: SpacecraftData | null = null): SkyEvent[] {
  const until = fromMs + days * DAY_MS;
  const start = new Date(fromMs);
  const events: SkyEvent[] = [];
  const add = (e: SkyEvent) => {
    if (e.ms >= fromMs && e.ms <= until) events.push(e);
  };

  // Full and new moons.
  for (let q = SearchMoonQuarter(start); q.time.date.getTime() <= until; q = NextMoonQuarter(q)) {
    if (q.quarter === 0) add({ ms: q.time.date.getTime(), title: 'New moon', detail: 'The Moon passes between Earth and the Sun: dark skies for stargazing.', focus: 'earth', kind: 'moon' });
    if (q.quarter === 2) add({ ms: q.time.date.getTime(), title: 'Full moon', detail: 'The Moon is opposite the Sun, lit all over.', focus: 'earth', kind: 'moon' });
  }

  // Eclipses.
  for (let e: LunarEclipseInfo = SearchLunarEclipse(start); e.peak.date.getTime() <= until; e = NextLunarEclipse(e.peak)) {
    add({
      ms: e.peak.date.getTime(), title: `${ECLIPSE_WORDS[e.kind] ?? ''} lunar eclipse`.trim(), focus: 'earth', kind: 'eclipse',
      detail:
        e.kind === 'total' ? 'Earth’s shadow covers the Moon, turning it red; seen from the whole night side.'
        : e.kind === 'partial' ? 'Earth’s shadow falls on part of the Moon; seen from the whole night side.'
        : 'Only Earth’s faint outer shadow touches the Moon: a slight dimming that is hard to notice.'
    });
  }
  for (let e: GlobalSolarEclipseInfo = SearchGlobalSolarEclipse(start); e.peak.date.getTime() <= until; e = NextGlobalSolarEclipse(e.peak)) {
    add({ ms: e.peak.date.getTime(), title: `${ECLIPSE_WORDS[e.kind] ?? ''} solar eclipse`.trim(), detail: eclipseDetail(e), focus: 'earth', kind: 'eclipse' });
  }

  // Earth's equinoxes and solstices.
  for (let y = start.getUTCFullYear(); y <= new Date(until).getUTCFullYear(); y++) {
    const s = Seasons(y);
    add({ ms: s.mar_equinox.date.getTime(), title: 'March equinox', detail: 'Spring begins in the north, autumn in the south.', focus: 'earth', kind: 'season' });
    add({ ms: s.jun_solstice.date.getTime(), title: 'June solstice', detail: 'The longest day in the north, the shortest in the south.', focus: 'earth', kind: 'season' });
    add({ ms: s.sep_equinox.date.getTime(), title: 'September equinox', detail: 'Autumn begins in the north, spring in the south.', focus: 'earth', kind: 'season' });
    add({ ms: s.dec_solstice.date.getTime(), title: 'December solstice', detail: 'The shortest day in the north, the longest in the south.', focus: 'earth', kind: 'season' });
  }

  // Mars's next equinox or solstice (its seasons last about six Earth months).
  const mars = seasons('mars', fromMs);
  if (mars.seasonal) add({ ms: mars.next.ms, title: `Mars: ${mars.next.name.toLowerCase()}`, detail: 'A new season begins on Mars.', focus: 'mars', kind: 'season' });

  // Outer planets at opposition: closest and brightest, up all night.
  for (const id of OUTER) {
    const t = SearchRelativeLongitude(BODY[id], 0, start).date.getTime();
    const d = distance(planetPosition(id, t), planetPosition('earth', t));
    add({
      ms: t, title: `${planetById(id).name} at opposition`, focus: id, kind: 'planet',
      detail: `Opposite the Sun, up all night and near its closest to Earth: ${km(d)}.`
    });
  }

  // Mercury and Venus at greatest elongation: their best views, in the evening or morning sky.
  for (const id of ['mercury', 'venus'] as const) {
    let from = start;
    for (let i = 0; i < 4; i++) {
      const e = SearchMaxElongation(BODY[id], from);
      const t = e.time.date.getTime();
      if (t > until) break;
      add({
        ms: t, title: `${planetById(id).name} at greatest elongation`, focus: id, kind: 'planet',
        detail: `${e.elongation.toFixed(0)}° from the Sun in the ${e.visibility} sky: about as far from the Sun’s glare as it gets.`
      });
      from = new Date(t + DAY_MS);
    }
  }

  // Meteor shower peaks.
  for (let y = start.getUTCFullYear(); y <= new Date(until).getUTCFullYear(); y++) {
    for (const s of SHOWERS) {
      const ms = Date.UTC(y, s.month - 1, s.day);
      const detail = `Up to about ${s.zhr} an hour in a perfectly dark sky${s.note ? `, ${s.note}` : ''}; expect fewer. Best after midnight away from city lights.${moonlight(ms)}`;
      add({ ms, title: `${s.name} meteor shower`, detail, focus: 'earth', kind: 'meteors', approximate: true });
    }
  }

  // Spacecraft flybys: the closest approach to a planet within 0.02 AU (3 million km) in the data.
  // Not in a track's first weeks, when a craft is still leaving Earth after launch.
  if (spacecraft) {
    for (const t of spacecraft.craft) {
      const early = Date.parse(craftById(t.id).launched) + 30 * DAY_MS;
      for (const p of PLANETS) {
        const f = closestApproach(t, p.id as PlanetId, Math.max(fromMs, early), until);
        if (f) {
          add({
            ms: f.ms, title: `${craftById(t.id).name} flies past ${p.name}`, focus: t.id, kind: 'flyby',
            // The trajectory here is sampled daily, too coarse for the true closest distance (often a
            // few thousand km), so give only the date.
            detail: 'A close pass by the planet, whose gravity bends the spacecraft’s path.'
          });
        }
      }
    }
  }

  return events.sort((a, b) => a.ms - b.ms);
}

/** Closest approach of a spacecraft to a planet, if within 0.02 AU, by scanning then refining. */
function closestApproach(track: SpacecraftData['craft'][number], planet: PlanetId, from: number, until: number) {
  const gap = (ms: number) => {
    const s = craftState(track, ms);
    return s ? distance(s.pos, planetPosition(planet, ms)) : Infinity;
  };
  let best = { ms: 0, d: Infinity };
  for (let ms = from; ms <= until; ms += DAY_MS / 2) {
    const d = gap(ms);
    if (d < best.d) best = { ms, d };
  }
  if (best.d > 0.05) return null;
  // Golden-section search for the minimum within a day either side.
  let a = best.ms - DAY_MS, b = best.ms + DAY_MS;
  for (let i = 0; i < 40; i++) {
    const m1 = b - (b - a) / 1.618, m2 = a + (b - a) / 1.618;
    if (gap(m1) < gap(m2)) b = m2;
    else a = m1;
  }
  const ms = (a + b) / 2, d = gap(ms);
  return d <= 0.02 && ms >= from && ms <= until ? { ms } : null;
}
