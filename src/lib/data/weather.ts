// Fetches the latest Curiosity weather report from NASA, logging each step to the console
// under a "[weather]" prefix, and falls back to the stored report when anything goes wrong.

import { STORED_MARS_REPORT, type MarsReport } from './mars-report';
import { parseSol, REMS_FEED_URL, solesOf } from './rems';

export type WeatherResult =
  | { source: 'live'; report: MarsReport }
  | { source: 'stored'; report: MarsReport; reason: string };

export interface Logger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
}

interface Options {
  fetch?: typeof fetch;
  log?: Logger;
  timeoutMs?: number;
  url?: string;
}

const TAG = '[weather]';

export async function fetchLatestMarsReport(opts: Options = {}): Promise<WeatherResult> {
  const { fetch: doFetch = fetch, log = console, timeoutMs = 8000, url = REMS_FEED_URL } = opts;
  const started = Date.now();
  const elapsed = () => `${Date.now() - started} ms`;
  const fallback = (reason: string): WeatherResult => {
    log.warn(TAG, `using stored report (sol ${STORED_MARS_REPORT.sol}): ${reason}`);
    return { source: 'stored', report: STORED_MARS_REPORT, reason };
  };

  log.info(TAG, 'GET', url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await doFetch(url, { signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    // A CORS refusal and an offline network look the same from here: a TypeError with no status.
    const reason = controller.signal.aborted
      ? `timed out after ${timeoutMs} ms`
      : `request failed (${String(err)}); blocked by CORS or the network`;
    return fallback(reason);
  }
  clearTimeout(timer);

  log.info(TAG, `HTTP ${res.status} in ${elapsed()}`, {
    contentType: res.headers.get('content-type'),
    // Browsers hide this header from scripts unless the server exposes it, so null does not mean CORS failed.
    accessControlAllowOrigin: res.headers.get('access-control-allow-origin'),
    contentLength: res.headers.get('content-length')
  });
  if (!res.ok) return fallback(`HTTP ${res.status}`);

  let body: unknown;
  try {
    body = await res.json();
  } catch (err) {
    return fallback(`response is not JSON (${String(err)})`);
  }

  const list = solesOf(body);
  if (!list.ok) return fallback(list.reason);
  log.info(TAG, `${list.soles.length} sols in feed; newest raw entry:`, JSON.stringify(list.soles[0] ?? null));

  // Newest first; the feed is usually ordered that way already, but don't rely on it.
  const sorted = [...list.soles].sort((a, b) => Number(b.sol) - Number(a.sol));
  for (const raw of sorted) {
    const parsed = parseSol(raw);
    if (!parsed.ok) {
      log.warn(TAG, `skipping entry: ${parsed.reason}`);
      continue;
    }
    if (parsed.missing.length) log.info(TAG, `sol ${parsed.report.sol} has no reading for: ${parsed.missing.join(', ')}`);
    log.info(TAG, `live report: sol ${parsed.report.sol} (${parsed.report.earthDate}) in ${elapsed()}`, parsed.report);
    return { source: 'live', report: parsed.report };
  }
  return fallback(`none of the ${list.soles.length} entries had a valid sol and date`);
}
