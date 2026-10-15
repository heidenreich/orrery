import { describe, expect, it } from 'vitest';
import sample from '../../../tests/e2e/weather-sample.json';
import { parseWeatherData, type WeatherData } from '../data/weather-data';
import { readingsFetchedAt, todayLines } from './today';

const base = (() => {
  const r = parseWeatherData(sample);
  if (!r.ok) throw new Error(r.reason);
  return r.data;
})();
const kpTime = Date.parse(base.kp.summary!.latest.time);

describe('todayLines', () => {
  it('keeps NOAA storm levels in capitals', () => {
    const w: WeatherData = { ...base, kp: { ...base.kp, summary: { ...base.kp.summary!, latest: { ...base.kp.summary!.latest, kp: 4.67 } } } };
    const earth = todayLines(kpTime + 3_600_000, w, null).find((l) => l.label === 'Earth')!;
    expect(earth.text).toMatch(/^Kp 4\.7, G1 minor storm: /);
  });

  it('leaves out a Kp too old to describe now', () => {
    expect(todayLines(kpTime + 24 * 3_600_000, base, null).some((l) => l.label === 'Earth')).toBe(false);
  });

  it('dates the Mars report', () => {
    const mars = todayLines(kpTime, base, null).find((l) => l.label === 'Mars')!;
    expect(mars.text).toMatch(/for sol \d+ \(\d+ \w{3} on Earth\)$/);
  });
});

describe('readingsFetchedAt', () => {
  it('gives the oldest reading shown, so a stale feed is not hidden by a fresh one', () => {
    const w: WeatherData = { ...base, kp: { ...base.kp, fetchedAt: '2026-01-01T00:00:00Z' } };
    expect(readingsFetchedAt(w)).toBe('2026-01-01T00:00:00Z');
  });
});
