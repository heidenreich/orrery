import { describe, expect, it } from 'vitest';
import { brightness, compass, height, isPlace, parseCoordinate, roundPlace, sunLimit, tonightSky, whenAndWhere } from './tonight';

const LONDON = { latitude: 51.5, longitude: -0.1 };

const hhmm = (ms: number) => new Date(ms).toISOString().slice(11, 16);

describe('tonightSky', () => {
  // Saturn was at opposition on 4 October 2026, so ten days later it is up all evening and highest
  // in the south around midnight; Jupiter and Mars are in the morning sky.
  const sky = tonightSky(Date.parse('2026-10-15T12:00Z'), LONDON);
  const by = (name: string) => [...sky.visible, ...sky.optics].find((o) => o.name === name);

  it('finds the dark window from civil dusk to dawn', () => {
    // London sunset about 17:05 UTC on 15 October; civil dusk about 35 minutes later.
    expect(new Date(sky.dark!.from).toISOString()).toMatch(/^2026-10-15T17:[34]/);
    expect(new Date(sky.dark!.to).toISOString()).toMatch(/^2026-10-16T05:[45]/);
  });

  it('puts Saturn in the south around midnight', () => {
    const s = by('Saturn')!;
    expect(compass(s.best.azimuth)).toBe('south');
    expect(s.best.altitude).toBeGreaterThan(30);
    expect(s.best.altitude).toBeLessThan(45);
    expect(s.from).toBeLessThan(Date.parse('2026-10-15T19:00Z'));
  });

  it('has Jupiter and Mars only after midnight', () => {
    expect(by('Jupiter')!.from).toBeGreaterThan(Date.parse('2026-10-16T00:00Z'));
    expect(by('Mars')!.from).toBeGreaterThan(Date.parse('2026-10-15T23:00Z'));
    expect(by('Jupiter')!.magnitude).toBeLessThan(-1.5);
  });

  it('says when and where to look in words', () => {
    expect(whenAndWhere(by('Saturn')!, hhmm, sky)).toMatch(/^Visible from nightfall to 0[34]:\d0; highest around 2[23]:\d0, halfway up in the south\.$/);
    // Jupiter rises after midnight and is still climbing when dawn hides it.
    expect(whenAndWhere(by('Jupiter')!, hhmm, sky)).toMatch(/^Visible from 0[12]:\d0 until dawn; highest before dawn, halfway up in the south-east\.$/);
  });

  it('needs a darker sky for fainter planets', () => {
    expect(sunLimit(-4)).toBe(-6);
    expect(sunLimit(0.5)).toBe(-9);
    expect(sunLimit(5.7)).toBe(-18);
    // Saturn (magnitude 0.3) shows in nautical twilight; Uranus waits for full darkness.
    expect(by('Uranus')!.from).toBeGreaterThan(by('Saturn')!.from + 3_600_000);
  });

  it('puts Uranus and Neptune in the binoculars list, not the naked-eye one', () => {
    expect(sky.optics.map((o) => o.name)).toEqual(['Uranus', 'Neptune']);
    expect(sky.visible.map((o) => o.name)).not.toContain('Uranus');
  });

  it('gives the Moon as it will be at dusk', () => {
    const noon = tonightSky(Date.parse('2026-10-15T12:00Z'), LONDON).moon.lit;
    const dusk = tonightSky(Date.parse('2026-10-15T17:42Z'), LONDON).moon.lit;
    expect(Math.abs(noon - dusk)).toBeLessThanOrEqual(1);
  });

  it('lists planets lost in the Sun’s glare as hidden', () => {
    expect(sky.hidden).toContain('Venus');
    expect(by('Neptune')!.needsOptics).toBe(true);
    expect(by('Saturn')!.needsOptics).toBe(false);
  });

  it('starts from now when it is already dark', () => {
    const late = tonightSky(Date.parse('2026-10-15T23:00Z'), LONDON);
    expect(late.dark!.from).toBe(Date.parse('2026-10-15T23:00Z'));
    expect(late.dark!.to).toBe(sky.dark!.to);
  });

  it('has Saturn in the north from Sydney', () => {
    const s = tonightSky(Date.parse('2026-10-15T02:00Z'), { latitude: -33.9, longitude: 151.2 }).visible.find((o) => o.name === 'Saturn')!;
    expect(compass(s.best.azimuth)).toBe('north');
  });

  it('says "now", not "all night", when asked after dark', () => {
    const late = tonightSky(Date.parse('2026-10-15T23:00Z'), LONDON);
    expect(late.startsNow).toBe(true);
    const saturn = late.visible.find((o) => o.name === 'Saturn')!;
    expect(whenAndWhere(saturn, hhmm, late)).toMatch(/^Visible now until 0[34]:\d0; highest now, halfway up in the south\.$/);
  });

  it('names planets washed out by a bright sky apart from those simply not up', () => {
    // A London June night is short and never fully dark.
    const june = tonightSky(Date.parse('2026-06-21T12:00Z'), LONDON);
    expect(june.washedOut.length + june.hidden.length).toBeGreaterThan(0);
    expect([...june.washedOut, ...june.hidden]).not.toContain('Uranus');
  });

  it('tells a white night from the midnight sun', () => {
    expect(tonightSky(Date.parse('2026-06-21T12:00Z'), { latitude: 64.1, longitude: -21.9 }).polar).toBe('white-night');
  });

  it('gives times, not dusk and dawn, in polar night', () => {
    const t = tonightSky(Date.parse('2026-12-21T12:00Z'), { latitude: 78.2, longitude: 15.6 });
    expect(t.polar).toBe('polar-night');
    for (const o of t.visible) expect(whenAndWhere(o, hhmm, t)).not.toMatch(/dusk|dawn|all night|nightfall/);
  });

  it('knows the midnight sun', () => {
    const t = tonightSky(Date.parse('2026-06-21T12:00Z'), { latitude: 69.6, longitude: 19 });
    expect(t.dark).toBeNull();
    expect(t.polar).toBe('midnight-sun');
  });

  it('knows polar night', () => {
    const t = tonightSky(Date.parse('2026-12-21T12:00Z'), { latitude: 80, longitude: 15 });
    expect(t.polar).toBe('polar-night');
    expect(t.visible.length).toBeGreaterThan(0);
  });
});

