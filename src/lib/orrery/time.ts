/** Playback speed for real time: one simulated second per second, as days per second. */
export const REAL_TIME = 1 / 86_400;

/** How far the clock may be from the actual time and still count as live (ms). */
export const LIVE_TOLERANCE_MS = 5 * 60_000;

/**
 * Playback stops at these dates. JPL's approximate elements are fitted for 1800–2050 and drift
 * slowly outside it; far beyond these limits the orbits stop being physically meaningful.
 */
export const SIM_MIN_MS = Date.UTC(1000, 0, 1);
export const SIM_MAX_MS = Date.UTC(3000, 0, 1);
