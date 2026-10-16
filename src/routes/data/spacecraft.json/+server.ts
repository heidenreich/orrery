// Built once per deploy: fetches spacecraft trajectories from JPL Horizons on the build machine.
import { json } from '@sveltejs/kit';
import { collectSpacecraft } from '$lib/data/spacecraft-data';

export const prerender = true;

export async function GET() {
  const data = await collectSpacecraft({
    fetch: globalThis.fetch,
    // CI passes the deployed weather file's URL; the spacecraft file sits beside it.
    previousUrl: process.env.PREVIOUS_DATA_URL ? process.env.PREVIOUS_DATA_URL.replace(/weather\.json$/, 'spacecraft.json') : undefined,
    offline: process.env.ORRERY_OFFLINE === '1'
  });
  return json(data);
}
