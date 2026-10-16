// Built once per deploy: fetches NASA and NOAA on the build machine and writes a small static file.
import { json } from '@sveltejs/kit';
import { collectWeather } from '$lib/data/weather-data';

export const prerender = true;

export async function GET() {
  const data = await collectWeather({
    fetch: globalThis.fetch,
    previousUrl: process.env.PREVIOUS_DATA_URL || undefined,
    offline: process.env.ORRERY_OFFLINE === '1'
  });
  return json(data);
}
