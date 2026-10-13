// Fetch JSON with a timeout, logging each step under a tag such as "[weather]".
// Never throws: failures come back as a reason string for the caller to log or fall back on.

export interface Logger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
}

export interface FetchOptions {
  fetch?: typeof fetch;
  log?: Logger;
  tag?: string;
  timeoutMs?: number;
}

export type FetchResult = { ok: true; body: unknown; bytes: number; ms: number } | { ok: false; reason: string };

export async function fetchJson(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
  const { fetch: doFetch = fetch, log = console, tag = '[fetch]', timeoutMs = 15_000 } = opts;
  const started = Date.now();
  log.info(tag, 'GET', url);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  let text: string;
  try {
    res = await doFetch(url, { signal: controller.signal });
    text = await res.text();
  } catch (err) {
    // A CORS refusal and an offline network look the same here: a TypeError with no status.
    if (controller.signal.aborted) return { ok: false, reason: `timed out after ${timeoutMs} ms` };
    // Node's fetch hides the useful part (DNS failure, refused connection) in err.cause.
    const cause = (err as { cause?: { code?: string; message?: string } })?.cause;
    const detail = cause?.code ?? cause?.message;
    return { ok: false, reason: `request failed (${String(err)}${detail ? `: ${detail}` : ''})` };
  } finally {
    clearTimeout(timer);
  }

  const ms = Date.now() - started;
  log.info(tag, `HTTP ${res.status}, ${(text.length / 1024).toFixed(1)} KB in ${ms} ms`, {
    contentType: res.headers.get('content-type'),
    // Browsers hide this header from scripts unless the server exposes it, so null does not mean CORS failed.
    accessControlAllowOrigin: res.headers.get('access-control-allow-origin')
  });
  if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
  try {
    return { ok: true, body: JSON.parse(text), bytes: text.length, ms };
  } catch (err) {
    // Log the parser's message (it quotes the start of the body), but keep it out of the
    // reason, which ends up in the public data file.
    log.warn(tag, `response is not JSON: ${String(err)}`);
    return { ok: false, reason: 'response is not JSON' };
  }
}
