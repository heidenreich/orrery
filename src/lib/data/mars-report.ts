// Latest Curiosity REMS entry seen in the NASA feed
// (https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json), checked 2026-10-13.
// Placeholder until the scheduled fetch writes static weather data.

export interface MarsReport {
  sol: number;
  earthDate: string;
  /** Solar longitude in degrees: Mars's position in its orbit, 0° = northern spring equinox. */
  ls: number;
  /** Mars month, 1–12. */
  month: number;
}

export const LATEST_MARS_REPORT: MarsReport = {
  sol: 4995,
  earthDate: '2026-08-25',
  ls: 341,
  month: 12
};
