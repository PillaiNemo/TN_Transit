import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AmenityIcon } from '../lib/amenities';
import { dayOffset, formatDuration, formatTime, money } from '../lib/format';
import type { ServiceResult } from '../types';

export function seatsTone(available: number, total: number) {
  if (available === 0) return 'text-rose-700';
  if (available / Math.max(total, 1) < 0.15 || available <= 5) return 'text-amber-700';
  return 'text-moss-600';
}

/** One journey in the results list: timeline, operator, amenities, fare and the action. */
export function ServiceCard({ s, passengers }: { s: ServiceResult; passengers: number }) {
  const offset = dayOffset(s.departure_at, s.arrival_at);
  const notOnSale = s.min_fare === null;
  const soldOut = s.available_seats < passengers;
  const seatLink = (cls?: string) => `/book/${s.schedule_id}?passengers=${passengers}${cls ? `&class=${cls}` : ''}`;

  return (
    <article className="card animate-fade-up overflow-hidden transition hover:shadow-lift">
      <div className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-4 p-5 md:grid-cols-[auto_minmax(0,1.1fr)_minmax(0,1fr)_auto_auto] md:items-center">
        {/* timeline dot */}
        <span className="relative row-span-4 flex w-3 justify-center self-stretch md:row-span-1" aria-hidden="true">
          <span className="absolute top-1 bottom-1 w-px bg-paper-300" />
          <span className="relative mt-1.5 size-3 rounded-full border-2 border-slate-700 bg-white" />
        </span>

        {/* times */}
        <div>
          <div className="flex items-center gap-3 text-lg font-semibold text-ink-950">
            <span className="figure">{formatTime(s.departure_at)}</span>
            <ArrowRight className="size-4 text-ink-400" />
            <span className="figure">{formatTime(s.arrival_at)}{offset > 0 && <sup className="ml-0.5 text-xs text-clay-600">+{offset}</sup>}</span>
          </div>
          <p className="mt-0.5 max-w-xs truncate text-xs text-ink-500" title={`${s.origin_station} → ${s.destination_station}`}>
            {s.origin_station} → {s.destination_station}
          </p>
          <p className="mt-1 text-xs text-ink-500">{formatDuration(s.duration_minutes)} · Direct · {s.distance_km} km</p>
        </div>

        {/* operator */}
        <div className="col-start-2 md:col-start-auto">
          <p className="text-base font-semibold text-ink-950">{s.service_name} <span className="text-xs font-normal text-ink-400">{s.service_number}</span></p>
          <p className="text-sm text-ink-600">{s.operator_name} · {s.service_type}</p>
          {s.amenities.length > 0 && (
            <p className="mt-2 flex flex-wrap gap-2.5 text-ink-500" title={s.amenities.join(', ')}>
              {s.amenities.map((a) => <AmenityIcon key={a} name={a} />)}
            </p>
          )}
        </div>

        {/* fare */}
        <div className="col-start-2 md:col-start-auto md:text-right">
          <p className="text-xl font-bold text-ink-950">{money(s.min_fare)}</p>
          <p className={`text-xs font-medium ${seatsTone(s.available_seats, s.total_seats)}`}>
            {notOnSale ? 'Not on sale' : s.available_seats === 0 ? 'Sold out' : `${s.available_seats} seats left`}
          </p>
        </div>

        {/* action */}
        <div className="col-start-2 md:col-start-auto">
          {soldOut || notOnSale ? (
            <span className="inline-block rounded-lg border border-dashed border-paper-300 px-4 py-2.5 text-sm text-ink-400">
              {notOnSale ? 'Unavailable' : `Only ${s.available_seats} left`}
            </span>
          ) : (
            <Link to={seatLink()} aria-label={`Choose seats on ${s.service_name} at ${formatTime(s.departure_at)}`}
              className="inline-flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-slate-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 md:w-auto">
              View Seats <ArrowRight className="size-4" />
            </Link>
          )}
        </div>
      </div>

      {s.transport_mode === 'TRAIN' && s.classes.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-paper-200 bg-paper-50 px-5 py-3">
          {s.classes.map((c) => {
            const full = c.available_seats < passengers;
            return (
              <Link key={c.class_code} to={full ? '#' : seatLink(c.class_code)} aria-disabled={full}
                onClick={(e) => { if (full) e.preventDefault(); }}
                className={`min-w-32 rounded-xl border bg-white px-3 py-2 transition ${full ? 'cursor-not-allowed border-paper-200 opacity-50' : 'border-paper-300 hover:border-slate-500'}`}>
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-semibold">{c.class_code}</span>
                  <span className="text-sm font-semibold">{money(c.fare)}</span>
                </span>
                <span className="block text-[11px] text-ink-500">{c.class_name}</span>
                <span className={`text-[11px] font-medium ${full ? '' : seatsTone(c.available_seats, c.total_seats)}`}>
                  {c.available_seats === 0 ? 'Sold out' : `${c.available_seats} available`}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </article>
  );
}
