import { CalendarX2, ChevronLeft, ChevronRight, Pencil, SearchX, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SearchWidget } from '../components/SearchWidget';
import { ServiceCard } from '../components/ServiceCard';
import { Button, DemoNotice, EmptyState, ErrorState, Skeleton } from '../components/ui';
import { useApi } from '../hooks/useApi';
import { useCities } from '../hooks/useCities';
import { addDays, formatDate, money, TIME_BUCKETS, todayIST } from '../lib/format';
import { api } from '../services/api';
import type { Mode, SearchResponse } from '../types';

const SORTS = [
  { value: 'departure', label: 'Departure Time' },
  { value: 'fare', label: 'Fare: low to high' },
  { value: 'fare_desc', label: 'Fare: high to low' },
  { value: 'duration', label: 'Shortest duration' },
  { value: 'arrival', label: 'Arrival Time' },
  { value: 'seats', label: 'Most seats' },
];

interface Filters { depart: number[]; arrive: number[]; minPrice: number | null; maxPrice: number | null; types: string[]; availableOnly: boolean; sort: string }
const EMPTY: Filters = { depart: [], arrive: [], minPrice: null, maxPrice: null, types: [], availableOnly: false, sort: 'departure' };

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const { cities } = useCities();
  const from = Number(params.get('from')) || null;
  const to = Number(params.get('to')) || null;
  const date = params.get('date') || addDays(todayIST(), 1);
  const mode = (params.get('mode') === 'TRAIN' ? 'TRAIN' : 'BUS') as Mode;
  const passengers = Math.min(6, Math.max(1, Number(params.get('passengers')) || 1));

  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [editing, setEditing] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const debounced = useDebounced(filters, 250);

  // A new route/date/mode starts with clean filters.
  useEffect(() => { setFilters((f) => (f === EMPTY ? f : EMPTY)); }, [from, to, date, mode]);

  const { data, error, loading, reload } = useApi(
    () => (from && to
      ? api.get<SearchResponse>('/services/search', {
        from, to, date, mode, passengers,
        depart: debounced.depart, arrive: debounced.arrive,
        min_price: debounced.minPrice, max_price: debounced.maxPrice,
        types: debounced.types, available_only: debounced.availableOnly || null, sort: debounced.sort,
      })
      : Promise.reject(new Error('Choose an origin and a destination to search.'))),
    [from, to, date, mode, passengers, JSON.stringify(debounced)],
  );

  // Count for the other mode's tab ("Trains (3)"), from the same search endpoint.
  const other = useApi(
    () => (from && to
      ? api.get<SearchResponse>('/services/search', { from, to, date, mode: mode === 'BUS' ? 'TRAIN' : 'BUS', passengers })
      : Promise.resolve(null)),
    [from, to, date, mode, passengers],
  );
  const counts = {
    BUS: mode === 'BUS' ? data?.facets.total_services : other.data?.facets.total_services,
    TRAIN: mode === 'TRAIN' ? data?.facets.total_services : other.data?.facets.total_services,
  };

  const fromCity = cities.find((c) => c.city_id === from);
  const toCity = cities.find((c) => c.city_id === to);
  const facets = data?.facets;
  const activeCount = filters.depart.length + filters.arrive.length + filters.types.length +
    (filters.minPrice !== null ? 1 : 0) + (filters.maxPrice !== null ? 1 : 0) + (filters.availableOnly ? 1 : 0);

  const setDate = (d: string) => {
    params.set('date', d);
    setParams(params);
  };
  const setMode = (m: Mode) => {
    params.set('mode', m);
    setParams(params);
  };
  const today = todayIST();
  const dateStrip = useMemo(() => [-2, -1, 0, 1, 2].map((n) => addDays(date, n)), [date]);
  const noun = mode === 'BUS' ? 'buses' : 'trains';

  const filterPanel = facets && (
    <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
      {[['Departure time', 'depart'], ['Arrival time', 'arrive']].map(([label, key]) => (
        <fieldset key={key}>
          <legend className="mb-2 text-sm font-semibold text-ink-950">{label}</legend>
          <div className="space-y-1.5">
            {TIME_BUCKETS.map((b) => {
              const on = filters[key as 'depart' | 'arrive'].includes(b.value);
              return (
                <label key={b.value} className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-700">
                  <input type="checkbox" className="size-4 accent-slate-700" checked={on} aria-label={`${label} ${b.label}`}
                    onChange={() => setFilters((f) => ({ ...f, [key]: toggle(f[key as 'depart' | 'arrive'], b.value) }))} />
                  {b.label}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink-950">Price range</legend>
        {facets.min_fare !== null && facets.max_fare !== null && facets.min_fare < facets.max_fare ? (
          <>
            <input type="range" className="w-full accent-clay-500" aria-label="Maximum fare"
              min={facets.min_fare} max={facets.max_fare} step={5} value={filters.maxPrice ?? facets.max_fare}
              onChange={(e) => setFilters((f) => ({ ...f, maxPrice: Number(e.target.value) }))} />
            <div className="mt-1 flex justify-between text-xs text-ink-500"><span>{money(filters.minPrice ?? facets.min_fare)}</span><span>{money(filters.maxPrice ?? facets.max_fare)}</span></div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <input type="number" className="input py-1.5 text-xs" min={0} step={50} placeholder={`Min ${facets.min_fare}`} aria-label="Minimum fare"
                value={filters.minPrice ?? ''} onChange={(e) => setFilters((f) => ({ ...f, minPrice: e.target.value === '' ? null : Number(e.target.value) }))} />
              <input type="number" className="input py-1.5 text-xs" min={0} step={50} placeholder={`Max ${facets.max_fare}`} aria-label="Maximum fare value"
                value={filters.maxPrice ?? ''} onChange={(e) => setFilters((f) => ({ ...f, maxPrice: e.target.value === '' ? null : Number(e.target.value) }))} />
            </div>
          </>
        ) : <p className="text-xs text-ink-500">All services have the same fare.</p>}
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink-950">{mode === 'BUS' ? 'Bus type' : 'Train category'}</legend>
        <div className="space-y-1.5">
          {facets.service_types.map((t) => (
            <label key={t} className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-700">
              <input type="checkbox" className="size-4 accent-slate-700" checked={filters.types.includes(t)}
                onChange={() => setFilters((f) => ({ ...f, types: toggle(f.types, t) }))} />
              {t}
            </label>
          ))}
          <label className="flex cursor-pointer items-center gap-2.5 pt-2 text-sm text-ink-700">
            <input type="checkbox" className="size-4 accent-slate-700" checked={filters.availableOnly}
              onChange={(e) => setFilters((f) => ({ ...f, availableOnly: e.target.checked }))} />
            {passengers}+ free seat{passengers > 1 ? 's' : ''} only
          </label>
        </div>
      </fieldset>
    </div>
  );

  return (
    <div className="px-4 pb-8 sm:px-8">
      {/* Heading */}
      <header className="flex flex-wrap items-start justify-between gap-4 pt-2">
        <div>
          <h1 className="display text-4xl text-ink-950 sm:text-5xl">{fromCity?.city_name ?? '—'} <span className="text-ink-400">→</span> {toCity?.city_name ?? '—'}</h1>
          <p className="mt-2 text-sm text-ink-500">
            {formatDate(date, { day: 'numeric', month: 'short', year: 'numeric' })} · {passengers} Passenger{passengers > 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={() => setEditing((e) => !e)} aria-expanded={editing}
          className="inline-flex items-center gap-2 rounded-lg border border-clay-400 bg-white px-4 py-2 text-sm font-semibold text-clay-600 transition hover:bg-clay-50">
          {editing ? <X className="size-4" /> : <Pencil className="size-4" />} {editing ? 'Close' : 'Modify Search'}
        </button>
      </header>

      {editing && (
        <div className="card mt-6 animate-fade-up p-5">
          <SearchWidget variant="compact" initial={{ from, to, date, mode, passengers }} onSearched={() => setEditing(false)} />
        </div>
      )}

      {/* Mode tabs, date strip, sort */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Mode">
          {(['BUS', 'TRAIN'] as const).map((m) => (
            <button key={m} role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
              className={`rounded-full px-6 py-2 text-sm font-semibold transition ${mode === m ? 'bg-slate-700 text-white shadow-card' : 'border border-paper-300 bg-white text-ink-700 hover:border-slate-400'}`}>
              {m === 'BUS' ? 'Buses' : 'Trains'} ({counts[m] ?? '…'})
            </button>
          ))}
          <Button variant="secondary" size="sm" className="ml-1 rounded-full" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
            <SlidersHorizontal className="size-4" /> Filters{activeCount ? ` (${activeCount})` : ''}
          </Button>
          {activeCount > 0 && <button onClick={() => setFilters({ ...EMPTY, sort: filters.sort })} className="link text-sm">Clear filters</button>}
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-500">
          Sort by
          <select className="input w-auto py-2" value={filters.sort} onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))}>
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
      </div>

      {showFilters && <div className="card mt-4 animate-fade-up p-5">{filterPanel ?? <Skeleton className="h-28" />}</div>}

      <nav className="mt-4 flex items-center gap-2" aria-label="Choose another date">
        <button className="rounded-full p-2 text-ink-500 hover:bg-white disabled:opacity-30" disabled={date <= today} onClick={() => setDate(addDays(date, -1))} aria-label="Previous day"><ChevronLeft className="size-5" /></button>
        <div className="flex flex-1 gap-2 overflow-x-auto">
          {dateStrip.map((d) => (
            <button key={d} disabled={d < today} onClick={() => setDate(d)} aria-current={d === date ? 'date' : undefined}
              className={`min-w-24 flex-1 rounded-xl px-3 py-2 text-center text-sm transition disabled:opacity-30 ${d === date ? 'bg-clay-500 font-semibold text-white shadow-card' : 'border border-paper-200 bg-white text-ink-700 hover:border-paper-300'}`}>
              {formatDate(d, { weekday: 'short', day: 'numeric', month: 'short' })}
            </button>
          ))}
        </div>
        <button className="rounded-full p-2 text-ink-500 hover:bg-white" onClick={() => setDate(addDays(date, 1))} aria-label="Next day"><ChevronRight className="size-5" /></button>
      </nav>

      <section aria-live="polite" aria-busy={loading} className="mt-6 space-y-4">
        {error && <ErrorState message={error} onRetry={from && to ? reload : undefined} />}
        {loading && !data && !error && [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}

        {data && !error && (
          <div className={`space-y-4 transition-opacity ${loading ? 'opacity-50' : ''}`}>
            {data.results.length > 0 && (
              <p className="text-sm text-ink-500"><span className="font-semibold text-ink-950">{data.results.length}</span> of {data.facets.total_services} {noun} on this date</p>
            )}
            {data.results.map((s) => <ServiceCard key={s.schedule_id} s={s} passengers={passengers} />)}

            {data.results.length === 0 && data.facets.total_services > 0 && (
              <EmptyState icon={<SlidersHorizontal className="size-5" />} title="Nothing matches these filters"
                action={<Button variant="secondary" onClick={() => setFilters({ ...EMPTY, sort: filters.sort })}>Clear filters</Button>}>
                {data.facets.total_services} {noun} run on this date. Widen the time or fare range to see them.
              </EmptyState>
            )}

            {data.facets.total_services === 0 && (
              <EmptyState icon={data.next_dates.length ? <CalendarX2 className="size-5" /> : <SearchX className="size-5" />}
                title={`No ${noun} on this date`}
                action={
                  <div className="flex flex-wrap gap-2">
                    {data.next_dates.map((n) => (
                      <Button key={n.journey_date} variant="secondary" onClick={() => setDate(n.journey_date)}>
                        {formatDate(n.journey_date)} · {n.services} service{n.services > 1 ? 's' : ''}
                      </Button>
                    ))}
                    <Button variant="secondary" onClick={() => setMode(mode === 'BUS' ? 'TRAIN' : 'BUS')}>
                      Try {mode === 'BUS' ? 'trains' : 'buses'} instead
                    </Button>
                    <Link to="/#plan"><Button variant="ghost">New search</Button></Link>
                  </div>
                }>
                {data.next_dates.length
                  ? 'This route runs on other dates — pick one below.'
                  : `There is no ${mode === 'BUS' ? 'bus' : 'train'} service between these cities in the demo timetable.`}
              </EmptyState>
            )}
          </div>
        )}
        <DemoNotice className="pt-4" />
      </section>
    </div>
  );
}
