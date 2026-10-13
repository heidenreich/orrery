/** Playback speed for real time: one simulated second per second, as days per second. */
export const REAL_TIME = 1 / 86_400;

/** How far the clock may be from the actual time and still count as live (ms). */
export const LIVE_TOLERANCE_MS = 5 * 60_000;
