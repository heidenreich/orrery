// Latest Curiosity REMS entry seen in the NASA feed, checked 2026-10-13.
// Shown when the live feed can't be reached.

export interface MarsReport {
  sol: number;
  /** ISO date, YYYY-MM-DD. */
  earthDate: string;
  /** Solar longitude in degrees: Mars's position in its orbit, 0° = northern spring equinox. */
  ls: number | null;
  /** Mars month, 1–12. */
  month: number | null;
  /** Air temperature, °C. */
  minTemp: number | null;
  maxTemp: number | null;
  /** Atmospheric pressure, Pa. */
  pressure: number | null;
  /** Local times, as the feed gives them (e.g. "05:35"). */
  sunrise: string | null;
  sunset: string | null;
  /** Sky condition, e.g. "Sunny". */
  opacity: string | null;
}

/** When the stored report was copied from the feed. */
export const STORED_REPORT_CHECKED = '2026-10-13';

export const STORED_MARS_REPORT: MarsReport = {
  sol: 4995,
  earthDate: '2026-08-25',
  ls: 341,
  month: 12,
  minTemp: -71,
  maxTemp: -5,
  pressure: 777,
  sunrise: '06:46',
  sunset: '18:51',
  opacity: 'Sunny'
};
