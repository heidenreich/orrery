/** "12 min ago", "3 h ago", "5 days ago", relative to `now` (ms). */
export function ago(iso: string, now: number): string {
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h ago`;
  // Days up to two months, then months, then years, so a stalled feed never reads "400 days ago".
  const days = Math.round(h / 24);
  if (days < 60) return `${days} days ago`;
  const months = Math.round(days / 30.44);
  if (months < 18) return `${months} months ago`;
  const years = Math.floor(days / 365.25);
  return `${years} years ago`;
}

/** Typographic minus for negative numbers: "−71". */
export const signed = (s: string) => s.replace(/^-/, '−');

/** "−71 °C" */
export const celsius = (c: number) => `${signed(String(Math.round(c)))} °C`;

const KM_PER_AU = 149_597_870.7;

/** "149.6 million km", "1.31 billion km". */
export function km(au: number): string {
  const millions = (au * KM_PER_AU) / 1e6;
  // Compare after rounding to the shown precision, so 999.96 million reads "1 billion", not "1,000 million".
  if (Math.round(millions * 10) / 10 >= 1000) return `${(millions / 1000).toLocaleString('en-US', { maximumFractionDigits: 2 })} billion km`;
  return `${millions.toLocaleString('en-US', { maximumFractionDigits: 1 })} million km`;
}

/** Light travel time for a distance in AU: "8.3 minutes", "1 h 13 min". */
export function lightTime(au: number): string {
  const min = au * 8.316746;
  // Below 59.95 the one-decimal form can't round up to "60.0 minutes".
  if (min < 59.95) return `${min.toFixed(1)} minutes`;
  // Round the total first, so 119.6 minutes reads "2 h 0 min", not "1 h 60 min".
  const total = Math.round(min);
  return `${Math.floor(total / 60)} h ${total % 60} min`;
}

const QUARTERS = ['spring', 'summer', 'autumn', 'winter'] as const;

/** Northern-hemisphere season in words for a solar longitude: Ls 341 → "late northern winter". */
export function seasonWords(ls: number): string {
  const l = ((ls % 360) + 360) % 360;
  const within = l % 90;
  const part = within < 30 ? 'early' : within < 60 ? 'mid' : 'late';
  return `${part} northern ${QUARTERS[Math.floor(l / 90)]}`;
}