describe('words', () => {
  it('names directions, heights and brightness', () => {
    expect(compass(0)).toBe('north');
    expect(compass(359)).toBe('north');
    expect(compass(130)).toBe('south-east');
    expect(height(15)).toBe('low');
    expect(height(30)).toBe('halfway up');
    expect(height(70)).toBe('high');
    expect(height(80)).toBe('almost overhead');
    expect(brightness(-4.5)).toBe('very bright');
    expect(brightness(7.8)).toBe('needs binoculars');
  });

  it('rounds a place to 0.1°', () => {
    expect(roundPlace({ latitude: 51.5074, longitude: -0.1278 })).toEqual({ latitude: 51.5, longitude: -0.1 });
  });
});

describe('parseCoordinate', () => {
  it('reads signs, typographic minus, decimal commas and compass letters', () => {
    expect(parseCoordinate('51.5', 'latitude')).toBe(51.5);
    expect(parseCoordinate('−0.1', 'longitude')).toBe(-0.1);
    expect(parseCoordinate('51,5', 'latitude')).toBe(51.5);
    expect(parseCoordinate('33.9 S', 'latitude')).toBe(-33.9);
    expect(parseCoordinate('151.2E', 'longitude')).toBe(151.2);
    expect(parseCoordinate('0.1 w', 'longitude')).toBe(-0.1);
  });

  it('rejects the wrong letter, both a sign and a letter, and out-of-range values', () => {
    expect(parseCoordinate('51.5 E', 'latitude')).toBeNull();
    expect(parseCoordinate('-33.9 S', 'latitude')).toBeNull();
    expect(parseCoordinate('95', 'latitude')).toBeNull();
    expect(parseCoordinate('', 'longitude')).toBeNull();
    expect(isPlace({ latitude: 500, longitude: 0 })).toBe(false);
  });
});

describe('edge cases from review', () => {
  it('waits for a dark enough sky before saying "now"', () => {
    // 17:50 UTC in London: just past civil dusk, too bright yet for Saturn.
    const t = tonightSky(Date.parse('2026-10-15T17:50Z'), LONDON);
    const saturn = t.visible.find((o) => o.name === 'Saturn')!;
    expect(whenAndWhere(saturn, hhmm, t)).toMatch(/^Visible from 18:\d0 /);
  });

  it('says "now until dawn" in the last minutes of the night, not "briefly"', () => {
    const t = tonightSky(Date.parse('2026-10-16T05:30Z'), LONDON);
    expect(whenAndWhere(t.visible.find((o) => o.name === 'Jupiter')!, hhmm, t)).toMatch(/^Visible now until dawn/);
  });

  it('stays polar night all day at 73° N in midwinter', () => {
    for (const h of ['00', '06', '12', '18']) expect(tonightSky(Date.parse(`2026-12-20T${h}:00Z`), { latitude: 73, longitude: 20 }).polar).toBe('polar-night');
  });
});
