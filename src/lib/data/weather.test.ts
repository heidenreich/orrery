import { describe, expect, it, vi } from 'vitest';
import remsSample from './fixtures/rems-sample.json';
import windSample from './fixtures/solar-wind-sample.json';
import type { Logger } from './fetch-json';
import { STORED_MARS_REPORT } from './mars-report';
import { isIsoDate, parseSol, REMS_FEED_URL, summarizeRems } from './rems';
import { KP_URL } from './kp';
import { XRAY_URL } from './xray';
import { SOLAR_WIND_URL, summarizeSolarWind } from './solar-wind';
import { loadWeather } from './weather';
import { collectWeather, parseWeatherData, type WeatherData } from './weather-data';

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });

function recorder(): Logger & { lines: string[] } {
  const lines: string[] = [];
  const push = (...args: unknown[]) => lines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  return { lines, info: push, warn: push };
}

/** A fetch that answers by URL; anything unlisted fails like a blocked request. */
function routes(map: Record<string, () => Response | Promise<Response>>): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const handler = map[String(input)];
    if (!handler) throw new TypeError('Failed to fetch');
    return handler();
  }) as unknown as typeof fetch;
}

const NOW = () => new Date('2026-10-13T13:00:00Z');
const PREVIOUS = 'https://example.test/orrery/data/weather.json';
const WIND_NOW = Date.parse('2026-10-13T13:00:00Z');

describe('parseSol', () => {
  it('converts the feed strings to numbers and keeps text fields', () => {
    expect(parseSol(remsSample.soles[0])).toEqual({
      ok: true,
      missing: [],
      report: {
        sol: 4995, earthDate: '2026-08-25', ls: 341, month: 12, minTemp: -71, maxTemp: -5,
        pressure: 777, sunrise: '06:46', sunset: '18:51', opacity: 'Sunny',
        minGroundTemp: -84, maxGroundTemp: 4, uvIndex: 'Moderate'
      }
    });
  });

  it('treats "--" as a missing reading and lists what is missing', () => {
    const r = parseSol(remsSample.soles[1]);
    expect(r.ok && r.report.minTemp).toBe(null);
    expect(r.ok && r.missing).toEqual([
      'min_temp', 'max_temp', 'pressure', 'atmo_opacity', 'min_gts_temp', 'max_gts_temp', 'local_uv_irradiance_index'
    ]);
  });

  it('rejects dates that are not real calendar dates', () => {
    expect(isIsoDate('2026-08-25')).toBe(true);
    expect(isIsoDate('2028-02-29')).toBe(true);
    for (const d of ['2026-13-45', '2026-02-30', '2027-02-29', '2026-8-25', '']) expect(isIsoDate(d)).toBe(false);
    expect(parseSol({ sol: '1', terrestrial_date: '2026-13-45' })).toMatchObject({ ok: false });
  });

  it('rejects entries without a usable sol or date', () => {
    expect(parseSol({ sol: '--', terrestrial_date: '2026-08-25' })).toMatchObject({ ok: false });
    expect(parseSol({ sol: '4995', terrestrial_date: 'Aug 25' })).toMatchObject({ ok: false });
    expect(parseSol({ sol: '49.5', terrestrial_date: '2026-08-25' })).toMatchObject({ ok: false });
  });
});

describe('summarizeRems', () => {
  it('keeps the newest report and a short history, oldest first', () => {
    const body = { soles: [{ sol: '5000', terrestrial_date: '' }, ...[...remsSample.soles].reverse()] };
    const r = summarizeRems(body, recorder());
    expect(r.ok && r.report.sol).toBe(4995);
    expect(r.ok && r.history.map((h) => h.sol)).toEqual([4994, 4995]);
  });

  it('limits the history length', () => {
    const soles = Array.from({ length: 100 }, (_, i) => ({ sol: String(4000 + i), terrestrial_date: '2026-01-01' }));
    const r = summarizeRems({ soles }, recorder(), 10);
    expect(r.ok && r.history.length).toBe(10);
    expect(r.ok && r.history.at(-1)?.sol).toBe(4099);
  });

  it('picks the newest sol even when an unparseable sol sits between valid ones', () => {
    const soles = ['4990', '--', '4995', '4993'].map((sol, i) => ({ sol, terrestrial_date: `2026-08-2${i}` }));
    const r = summarizeRems({ soles }, recorder());
    expect(r.ok && r.report.sol).toBe(4995);
    expect(r.ok && r.history.map((h) => h.sol)).toEqual([4990, 4993, 4995]);
  });

  it('explains an unexpected shape', () => {
    expect(summarizeRems({ data: [] }, recorder())).toEqual({ ok: false, reason: 'no "soles" array (keys: data)' });
  });
});

