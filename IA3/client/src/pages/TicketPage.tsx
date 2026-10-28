import { ArrowLeft, ArrowRight, Bus, Info, Printer, TrainFront } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { CancelBookingModal } from '../components/CancelBookingModal';
import { BookingSteps } from '../components/Journey';
import { ScenePhoto, VehiclePicture } from '../components/Illustrations';
import { Logo } from '../components/Logo';
import { Button, EmptyState, ErrorState, Spinner, StateBadge } from '../components/ui';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../hooks/useAuth';
import { BERTH_LABELS, GENDER_LABELS, dayOffset, formatDate, formatDuration, formatInstant, formatTime, moneyExact, seatLabel } from '../lib/format';
import { tamilName } from '../lib/places';
import { api } from '../services/api';
import type { Ticket } from '../types';

/** Decorative bars derived from the reference characters — the same reference always draws the same pattern. */
function ReferenceBars({ value }: { value: string }) {
  const bars = [...value].flatMap((ch) => {
    const n = ch.charCodeAt(0);
    return [1 + (n % 3), 1 + ((n >> 2) % 2), 1 + ((n >> 3) % 3), 1];
  });
  let x = 0;
  return (
    <svg viewBox={`0 0 ${bars.reduce((a, b) => a + b, 0)} 20`} preserveAspectRatio="none" className="h-12 w-full" aria-hidden="true">
      {bars.map((w, i) => {
        const rect = i % 2 === 0 ? <rect key={i} x={x} y="0" width={w} height="20" className="fill-ink-950" /> : null;
        x += w;
        return rect;
      })}
    </svg>
  );
}

