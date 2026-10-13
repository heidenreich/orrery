/** Playback speed for real time: one simulated second per second, as days per second. */
export const REAL_TIME = 1 / 86_400;

/** How far the clock may be from the actual time and still count as live (ms). */
export const LIVE_TOLERANCE_MS = 5 * 60_000;

/**
 * Playback stops at these dates, well inside the span where the planet theory (VSOP87, see
 * ephemeris.ts) and the pole and precession rates in seasons.ts hold.
 */
export const SIM_MIN_MS = Date.UTC(1000, 0, 1);
export const SIM_MAX_MS = Date.UTC(3000, 0, 1);
