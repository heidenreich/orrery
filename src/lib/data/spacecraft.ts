// Loads the spacecraft data file in the browser, logging under "[craft]". With no file, or a
// broken one, the orrery just shows no spacecraft.

import { fetchJson, type Logger } from './fetch-json';
import { parseSpacecraftData, type SpacecraftData } from './spacecraft-data';

export async function loadSpacecraft(url: string, opts: { fetch?: typeof fetch; log?: Logger } = {}): Promise<SpacecraftData | null> {
  const { fetch: doFetch = fetch, log = console } = opts;
  const res = await fetchJson(url, { fetch: doFetch, log, tag: '[craft]', timeoutMs: 15_000 });
  const parsed = res.ok ? parseSpacecraftData(res.body) : res;
  if (!parsed.ok) {
    log.warn('[craft]', `no spacecraft: ${parsed.reason}`);
    return null;
  }
  const d = parsed.data;
  log.info('[craft]', `data built ${d.generatedAt}: ${d.craft.map((t) => `${t.id} (${t.source})`).join(', ') || 'none'}`);
  if (d.missing.length) log.warn('[craft]', 'missing:', d.missing.map((m) => `${m.id}: ${m.reason}`).join('; '));
  return d;
}