export function TicketPage() {
  const { reference = '' } = useParams();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const isNew = params.get('new') === '1';
  const [cancelOpen, setCancelOpen] = useState(false);
  const { data: t, error, loading, reload } = useApi(() => api.get<Ticket>(`/bookings/${reference.toUpperCase()}`), [reference]);

  if (loading) return <Spinner label="Loading ticket" />;
  if (error || !t) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        {error?.includes('not found')
          ? <EmptyState icon={<Info className="size-5" />} title="We couldn't find that booking"
              action={<Link to="/bookings"><Button variant="secondary">Go to My Bookings</Button></Link>}>
              Check the reference. You can only open bookings made from your own account.
            </EmptyState>
          : <ErrorState message={error ?? 'Not found'} onRetry={reload} />}
      </div>
    );
  }

  const cancelled = t.booking_status === 'CANCELLED';
  const Icon = t.transport_mode === 'BUS' ? Bus : TrainFront;
  const offset = dayOffset(t.departure_at, t.arrival_at);
  const duration = Math.round((Date.parse(t.arrival_at.replace(' ', 'T') + 'Z') - Date.parse(t.departure_at.replace(' ', 'T') + 'Z')) / 60000);
  const status = cancelled ? 'CANCELLED' : t.journey_state === 'UPCOMING' ? 'CONFIRMED' : 'COMPLETED';

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="no-print mb-8 flex flex-wrap items-center justify-between gap-4">
        <Link to="/bookings" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-950"><ArrowLeft className="size-4" /> My Bookings</Link>
        {isNew && <BookingSteps current={2} />}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => window.print()}><Printer className="size-4" /> Print / PDF</Button>
          {t.journey_state === 'UPCOMING' && <Button variant="danger" onClick={() => setCancelOpen(true)}>Cancel booking</Button>}
        </div>
      </div>

      {isNew && !cancelled && (
        <div className="no-print mb-12 grid items-center gap-10 lg:grid-cols-[1fr_1.05fr]">
          <div className="text-center lg:text-left">
            <svg viewBox="0 0 64 64" className="mx-auto size-20 lg:mx-0" style={{ animation: 'pop-in 0.5s ease-out both' }} aria-hidden="true">
              <circle cx="32" cy="32" r="30" className="fill-slate-700" />
              <path d="M19 33 L28 42 L46 23" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray="40" style={{ animation: 'check-draw 0.5s 0.35s ease-out both' }} />
            </svg>
            <h1 className="display mt-5 text-5xl text-ink-950">Booking Confirmed!</h1>
            <p className="mx-auto mt-3 max-w-md text-[15px] text-ink-600 lg:mx-0">
              Your journey from <strong className="text-ink-900">{t.origin_city}</strong> to <strong className="text-ink-900">{t.destination_city}</strong> is confirmed.
              Your reference is <strong className="text-ink-900">{t.booking_reference}</strong> (demo — no email is sent).
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3 lg:justify-start">
              <Button variant="primary" size="lg" onClick={() => window.print()}><Printer className="size-4" /> Download Ticket</Button>
              <Link to="/bookings"><Button variant="secondary" size="lg">View My Bookings</Button></Link>
            </div>
            <p className="script mt-5 text-2xl text-clay-500">Have a safe journey! <span className="tamil font-sans text-base text-ink-500">இனிய பயணம்!</span></p>
            <ScenePhoto scene="station-platform" className="mt-6 hidden aspect-[2/1] w-full max-w-md rounded-2xl shadow-md lg:block" />
          </div>

          {/* Compact ticket card */}
          <div className="relative overflow-hidden rounded-2xl border border-paper-200 bg-white shadow-lift">
            <div className="flex items-start justify-between border-b border-dashed border-paper-300 px-6 py-5">
              <div><Logo subtitle={false} /><p className="mt-1 text-xs text-ink-500">{t.transport_mode === 'BUS' ? 'Bus' : 'Train'} Ticket</p></div>
              <p className="text-xs font-semibold tracking-wide text-ink-700">{t.booking_reference}</p>
            </div>
            <div className="px-6 py-5">
              <p className="flex items-center gap-3 text-2xl font-bold text-ink-950">{t.origin_city} <ArrowRight className="size-5 text-ink-400" /> {t.destination_city}</p>
              <dl className="mt-5 grid grid-cols-3 gap-x-4 gap-y-4 text-sm">
                <div><dt className="text-xs text-ink-500">Date</dt><dd className="font-semibold">{formatDate(t.departure_at, { day: 'numeric', month: 'short', year: 'numeric' })}</dd></div>
                <div><dt className="text-xs text-ink-500">Departure</dt><dd className="font-semibold">{formatTime(t.departure_at)}</dd></div>
                <div><dt className="text-xs text-ink-500">Arrival</dt><dd className="font-semibold">{formatTime(t.arrival_at)}</dd></div>
                <div><dt className="text-xs text-ink-500">Operator</dt><dd className="font-semibold">{t.operator_name}</dd></div>
                <div><dt className="text-xs text-ink-500">{t.transport_mode === 'BUS' ? 'Bus Type' : 'Class'}</dt><dd className="font-semibold">{t.transport_mode === 'BUS' ? t.service_type : t.passengers[0]?.class_name}</dd></div>
                <div><dt className="text-xs text-ink-500">Seats</dt><dd className="font-semibold">{t.passengers.map((p) => (p.coach_code === 'MAIN' || p.coach_code === 'LOWER' || p.coach_code === 'UPPER' ? p.seat_number : `${p.coach_code}-${p.seat_number}`)).join(', ')}</dd></div>
              </dl>
              <div className="mt-5 flex items-end justify-between gap-4">
                <div className="w-48"><ReferenceBars value={t.booking_reference + t.pnr_reference} /></div>
                <div className="text-right"><p className="text-xs text-ink-500">Total paid</p><p className="text-2xl font-bold">{moneyExact(t.total_amount)}</p></div>
              </div>
            </div>
            <div className="h-28 overflow-hidden"><VehiclePicture mode={t.transport_mode} align="bottom" className="block h-full w-full" /></div>
          </div>
        </div>
      )}
      {cancelled && (
        <div className="mb-8 border-l-2 border-rose-600 bg-rose-50/70 px-5 py-4 text-sm text-rose-900">
          <p className="font-semibold">Cancelled{t.cancelled_at ? ` on ${formatInstant(t.cancelled_at)}` : ''}.</p>
          <p>Refund of {moneyExact(t.refund_amount)} ({t.refund_percent}%) processed (demo).{t.cancellation_reason ? ` Reason: ${t.cancellation_reason}.` : ''} The seats were released for other travellers.</p>
        </div>
      )}

      {/* ---------------------------------------------------------------- Pass */}
      <article className="print-plain grid overflow-hidden rounded-2xl border border-paper-200 bg-white shadow-card md:grid-cols-[minmax(0,1fr)_15rem]" aria-label="E-ticket">
        <div className="min-w-0">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-paper-200 px-6 py-4">
            <Logo subtitle={false} />
            <p className="flex items-center gap-2 text-xs font-medium text-ink-600">
              <Icon className="size-4" /> {t.transport_mode === 'BUS' ? 'Bus' : 'Rail'} e-ticket · demonstration
            </p>
            <StateBadge state={status} />
          </header>

          <section className="px-6 pt-6 pb-5">
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-4">
              <div className="min-w-0">
                <p className="label">From</p>
                <p className="display truncate text-4xl leading-none text-ink-950 sm:text-[44px]">{t.origin_city}</p>
                <p className="tamil mt-1 text-sm text-ink-400">{tamilName(t.origin_city)}</p>
              </div>
              <span className="mb-6  text-2xl text-clay-500" aria-hidden="true">⟶</span>
              <div className="min-w-0 text-right">
                <p className="label">To</p>
                <p className="display truncate text-4xl leading-none text-ink-950 sm:text-[44px]">{t.destination_city}</p>
                <p className="tamil mt-1 text-sm text-ink-400">{tamilName(t.destination_city)}</p>
              </div>
            </div>
          </section>

          <dl className="grid grid-cols-2 border-y border-paper-200 bg-paper-50 sm:grid-cols-4">
            {[
              ['Date', formatDate(t.departure_at, { day: 'numeric', month: 'short', year: 'numeric' }), formatDate(t.departure_at, { weekday: 'long' })],
              ['Departs', formatTime(t.departure_at), `${t.origin_code}`],
              ['Arrives', `${formatTime(t.arrival_at)}${offset > 0 ? ` +${offset}` : ''}`, `${t.destination_code}`],
              ['Duration', formatDuration(duration), `${t.distance_km} km`],
            ].map(([label, value, sub], i) => (
              <div key={label} className={`px-6 py-4 ${i % 2 ? 'border-l border-ink-200' : ''} ${i >= 2 ? 'border-t border-ink-200 sm:border-t-0' : ''} ${i === 2 ? 'sm:border-l' : ''}`}>
                <dt className="label">{label}</dt>
                <dd className="figure text-xl font-medium text-ink-950">{value}</dd>
                {sub && <dd className="font-mono text-[10.5px] uppercase text-ink-500">{sub}</dd>}
              </div>
            ))}
          </dl>

          <section className="grid gap-x-6 gap-y-1 px-6 py-4 text-sm sm:grid-cols-2">
            <p><span className="label inline">Service </span><span className="font-medium text-ink-950">{t.service_name}</span> <span className="font-mono text-xs text-ink-500">{t.service_number}</span></p>
            <p><span className="label inline">Operator </span>{t.operator_name} · <span className="text-clay-700">{t.service_type}</span></p>
            <p className="truncate" title={t.origin_station}><span className="label inline">Boarding </span>{t.origin_station}</p>
            <p className="truncate" title={t.destination_station}><span className="label inline">Alighting </span>{t.destination_station}</p>
            <p className="text-xs text-ink-500">{t.vehicle_name} · {t.vehicle_number}</p>
          </section>

          <section className="border-t border-paper-200 px-6 py-5">
            <h2 className="label">Passengers</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[30rem] text-sm">
                <thead className="table-head"><tr>
                  <th className="py-2 pr-3 font-medium">#</th><th className="py-2 pr-3 font-medium">Name</th><th className="py-2 pr-3 font-medium">Age · Gender</th>
                  <th className="py-2 pr-3 font-medium">Class</th><th className="py-2 pr-3 font-medium">{t.transport_mode === 'TRAIN' ? 'Coach · berth' : 'Seat'}</th>
                  <th className="py-2 text-right font-medium">Fare</th>
                </tr></thead>
                <tbody className="divide-y divide-ink-200">
                  {t.passengers.map((p, i) => (
                    <tr key={p.passenger_id}>
                      <td className="figure py-2.5 pr-3 text-ink-400">{i + 1}</td>
                      <td className="py-2.5 pr-3 font-medium text-ink-950">{p.passenger_name}</td>
                      <td className="py-2.5 pr-3">{p.age} · {GENDER_LABELS[p.gender]}</td>
                      <td className="py-2.5 pr-3">{p.class_code} <span className="text-ink-500">{p.class_name}</span></td>
                      <td className={`figure py-2.5 pr-3 font-semibold ${p.reservation_status === 'RELEASED' ? 'text-ink-300 line-through' : 'text-ink-950'}`}>
                        {seatLabel(p.coach_code, p.seat_number)} <span className="font-sans font-normal text-ink-500">{BERTH_LABELS[p.berth_type]}</span>
                      </td>
                      <td className="figure py-2.5 text-right">{moneyExact(p.passenger_fare)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <footer className="border-t border-dashed border-ink-300 px-6 py-4 text-[11px] leading-relaxed text-ink-500">
            Carry a photo ID matching the passenger name. Report 30 minutes before departure. Booked by {t.booked_by} · {t.contact_email} · {t.contact_phone}.
            Generated by a college DBMS demonstration — not valid for travel.
          </footer>
        </div>

        {/* Stub, separated by a perforation */}
        <aside className="relative border-t-2 border-dashed border-paper-300 bg-paper-50 px-6 py-6 md:border-t-0 md:border-l-2">
          <span className="absolute -top-[11px] -left-[11px] hidden size-5 rounded-full border border-paper-200 bg-paper-50 md:block" style={{ clipPath: 'inset(50% 0 0 50%)' }} aria-hidden="true" />
          <span className="absolute -bottom-[11px] -left-[11px] hidden size-5 rounded-full border border-paper-200 bg-paper-50 md:block" style={{ clipPath: 'inset(0 0 50% 50%)' }} aria-hidden="true" />
          <p className="label">Booking reference</p>
          <p className="figure text-2xl font-semibold tracking-[0.08em] text-ink-950">{t.booking_reference}</p>
          <p className="label mt-5">App PNR</p>
          <p className="figure text-lg text-ink-950">{t.pnr_reference}</p>
          <p className="mt-0.5 text-[10.5px] leading-snug text-ink-500">Application-generated reference, not an official railway PNR</p>
          <div className="mt-5"><ReferenceBars value={t.booking_reference + t.pnr_reference} /></div>
          <dl className="mt-5 space-y-1.5 border-t border-paper-300 pt-4 text-sm">
            <div className="flex justify-between"><dt className="text-ink-600">Fare × {t.passengers.length}</dt><dd className="figure">{moneyExact(t.base_amount)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-600">Booking fee</dt><dd className="figure">{moneyExact(t.fee_amount)}</dd></div>
            <div className="flex items-baseline justify-between border-t border-dashed border-ink-300 pt-2"><dt className="font-semibold">Total paid</dt><dd className="figure text-lg font-medium">{moneyExact(t.total_amount)}</dd></div>
            {cancelled && <div className="flex justify-between font-medium text-moss-700"><dt>Refunded</dt><dd className="figure">{moneyExact(t.refund_amount)}</dd></div>}
          </dl>
          <p className="mt-5 text-xs font-medium text-ink-500">Booked {formatInstant(t.booked_at)}</p>
          <p className="text-xs font-medium text-ink-500">{t.payment_status === 'DEMO_PAID' ? 'Demo payment received' : 'Demo refund issued'}</p>
        </aside>
      </article>

      {t.journey_state === 'UPCOMING' && user && (
        <CancelBookingModal open={cancelOpen} onClose={() => setCancelOpen(false)} reference={t.booking_reference}
          quote={t.refund_quote} baseAmount={t.base_amount} feeAmount={t.fee_amount} onCancelled={reload} />
      )}
    </div>
  );
}