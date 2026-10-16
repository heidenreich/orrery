// Fetches and parses spacecraft state vectors from JPL Horizons:
// https://ssd-api.jpl.nasa.gov/doc/horizons.html
// The API returns JSON with the classic text ephemeris in "result": rows between $$SOE and $$EOE,
// here in CSV as "JDTDB, Calendar Date (TDB), X, Y, Z, VX, VY, VZ," in AU and AU/day,
// heliocentric (CENTER 500@10) or planet-centred for moons, ecliptic J2000 (REF_PLANE ECLIPTIC, REF_SYSTEM ICRF), the
// same frame as the planet positions (ephemeris.ts).

export const HORIZONS_API = 'https://ssd.jpl.nasa.gov/api/horizons.api';

/** Seconds TDB runs ahead of UTC (32.184 + 37 leap seconds), close enough for display. */
const TDB_MINUS_UTC_S = 69.184;

export function horizonsUrl(target: string, start: string, stop: string, step: string, center = '500@10'): string {
  const q = (v: string) => `'${v}'`;
  const params: Record<string, string> = {
    format: 'json',
    COMMAND: q(target),
    OBJ_DATA: q('NO'),
    MAKE_EPHEM: q('YES'),
    EPHEM_TYPE: q('VECTORS'),
    CENTER: q(center),
    REF_PLANE: q('ECLIPTIC'),
    REF_SYSTEM: q('ICRF'),
    VEC_TABLE: q('2'),
    VEC_CORR: q('NONE'),
    OUT_UNITS: q('AU-D'),
    CSV_FORMAT: q('YES'),
    VEC_LABELS: q('NO'),
    START_TIME: q(start),
    STOP_TIME: q(stop),
    STEP_SIZE: q(step)
  };
  return `${HORIZONS_API}?${new URLSearchParams(params).toString()}`;
}

export interface StateVector {
  /** UTC, ms since 1970 */
  ms: number;
  x: number;
  y: number;
  z: number;
  /** AU per day */
  vx: number;
  vy: number;
  vz: number;
}

const MONTHS: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12'
};

/** "A.D. 2100-JAN-01 00:00:00.0000" → "2100-01-01", as Horizons writes coverage limits. */
function horizonsDate(text: string): string | null {
  const m = /A\.D\. (\d{4})-([A-Za-z]{3})-(\d{2})/.exec(text);
  const mm = m && MONTHS[m[2].toUpperCase()];
  return m && mm ? `${m[1]}-${mm}-${m[3]}` : null;
}

export type HorizonsResult =
  | { ok: true; vectors: StateVector[] }
  | { ok: false; reason: string; coverage?: { from?: string; to?: string } };

export function parseHorizons(body: unknown): HorizonsResult {
  if (typeof body !== 'object' || body === null) return { ok: false, reason: 'response is not a JSON object' };
  const b = body as Record<string, unknown>;
  if (typeof b.error === 'string') return { ok: false, reason: `Horizons: ${b.error.slice(0, 200)}` };
  const result = b.result;
  if (typeof result !== 'string') return { ok: false, reason: 'response has no result text' };

  const start = result.indexOf('$$SOE');
  const end = result.indexOf('$$EOE');
  if (start < 0 || end < start) {
    // Typically the requested window runs past the trajectory on file; say where it ends.
    const line = result.split('\n').map((l) => l.trim()).find((l) => /no ephemeris|error|cannot|not found/i.test(l));
    const coverage: { from?: string; to?: string } = {};
    const after = /after (A\.D\. [^,]+)/i.exec(result);
    const prior = /prior to (A\.D\. [^,]+)/i.exec(result);
    if (after) coverage.to = horizonsDate(after[1]) ?? undefined;
    if (prior) coverage.from = horizonsDate(prior[1]) ?? undefined;
    return { ok: false, reason: `Horizons: ${(line ?? 'no ephemeris in the response').slice(0, 200)}`, coverage };
  }

  const vectors: StateVector[] = [];
  for (const row of result.slice(start + 5, end).split('\n')) {
    const cells = row.split(',').map((c) => c.trim());
    if (cells.length < 8) continue;
    const jd = Number(cells[0]);
    const [x, y, z, vx, vy, vz] = cells.slice(2, 8).map(Number);
    if (![jd, x, y, z, vx, vy, vz].every(Number.isFinite)) continue;
    const ms = Math.round((jd - 2440587.5) * 86_400_000 - TDB_MINUS_UTC_S * 1000);
    vectors.push({ ms, x, y, z, vx, vy, vz });
  }
  if (vectors.length < 2) return { ok: false, reason: `Horizons returned ${vectors.length} usable rows` };
  return { ok: true, vectors };
}
