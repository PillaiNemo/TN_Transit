import { ArrowLeftRight, ArrowRight, Bus, CalendarDays, TrainFront, Users } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCities } from '../hooks/useCities';
import { addDays, todayIST } from '../lib/format';
import type { Mode } from '../types';
import { CitySelect } from './CitySelect';
import { Button } from './ui';

export interface SearchValues { from: number | null; to: number | null; date: string; mode: Mode; passengers: number }

export const MAX_PASSENGERS = 6;
export const BOOKING_WINDOW_DAYS = 30;

/**
 * Journey planner. `card` is the home-page card with Bus / Train tabs on top;
 * `compact` is the slim "modify search" form on the results page.
 */
export function SearchWidget({ initial, variant = 'card', onSearched, onChange }: {
  initial?: Partial<SearchValues>; variant?: 'card' | 'compact'; onSearched?: () => void;
  onChange?: (v: SearchValues & { fromName?: string; toName?: string }) => void;
}) {
  const navigate = useNavigate();
  const { cities } = useCities();
  const today = todayIST();
  const [v, setV] = useState<SearchValues>({
    from: null, to: null, date: addDays(today, 1), mode: 'BUS', passengers: 1, ...initial,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    onChange?.({
      ...v,
      fromName: cities.find((c) => c.city_id === v.from)?.city_name,
      toName: cities.find((c) => c.city_id === v.to)?.city_name,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, cities]);

  const set = <K extends keyof SearchValues>(k: K, value: SearchValues[K]) => {
    setV((s) => ({ ...s, [k]: value }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!v.from) next.from = 'Choose where you are leaving from';
    if (!v.to) next.to = 'Choose your destination';
    if (v.from && v.from === v.to) next.to = 'Destination must differ from origin';
    if (!v.date) next.date = 'Pick a travel date';
    else if (v.date < today) next.date = 'Date cannot be in the past';
    else if (v.date > addDays(today, BOOKING_WINDOW_DAYS)) next.date = `Bookings open ${BOOKING_WINDOW_DAYS} days ahead`;
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    navigate(`/search?from=${v.from}&to=${v.to}&date=${v.date}&mode=${v.mode}&passengers=${v.passengers}`);
    onSearched?.();
  };

  const swap = (
    <button type="button" onClick={() => setV((s) => ({ ...s, from: s.to, to: s.from }))}
      className="flex size-9 shrink-0 items-center justify-center rounded-full border border-paper-300 bg-white text-ink-600 transition hover:rotate-180 hover:border-clay-400 hover:text-clay-600"
      aria-label="Swap origin and destination" title="Swap">
      <ArrowLeftRight className="size-4" />
    </button>
  );

  const dateField = (
    <div>
      <label htmlFor={`journey-date-${variant}`} className={variant === 'card' ? 'label' : 'sr-only'}>Date</label>
      <div className="relative">
        <input id={`journey-date-${variant}`} type="date" className={`input pr-3 ${errors.date ? 'input-error' : ''}`}
          min={today} max={addDays(today, BOOKING_WINDOW_DAYS)} value={v.date} aria-invalid={!!errors.date}
          onChange={(e) => set('date', e.target.value)} />
        <CalendarDays className="pointer-events-none absolute top-1/2 right-3 hidden size-4 -translate-y-1/2 text-ink-400" />
      </div>
      {errors.date && <p className="mt-1 text-xs font-medium text-rose-700" role="alert">{errors.date}</p>}
    </div>
  );

  const passengersField = (
    <div>
      <label htmlFor={`passengers-${variant}`} className={variant === 'card' ? 'label' : 'sr-only'}>Passengers</label>
      <div className="relative">
        <Users className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" />
        <select id={`passengers-${variant}`} className="input pl-9" value={v.passengers} onChange={(e) => set('passengers', Number(e.target.value))}>
          {Array.from({ length: MAX_PASSENGERS }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
        </select>
      </div>
    </div>
  );

  if (variant === 'compact') {
    return (
      <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <div className="flex gap-2">
          {(['BUS', 'TRAIN'] as const).map((m) => (
            <button key={m} type="button" onClick={() => set('mode', m)} aria-pressed={v.mode === m}
              className={`tab ${v.mode === m ? 'tab-active' : 'border border-paper-300 bg-white'}`}>{m === 'BUS' ? 'Bus' : 'Train'}</button>
          ))}
        </div>
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr_11rem_8rem_auto] lg:items-start">
          <CitySelect label="From" cities={cities} value={v.from} onChange={(id) => set('from', id)} error={errors.from} exclude={v.to} />
          <div className="hidden pt-0.5 lg:block">{swap}</div>
          <CitySelect label="To" cities={cities} value={v.to} onChange={(id) => set('to', id)} error={errors.to} exclude={v.from} />
          {dateField}
          {passengersField}
          <Button type="submit" variant="accent">Search <ArrowRight className="size-4" /></Button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      {/* Bus / Train tabs sit on top of the card */}
      <div className="flex gap-1.5" role="radiogroup" aria-label="Transport mode">
        {([['BUS', 'Bus', Bus], ['TRAIN', 'Train', TrainFront]] as const).map(([m, label, Icon]) => {
          const on = v.mode === m;
          return (
            <button key={m} type="button" role="radio" aria-checked={on} onClick={() => set('mode', m)}
              className={`flex items-center gap-2 rounded-t-xl px-6 py-3 text-sm font-semibold transition ${
                on ? 'bg-clay-500 text-white shadow-card' : 'bg-white/80 text-ink-700 hover:bg-white'}`}>
              <Icon className="size-4" /> {label}
            </button>
          );
        })}
      </div>
      <div className="rounded-2xl rounded-tl-none border border-paper-200 bg-white p-5 shadow-lift sm:p-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_10.5rem_8rem_auto] lg:items-start">
          <CitySelect labelVisible label="From" cities={cities} value={v.from} onChange={(id) => set('from', id)} error={errors.from} exclude={v.to} placeholder="Leaving from" />
          <div className="flex justify-center lg:pt-[26px]">{swap}</div>
          <CitySelect labelVisible label="To" cities={cities} value={v.to} onChange={(id) => set('to', id)} error={errors.to} exclude={v.from} placeholder="Going to" />
          {dateField}
          {passengersField}
          <div className="lg:pt-[22px]">
            <Button type="submit" variant="accent" size="lg" className="w-full whitespace-nowrap">
              Search {v.mode === 'BUS' ? 'Buses' : 'Trains'} <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-ink-500">
          <span>Quick dates:</span>
          {[0, 1, 2, 7].map((d) => {
            const day = addDays(today, d);
            return (
              <button key={d} type="button" onClick={() => set('date', day)}
                className={`rounded-full border px-3 py-1 font-medium transition ${v.date === day ? 'border-clay-500 bg-clay-50 text-clay-700' : 'border-paper-300 text-ink-600 hover:border-ink-300'}`}>
                {d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : d === 2 ? 'Day after' : 'Next week'}
              </button>
            );
          })}
          <span className="ml-auto">Bookings open {BOOKING_WINDOW_DAYS} days ahead</span>
        </div>
      </div>
    </form>
  );
}
