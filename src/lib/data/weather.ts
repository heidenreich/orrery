// Loads the site's weather data file in the browser, logging under "[weather]".
// Falls back to the report bundled with the site if the file is missing or unreadable.

import { fetchJson, type Logger } from './fetch-json';
import { parseWeatherData, STORED_WEATHER, type WeatherData } from './weather-data';

export async function loadWeather(url: string, opts: { fetch?: typeof fetch; log?: Logger } = {}): Promise<WeatherData> {
  const { fetch: doFetch = fetch, log = console } = opts;
  const res = await fetchJson(url, { fetch: doFetch, log, tag: '[weather]', timeoutMs: 8000 });
  const parsed = res.ok ? parseWeatherData(res.body) : res;
  if (!parsed.ok) {
    log.warn('[weather]', `using stored report: ${parsed.reason}`);
    return STORED_WEATHER(new Date().toISOString());
  }
  const d = parsed.data;
  log.info('[weather]', `data built ${d.generatedAt}`, {
    mars: `${d.mars.source}, sol ${d.mars.report.sol} (${d.mars.report.earthDate})${d.mars.error ? `, last error: ${d.mars.error}` : ''}`,
    solarWind: d.solarWind.summary
      ? `${d.solarWind.source}, ${d.solarWind.summary.latest.speed} km/s at ${d.solarWind.summary.latest.time}${d.solarWind.error ? `, last error: ${d.solarWind.error}` : ''}`
      : `none${d.solarWind.error ? ` (${d.solarWind.error})` : ''}`
  });
  return d;
}
