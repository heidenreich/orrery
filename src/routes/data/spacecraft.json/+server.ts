// Built once per deploy: fetches spacecraft trajectories from JPL Horizons on the build machine.
import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import { collectSpacecraft } from '$lib/data/spacecraft-data';

export const prerender = true;

export async function GET() {
  const data = await collectSpacecraft({
    fetch: globalThis.fetch,
    // CI passes the deployed weather file's URL; the spacecraft file sits beside it.
    previousUrl: env.PREVIOUS_DATA_URL ? env.PREVIOUS_DATA_URL.replace(/weather\.json$/, 'spacecraft.json') : undefined,
    offline: env.ORRERY_OFFLINE === '1'
  });
  return json(data);
}
