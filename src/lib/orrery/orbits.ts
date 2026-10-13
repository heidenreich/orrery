// Planet positions from JPL's "Approximate Positions of the Planets"
// (E. M. Standish, Table 1, valid 1800–2050 AD):
// https://ssd.jpl.nasa.gov/planets/approx_pos.html

const DEG = Math.PI / 180;
const DAY_MS = 86_400_000;

/** [a (AU), e, I (deg), L (deg), long. perihelion (deg), long. ascending node (deg)] */
export type Elements = readonly [number, number, number, number, number, number];

export interface OrbitalElements {
  /** Value at J2000.0. */
  el: Elements;
  /** Rate of change per Julian century. */
  rt: Elements;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface Keplerian {
  a: number;
  e: number;
  I: number;
  L: number;
  varpi: number;
  node: number;
}

export const VALID_YEARS = { from: 1800, to: 2050 } as const;

export const julianDate = (ms: number) => ms / DAY_MS + 2440587.5;

/** Julian centuries since J2000.0. */
export const centuriesSinceJ2000 = (ms: number) => (julianDate(ms) - 2451545.0) / 36525;

function elementsAt(o: OrbitalElements, T: number): Keplerian {
  const v = o.el.map((x, i) => x + o.rt[i] * T);
  return { a: v[0], e: v[1], I: v[2] * DEG, L: v[3] * DEG, varpi: v[4] * DEG, node: v[5] * DEG };
}

/** Heliocentric ecliptic J2000 coordinates (AU) for a given eccentric anomaly. */
function fromEccentricAnomaly(k: Keplerian, E: number): Vec3 {
  const w = k.varpi - k.node;
  const xp = k.a * (Math.cos(E) - k.e);
  const yp = k.a * Math.sqrt(1 - k.e * k.e) * Math.sin(E);
  const cw = Math.cos(w), sw = Math.sin(w);
  const cO = Math.cos(k.node), sO = Math.sin(k.node);
  const cI = Math.cos(k.I), sI = Math.sin(k.I);
  return {
    x: (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    y: (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    z: sw * sI * xp + cw * sI * yp
  };
}

function solveKepler(M: number, e: number): number {
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  return E;
}

/** Heliocentric ecliptic position (AU) at a moment in time. */
export function heliocentric(o: OrbitalElements, ms: number): Vec3 {
  const k = elementsAt(o, centuriesSinceJ2000(ms));
  let M = (k.L - k.varpi) % (2 * Math.PI);
  if (M > Math.PI) M -= 2 * Math.PI;
  if (M < -Math.PI) M += 2 * Math.PI;
  return fromEccentricAnomaly(k, solveKepler(M, k.e));
}

/** Points around the full orbit ellipse (AU), for drawing the orbit path. */
export function orbitPath(o: OrbitalElements, ms: number, segments = 360): Vec3[] {
  const k = elementsAt(o, centuriesSinceJ2000(ms));
  return Array.from({ length: segments + 1 }, (_, i) =>
    fromEccentricAnomaly(k, (i / segments) * 2 * Math.PI)
  );
}

export const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const length = (a: Vec3) => Math.hypot(a.x, a.y, a.z);

/** Mars Sol Date (Allison & McEwen 2000), using a fixed TT−UTC offset of 69.184 s. */
export const marsSolDate = (ms: number) =>
  (julianDate(ms) + 69.184 / 86400 - 2405522.0028779) / 1.0274912517;
