import { Bus, Search, Ticket as TicketIcon, TrainFront, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CancelBookingModal } from '../components/CancelBookingModal';
import { Button, EmptyState, ErrorState, Skeleton, StateBadge } from '../components/ui';
import { useApi } from '../hooks/useApi';
import { useToast } from '../hooks/useToast';
import { formatDate, formatTime, money } from '../lib/format';
import { api, errorMessage } from '../services/api';
import type { BookingSummary, JourneyState, Mode, Ticket } from '../types';

const TABS: { state: JourneyState; label: string }[] = [
  { state: 'UPCOMING', label: 'Upcoming' },
  { state: 'COMPLETED', label: 'Past' },
  { state: 'CANCELLED', label: 'Cancelled' },
];

export function MyBookingsPage() {
  const toast = useToast();
  const [state, setState] = useState<JourneyState>('UPCOMING');
  const [mode, setMode] = useState<Mode | ''>('');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [cancelTarget, setCancelTarget] = useState<Ticket | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const { data, error, loading, reload } = useApi(
    () => api.get<{ bookings: BookingSummary[]; counts: Partial<Record<JourneyState, number>> }>('/bookings', {
      state: query ? null : state, mode: mode || null, q: query || null,
    }),
    [state, mode, query],
  );

  // The modal needs the refund quote, which comes with the full ticket.
  const startCancel = async (b: BookingSummary) => {
    setOpening(b.booking_reference);
    try {
      setCancelTarget(await api.get<Ticket>(`/bookings/${b.booking_reference}`));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setOpening(null);
    }
  };

  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    const value = q.trim().toUpperCase();
    if (value && !/^[A-Z0-9]{2,12}$/.test(value)) {
      toast.error('Search with a booking reference (TNT…) or App PNR — letters and digits only.');
      return;
    }
    setQuery(value);
  };

  return (
    <div className="px-4 pb-8 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4 pt-2">
        <div>
          <h1 className="display text-5xl text-ink-950">My Bookings</h1>
          <p className="mt-2 text-sm text-ink-500">Every journey booked from your account, read live from the database.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="input w-auto py-2" value={mode} onChange={(e) => setMode(e.target.value as Mode | '')} aria-label="Transport mode">
            <option value="">Bus &amp; train</option><option value="BUS">Bus only</option><option value="TRAIN">Train only</option>
          </select>
          <form onSubmit={submitSearch} className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" />
            <input className="input w-60 py-2 pl-9 uppercase placeholder:normal-case" placeholder="Search by booking reference"
              value={q} onChange={(e) => setQ(e.target.value)} maxLength={12} aria-label="Search by booking reference" />
            {query && <button type="button" onClick={() => { setQ(''); setQuery(''); }} className="absolute top-1/2 right-2 -translate-y-1/2 text-ink-400" aria-label="Clear search"><X className="size-4" /></button>}
          </form>
        </div>
      </header>

      <div className="mt-8 inline-flex gap-1 rounded-full border border-paper-200 bg-white p-1 shadow-card" role="tablist">
        {TABS.map((t) => (
          <button key={t.state} role="tab" aria-selected={!query && state === t.state}
            onClick={() => { setState(t.state); setQuery(''); setQ(''); }}
            className={`tab px-6 ${!query && state === t.state ? 'tab-active' : ''}`}>
            {t.label} <span className="ml-1 text-xs opacity-70">({data?.counts[t.state] ?? 0})</span>
          </button>
        ))}
      </div>
      {query && <p className="mt-4 text-sm text-ink-600">Results for <strong>“{query}”</strong> across all your bookings</p>}

      <div className="mt-6 max-w-4xl space-y-4">
        {loading && !data && [0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        {error && <ErrorState message={error} onRetry={reload} />}
        {data && data.bookings.length === 0 && (
          <EmptyState icon={<TicketIcon className="size-5" />}
            title={query ? 'No booking matches that reference' : state === 'UPCOMING' ? 'No upcoming journeys' : state === 'COMPLETED' ? 'No past journeys yet' : 'No cancelled bookings'}
            action={<Link to="/#plan"><Button variant="accent">Plan a journey</Button></Link>}>
            {state === 'UPCOMING' && !query ? 'Your next trip across Tamil Nadu will appear here as soon as you book it.' : 'Bookings appear here as soon as they are made.'}
          </EmptyState>
        )}

        <div className={`space-y-4 transition-opacity ${loading ? 'opacity-50' : ''}`}>
          {data?.bookings.map((b) => {
            const Icon = b.transport_mode === 'BUS' ? Bus : TrainFront;
            const cancelled = b.journey_state === 'CANCELLED';
            const seats = b.seat_list.replaceAll('MAIN-', '').replaceAll('LOWER-', '').replaceAll('UPPER-', '');
            return (
              <article key={b.booking_id} className="card animate-fade-up grid grid-cols-[3rem_1fr] gap-x-5 gap-y-4 p-5 transition hover:shadow-lift md:grid-cols-[3rem_minmax(0,1fr)_auto_auto] md:items-center">
                <Icon className={`size-10 ${cancelled ? 'text-ink-300' : 'text-clay-500'}`} strokeWidth={1.6} />
                <div className="min-w-0">
                  <p className={`text-lg font-semibold text-ink-950 ${cancelled ? 'line-through decoration-ink-300' : ''}`}>{b.origin_city} → {b.destination_city}</p>
                  <p className="mt-0.5 text-sm text-ink-600">{formatDate(b.departure_at, { day: 'numeric', month: 'short', year: 'numeric' })} · {formatTime(b.departure_at)}</p>
                  <p className="mt-0.5 text-sm text-ink-500">{b.service_name} · {b.service_type} · {b.transport_mode === 'BUS' ? 'Seats' : 'Berths'}: {seats}</p>
                  <p className="mt-1 text-xs text-ink-400">Ref {b.booking_reference} · {b.passenger_count} passenger{b.passenger_count > 1 ? 's' : ''}</p>
                </div>
                <div className="col-start-2 md:col-start-auto md:text-right">
                  <StateBadge state={b.journey_state === 'UPCOMING' ? 'CONFIRMED' : b.journey_state} />
                  <p className="mt-1 text-xl font-bold text-ink-950">{money(b.total_amount)}</p>
                  {b.refund_amount !== null && <p className="text-xs text-moss-600">Refunded {money(b.refund_amount)}</p>}
                </div>
                <div className="col-start-2 flex gap-2 md:col-start-auto">
                  <Link to={`/booking/${b.booking_reference}`} className="inline-flex items-center rounded-lg border border-clay-400 px-4 py-2 text-sm font-semibold text-clay-600 transition hover:bg-clay-50">View Ticket</Link>
                  {b.journey_state === 'UPCOMING' && (
                    <button disabled={opening === b.booking_reference} onClick={() => startCancel(b)} className="inline-flex items-center rounded-lg border border-clay-400 px-4 py-2 text-sm font-semibold text-clay-600 transition hover:bg-clay-50 disabled:opacity-60">{opening === b.booking_reference ? 'Opening…' : 'Cancel'}</button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {cancelTarget && (
        <CancelBookingModal open onClose={() => setCancelTarget(null)} reference={cancelTarget.booking_reference}
          quote={cancelTarget.refund_quote} baseAmount={cancelTarget.base_amount} feeAmount={cancelTarget.fee_amount}
          onCancelled={() => reload()} />
      )}
    </div>
  );
}