import { describe, expect, it } from 'vitest';
import { ago, celsius, km, lightTime, seasonWords } from './format';

describe('format', () => {
  it('uses a real minus sign for temperatures', () => {
    expect(celsius(-71.4)).toBe('−71 °C');
    expect(celsius(4)).toBe('4 °C');
  });

  it('writes distances in millions or billions of km', () => {
    expect(km(1)).toBe('149.6 million km');
    expect(km(8.776)).toBe('1.31 billion km');
  });

  it('writes light travel time in minutes or hours', () => {
    expect(lightTime(1)).toBe('8.3 minutes');
    expect(lightTime(8.776)).toBe('1 h 13 min');
  });

  it('describes a Mars solar longitude in words', () => {
    expect(seasonWords(341)).toBe('late northern winter');
    expect(seasonWords(0)).toBe('early northern spring');
    expect(seasonWords(135)).toBe('mid northern summer');
    expect(seasonWords(-10)).toBe('late northern winter');
  });

  it('says how long ago', () => {
    const now = Date.parse('2026-10-13T15:00:00Z');
    expect(ago('2026-10-13T14:59:50Z', now)).toBe('just now');
    expect(ago('2026-10-13T14:48:00Z', now)).toBe('12 min ago');
    expect(ago('2026-08-25T00:00:00Z', now)).toBe('50 days ago');
    expect(ago('2026-07-13T15:00:00Z', now)).toBe('3 months ago');
    expect(ago('2025-09-08T15:00:00Z', now)).toBe('13 months ago');
    expect(ago('2024-04-01T00:00:00Z', now)).toBe('2 years ago');
  });
});