describe('summarizeSolarWind', () => {
  it('uses only the active spacecraft and reports per-source counts', () => {
    const log = recorder();
    const r = summarizeSolarWind(windSample.records, log, { now: WIND_NOW });
    expect(r.ok && r.summary.latest).toEqual({
      time: '2026-10-13T12:55:00.000Z', speed: 538.2, density: 5.1, temperature: 201000, source: 'SOLAR1'
    });
    expect(log.lines[0]).toContain('"IMAP":{"active":0,"inactive":2}');
  });

  it('keeps the last 24 hours, oldest first, and skips records without a speed', () => {
    const r = summarizeSolarWind(windSample.records, recorder(), { now: WIND_NOW });
    expect(r.ok && r.summary.series.map((p) => p.time)).toEqual([
      '2026-10-13T11:30:00.000Z',
      '2026-10-13T12:55:00.000Z'
    ]);
  });

  it('falls back to every source when none is flagged active', () => {
    const inactive = windSample.records.filter((r) => !r.active);
    const r = summarizeSolarWind(inactive, recorder(), { now: WIND_NOW });
    expect(r.ok && r.summary.latest.source).toBe('IMAP');
    expect(r.ok && r.summary.latest.speed).toBe(541.91);
  });

  it('rejects a feed whose newest reading is more than 3 hours old', () => {
    const r = summarizeSolarWind(windSample.records, recorder(), { now: Date.parse('2026-10-13T16:30:00Z') });
    expect(r).toEqual({ ok: false, reason: 'newest reading is 3.6 h old (2026-10-13T12:55:00.000Z); limit is 3 h' });
  });

  it('ignores readings stamped in the future', () => {
    const future = { ...windSample.records[2], time_tag: '2026-10-13T18:00:00', proton_speed: 999 };
    const r = summarizeSolarWind([future, ...windSample.records], recorder(), { now: WIND_NOW });
    expect(r.ok && r.summary.latest.speed).toBe(538.2);
  });

  it('rejects data that is not a record list', () => {
    expect(summarizeSolarWind({}, recorder())).toMatchObject({ ok: false });
    expect(summarizeSolarWind([{ time_tag: 'x' }], recorder())).toMatchObject({ ok: false });
  });
});

