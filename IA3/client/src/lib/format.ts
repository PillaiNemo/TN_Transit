// Journey times from the API are IST wall-clock strings ("2026-10-28 21:30:00").
// They are formatted WITHOUT timezone conversion. Instants (booked_at, cancelled_at)
// are ISO strings and are shown in Asia/Kolkata.
const IST = 'Asia/Kolkata';

function wallParts(value: string) {
  const [d, t = '00:00:00'] = value.replace('T', ' ').split(' ');
  const [y, m, day] = d.split('-').map(Number);
  const [hh, mm] = t.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, day, hh, mm));
}

/** "06:00 AM" style, as on printed timetables. */
export const formatTime = (wall: string) =>
  wallParts(wall).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'UTC' });

export const formatDate = (wall: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  wallParts(wall).toLocaleDateString('en-IN', { ...opts, timeZone: 'UTC' });

export const formatLongDate = (wall: string) =>
  formatDate(wall, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export const formatInstant = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: IST });

export function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Days between departure date and arrival date, for the "+1" marker. */
export function dayOffset(departure: string, arrival: string) {
  const ms = wallParts(arrival.slice(0, 10)).getTime() - wallParts(departure.slice(0, 10)).getTime();
  return Math.round(ms / 86_400_000);
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inrExact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });
export const money = (n: number | null | undefined) => (n === null || n === undefined ? '—' : inr.format(n));
export const moneyExact = (n: number | null | undefined) => (n === null || n === undefined ? '—' : inrExact.format(n));
export const compactNumber = (n: number) => new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

/** Today's date in IST as YYYY-MM-DD (the journey calendar is Indian time). */
export function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(new Date());
}

export function addDays(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const BERTH_LABELS: Record<string, string> = {
  LOWER: 'Lower',
  MIDDLE: 'Middle',
  UPPER: 'Upper',
  SIDE_LOWER: 'Side lower',
  SIDE_UPPER: 'Side upper',
  WINDOW: 'Window',
  CENTER: 'Middle',
  AISLE: 'Aisle',
};

export const BERTH_SHORT: Record<string, string> = {
  LOWER: 'LB', MIDDLE: 'MB', UPPER: 'UB', SIDE_LOWER: 'SL', SIDE_UPPER: 'SU', WINDOW: 'W', CENTER: 'M', AISLE: 'A',
};

/** "Seat 12" for seaters, "Berth L4" for sleeper-bus decks, "S1 · 23" for train coaches. */
export function seatLabel(coach: string, seat: string) {
  if (coach === 'MAIN') return `Seat ${seat}`;
  if (coach === 'LOWER' || coach === 'UPPER') return `Berth ${seat}`;
  return `${coach} · ${seat}`;
}

export const GENDER_LABELS = { M: 'Male', F: 'Female', O: 'Other' } as const;

export const TIME_BUCKETS = [
  { value: 0, label: 'Before 6 AM', short: '00–06' },
  { value: 1, label: '6 AM – 12 PM', short: '06–12' },
  { value: 2, label: '12 PM – 6 PM', short: '12–18' },
  { value: 3, label: 'After 6 PM', short: '18–24' },
];

export const cityLabel = (c: { city_name: string; also_known_as: string | null }) =>
  c.also_known_as ? `${c.city_name} (${c.also_known_as})` : c.city_name;
