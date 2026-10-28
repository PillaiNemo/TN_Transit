import { Bus, TrainFront } from 'lucide-react';
import { dayOffset, formatDate, formatDuration, formatTime } from '../lib/format';
import { tamilName } from '../lib/places';
import type { ServiceResult } from '../types';

/** Progress through the booking, drawn as stops on a line. */
export function BookingSteps({ current }: { current: 0 | 1 | 2 }) {
  const steps = ['Seats', 'Passenger Details', 'Confirmation'];
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label="Booking progress">
      {steps.map((label, i) => (
        <li key={label} className="flex items-center gap-2" aria-current={i === current ? 'step' : undefined}>
          {i > 0 && <span className="text-ink-300" aria-hidden="true">→</span>}
          <span className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold ${
            i === current ? 'bg-clay-500 text-white' : i < current ? 'bg-slate-700 text-white' : 'bg-paper-200 text-ink-500'}`}>
            {i < current ? '✓' : i + 1}
          </span>
          <span className={`text-sm ${i === current ? 'font-semibold text-clay-600' : 'text-ink-500'}`}>{label}</span>
        </li>
      ))}
    </ol>
  );
}

/** Compact timetable line for a journey: 21:30 CHN-KCBT ——— 9h15m ——— 06:45+1 CBE-GPM */
export function JourneyStrip({ s }: { s: ServiceResult }) {
  const Icon = s.transport_mode === 'BUS' ? Bus : TrainFront;
  const offset = dayOffset(s.departure_at, s.arrival_at);
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="flex flex-wrap items-baseline gap-x-3">
          <span className="display text-3xl text-ink-950">{s.service_name}</span>
          <span className="font-mono text-xs text-ink-500">{s.service_number}</span>
        </p>
        <p className="flex items-center gap-2 text-xs font-medium text-ink-500">
          <Icon className="size-4" /> {s.operator_name} · <span className="text-clay-700">{s.service_type}</span>
        </p>
      </div>
      <div className="mt-5 grid grid-cols-[auto_1fr_auto] items-center gap-4">
        <div>
          <p className="figure text-2xl font-semibold text-ink-950">{formatTime(s.departure_at)}</p>
          <p className="text-sm font-medium text-ink-800">{s.origin_city} <span className="tamil text-xs text-ink-400">{tamilName(s.origin_city)}</span></p>
          <p className="max-w-56 truncate text-xs text-ink-500" title={s.origin_station}>{s.origin_station}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full border-2 border-slate-700" />
          <span className="relative h-px flex-1 bg-paper-300">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white px-2 text-[11px] text-ink-600">
              {formatDuration(s.duration_minutes)} · {s.distance_km} km
            </span>
          </span>
          <span className="size-2.5 shrink-0 rounded-full bg-slate-700" />
        </div>
        <div className="text-right">
          <p className="figure text-2xl font-semibold text-ink-950">{formatTime(s.arrival_at)}{offset > 0 && <sup className="text-sm text-clay-600"> +{offset}</sup>}</p>
          <p className="text-sm font-medium text-ink-800"><span className="tamil text-xs text-ink-400">{tamilName(s.destination_city)}</span> {s.destination_city}</p>
          <p className="ml-auto max-w-56 truncate text-xs text-ink-500" title={s.destination_station}>{s.destination_station}</p>
        </div>
      </div>
      <p className="mt-3 text-xs font-medium text-ink-500">{formatDate(s.departure_at, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
    </div>
  );
}