describe('collectWeather', () => {
  it('builds a live data file from both feeds', async () => {
    const fetch = routes({ [REMS_FEED_URL]: () => json(remsSample), [SOLAR_WIND_URL]: () => json(windSample.records) });
    const d = await collectWeather({ fetch, log: recorder(), now: NOW });
    expect(parseWeatherData(d)).toEqual({ ok: true, data: d });
    expect(d.mars).toMatchObject({ source: 'live', fetchedAt: '2026-10-13T13:00:00.000Z', report: { sol: 4995 } });
    expect(d.solarWind).toMatchObject({ source: 'live', summary: { latest: { speed: 538.2 } } });
    // Small enough for every visitor: the feeds are megabytes, the file should be a few KB.
    expect(JSON.stringify(d).length).toBeLessThan(20_000);
  });

  // Constructed, in the feed's header-row shape (see kp.ts).
  const KP_ROWS = [['time_tag', 'Kp', 'a_running', 'station_count'], ['2026-10-13 06:00:00.000', '2.67', '12', '8'], ['2026-10-13 09:00:00.000', '3.33', '18', '8']];

  it('adds Earth’s Kp, and keeps the previous one when NOAA fails', async () => {
    const live = await collectWeather({
      fetch: routes({ [REMS_FEED_URL]: () => json(remsSample), [SOLAR_WIND_URL]: () => json(windSample.records), [KP_URL]: () => json(KP_ROWS) }),
      log: recorder(),
      now: NOW
    });
    expect(live.kp).toMatchObject({ source: 'live', summary: { latest: { time: '2026-10-13T09:00:00.000Z', kp: 3.33 } } });
    expect(parseWeatherData(live)).toEqual({ ok: true, data: live });

    const d = await collectWeather({
      fetch: routes({ [REMS_FEED_URL]: () => json(remsSample), [SOLAR_WIND_URL]: () => json(windSample.records), [PREVIOUS]: () => json(live) }),
      log: recorder(),
      previousUrl: PREVIOUS,
      now: () => new Date('2026-10-13T16:00:00Z')
    });
    expect(d.kp).toMatchObject({ source: 'previous', summary: { latest: { kp: 3.33 } }, error: expect.stringContaining('request failed') });
  });

  it('adds the Sun’s X-ray flux from the long-wave channel', async () => {
    // Constructed, in the feed's shape (see xray.ts).
    const records = [
      { time_tag: '2026-10-13T12:50:00Z', satellite: 19, flux: 2.5e-6, energy: '0.1-0.8nm' },
      { time_tag: '2026-10-13T12:50:00Z', satellite: 19, flux: 9e-5, energy: '0.05-0.4nm' }
    ];
    const d = await collectWeather({
      fetch: routes({ [REMS_FEED_URL]: () => json(remsSample), [XRAY_URL]: () => json(records) }),
      log: recorder(),
      now: NOW
    });
    expect(d.xray).toMatchObject({ source: 'live', summary: { latest: { flux: 2.5e-6, satellite: '19' }, peak: { flux: 2.5e-6 } } });
    expect(parseWeatherData(d)).toEqual({ ok: true, data: d });
  });

  it('keeps the previous deploy’s data for a feed that fails', async () => {
    const previous: WeatherData = await collectWeather({
      fetch: routes({ [REMS_FEED_URL]: () => json(remsSample), [SOLAR_WIND_URL]: () => json(windSample.records) }),
      log: recorder(),
      now: () => new Date('2026-10-13T12:00:00Z')
    });
    const fetch = routes({ [REMS_FEED_URL]: () => json({}, { status: 503 }), [PREVIOUS]: () => json(previous) });
    const log = recorder();
    const d = await collectWeather({ fetch, log, previousUrl: PREVIOUS, now: NOW });

    expect(d.mars).toMatchObject({ source: 'previous', fetchedAt: '2026-10-13T12:00:00.000Z', error: 'HTTP 503' });
    expect(d.solarWind).toMatchObject({ source: 'previous', error: 'request failed (TypeError: Failed to fetch)' });
    expect(log.lines.some((l) => l.includes('NASA feed failed (HTTP 503); Mars data is previous'))).toBe(true);
  });

  it('does not carry forward a previous solar wind reading older than a day', async () => {
    const previous = await collectWeather({
      fetch: routes({ [REMS_FEED_URL]: () => json(remsSample), [SOLAR_WIND_URL]: () => json(windSample.records) }),
      log: recorder(),
      now: NOW
    });
    const log = recorder();
    const d = await collectWeather({
      fetch: routes({ [REMS_FEED_URL]: () => json(remsSample), [PREVIOUS]: () => json(previous) }),
      log,
      previousUrl: PREVIOUS,
      now: () => new Date('2026-10-15T13:00:00Z')
    });
    expect(d.solarWind).toMatchObject({ source: 'none', summary: null });
    expect(log.lines.some((l) => l.includes('previous reading is 48 h old; not reusing it'))).toBe(true);
  });

  it('ignores a malformed previous file instead of copying it forward', async () => {
    const broken = { version: 1, generatedAt: '2026-10-13T12:00:00Z', mars: { source: 'live', fetchedAt: null, report: { sol: 1, earthDate: '2026-08-25' }, history: [] }, solarWind: { source: 'live', fetchedAt: null, summary: 'oops' } };
    const log = recorder();
    const d = await collectWeather({ fetch: routes({ [PREVIOUS]: () => json(broken) }), log, previousUrl: PREVIOUS, now: NOW });
    expect(d.mars.source).toBe('stored');
    expect(d.solarWind.source).toBe('none');
    expect(log.lines.some((l) => l.includes('previous data unavailable: solarWind.summary is not an object'))).toBe(true);
  });

  it('falls back to the stored report when nothing can be fetched', async () => {
    const d = await collectWeather({ fetch: routes({}), log: recorder(), previousUrl: PREVIOUS, now: NOW });
    expect(d.mars).toMatchObject({ source: 'stored', report: STORED_MARS_REPORT });
    expect(d.solarWind).toMatchObject({ source: 'none', summary: null });
  });

  it('makes no requests when offline', async () => {
    const fetch = routes({});
    await collectWeather({ fetch, log: recorder(), offline: true, now: NOW });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('parseWeatherData', () => {
  const good = () => JSON.parse(JSON.stringify(sample())) as Record<string, any>;
  const sample = () => ({
    version: 1,
    generatedAt: '2026-10-13T13:00:00.000Z',
    mars: { source: 'live', fetchedAt: '2026-10-13T13:00:00.000Z', report: { ...STORED_MARS_REPORT }, history: [] },
    solarWind: { source: 'live', fetchedAt: '2026-10-13T13:00:00.000Z', summary: { latest: { time: '2026-10-13T12:55:00.000Z', speed: 538.2, density: 5.1, temperature: 201000, source: 'SOLAR1' }, series: [] } },
    kp: { source: 'live', fetchedAt: '2026-10-13T13:00:00.000Z', summary: { latest: { time: '2026-10-13T09:00:00.000Z', kp: 3.33 }, series: [{ time: '2026-10-13T09:00:00.000Z', kp: 3.33 }] } },
    xray: { source: 'live', fetchedAt: '2026-10-13T13:00:00.000Z', summary: { latest: { time: '2026-10-13T12:58:00.000Z', flux: 1.45e-6, satellite: '19' }, peak: { time: '2026-10-13T08:05:00.000Z', flux: 3.4e-5 }, series: [{ time: '2026-10-13T12:58:00.000Z', flux: 1.45e-6 }] } }
  });

  it('accepts a good file and drops fields it does not know', () => {
    const f = good();
    f.extra = 'x';
    f.mars.report.injected = '<script>';
    const r = parseWeatherData(f);
    expect(r.ok && r.data).toEqual(sample());
  });

  it('loads a file written before Kp was added, as no Kp data', () => {
    const f = good();
    delete f.kp;
    const r = parseWeatherData(f);
    expect(r.ok && r.data.kp).toEqual({ source: 'none', fetchedAt: null, summary: null });
  });

  it('loads a file written before X-ray flux was added, as no X-ray data', () => {
    const f = good();
    delete f.xray;
    const r = parseWeatherData(f);
    expect(r.ok && r.data.xray).toEqual({ source: 'none', fetchedAt: null, summary: null });
  });

  it('loads a file written before ground temperature and UV existed', () => {
    const f = good();
    delete f.mars.report.minGroundTemp;
    delete f.mars.report.uvIndex;
    const r = parseWeatherData(f);
    expect(r.ok && [r.data.mars.report.minGroundTemp, r.data.mars.report.uvIndex]).toEqual([null, null]);
  });

  it.each<[string, (f: Record<string, any>) => void, string]>([
    ['a number where text belongs', (f) => (f.mars.report.uvIndex = 5), 'mars.report.uvIndex is not a short string'],
    ['an impossible date', (f) => (f.mars.report.earthDate = '2026-13-45'), 'mars.report.earthDate is not a YYYY-MM-DD date'],
    ['a summary without a reading', (f) => (f.solarWind.summary = { series: [] }), 'solarWind.summary.latest is not an object'],
    ['a speed that is not a number', (f) => (f.solarWind.summary.latest.speed = 'fast'), 'solarWind.summary.latest.speed is not a number'],
    ['a negative X-ray flux', (f) => (f.xray.summary.peak.flux = -1), 'xray.summary.peak.flux is not a plausible X-ray flux'],
    ['a Kp beyond the scale', (f) => (f.kp.summary.latest.kp = 12), 'kp.summary.latest.kp is outside 0–9'],
    ['a Kp that is not a number', (f) => (f.kp.summary.series[0].kp = 'high'), 'kp.summary.series[0].kp is not a number'],
    ['an unknown source', (f) => (f.mars.source = 'guess'), 'mars.source is not one of live, previous, stored'],
    ['a newer version', (f) => (f.version = 2), 'unsupported version 2']
  ])('rejects %s', (_, mutate, reason) => {
    const f = good();
    mutate(f);
    expect(parseWeatherData(f)).toEqual({ ok: false, reason });
  });
});

describe('loadWeather', () => {
  it('returns the data file and logs a summary', async () => {
    const data = await collectWeather({
      fetch: routes({ [REMS_FEED_URL]: () => json(remsSample), [SOLAR_WIND_URL]: () => json(windSample.records) }),
      log: recorder(),
      now: NOW
    });
    const log = recorder();
    const d = await loadWeather('/data/weather.json', { fetch: routes({ '/data/weather.json': () => json(data) }), log });
    expect(d).toEqual(data);
    expect(log.lines.at(-1)).toMatch(/^\[weather\] data built 2026-10-13T13:00:00.000Z .*live, sol 4995/);
  });

  it.each([
    ['a missing file', routes({})],
    ['an unrecognised file', routes({ '/data/weather.json': () => json({ version: 2 }) })]
  ])('falls back to the stored report for %s', async (_, fetch) => {
    const log = recorder();
    const d = await loadWeather('/data/weather.json', { fetch, log });
    expect(d.mars).toMatchObject({ source: 'stored', report: STORED_MARS_REPORT });
    expect(log.lines.at(-1)).toMatch(/^\[weather\] using stored report/);
  });

  it('gives up after the timeout', async () => {
    const hang = ((_: unknown, init?: RequestInit) =>
      new Promise((_, reject) =>
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      )) as typeof fetch;
    vi.useFakeTimers();
    const pending = loadWeather('/data/weather.json', { fetch: hang, log: recorder() });
    await vi.advanceTimersByTimeAsync(8000);
    vi.useRealTimers();
    expect((await pending).mars.source).toBe('stored');
  });
});
