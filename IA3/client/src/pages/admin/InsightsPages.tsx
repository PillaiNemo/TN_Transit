import { ArrowRight, Ban, Bus, ClipboardList, Code2, IndianRupee, Play, RefreshCw, TicketX, TrainFront, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CancelBookingModal } from '../../components/CancelBookingModal';
import { Badge, Button, EmptyState, ErrorState, Skeleton, StateBadge } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../hooks/useToast';
import { compactNumber, formatDate, formatInstant, formatTime, money, moneyExact } from '../../lib/format';
import { AdminHeader } from '../../layouts/AdminLayout';
import { api, errorMessage } from '../../services/api';
import type { BookingSummary, Ticket } from '../../types';

// Categorical palette validated with the dataviz validator (light surface): bus, train.
const SERIES = { bus: '#3e62a0', train: '#b8693f' };

interface Dashboard {
  totals: {
    total_bookings: number; confirmed_bookings: number; cancelled_bookings: number; total_passengers: number;
    confirmed_revenue: number; avg_booking_value: number; cancellation_rate: number; active_services: number; total_refunds: number;
  };
  daily: { day: string; bus: number; train: number; revenue: number }[];
  byMode: { transport_mode: 'BUS' | 'TRAIN'; bookings: number; confirmed: number; cancelled: number; passengers: number; revenue: number }[];
  topRoutes: { route_id: number; transport_mode: string; origin_city: string; destination_city: string; confirmed_bookings: number; passengers_carried: number; confirmed_revenue: number }[];
  popularDestinations: { destination_city: string; bookings: number; passengers: number }[];
  occupancy: { schedule_id: number; service_number: string; service_name: string; departure_at: string; origin_city: string; destination_city: string; total_seats: number; booked_seats: number; occupancy_pct: number }[];
  recent: { booking_reference: string; booked_by: string; transport_mode: string; service_number: string; origin_city: string; destination_city: string; departure_at: string; total_amount: number; booking_status: string; booked_at: string; passenger_count: number }[];
}

function StatTile({ label, value, sub, icon: Icon }: { label: string; value: string; sub?: string; icon: typeof Users }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{label}</p>
        <Icon className="size-4 text-ink-300" />
      </div>
      <p className="mt-2 figure text-3xl font-medium text-ink-950">{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-500">{sub}</p>}
    </div>
  );
}

function DailyTooltip({ active, payload, label }: { active?: boolean; payload?: { dataKey: string; value: number }[]; label?: string }) {
  if (!active || !payload?.length || !label) return null;
  const bus = payload.find((p) => p.dataKey === 'bus')?.value ?? 0;
  const train = payload.find((p) => p.dataKey === 'train')?.value ?? 0;
  return (
    <div className="rounded border border-paper-200 bg-white px-3 py-2.5 text-xs shadow-lift">
      <p className="mb-1.5 font-bold text-ink-900">{formatDate(label, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
      {[['Bus', bus, SERIES.bus], ['Train', train, SERIES.train]].map(([name, v, color]) => (
        <p key={name as string} className="flex items-center gap-2 text-ink-600">
          <span className="size-2.5 rounded-sm" style={{ background: color as string }} /> {name}
          <span className="ml-auto pl-4 font-semibold text-ink-900">{v}</span>
        </p>
      ))}
      <p className="mt-1 border-t border-paper-100 pt-1 font-semibold text-ink-900">Total {bus + train}</p>
    </div>
  );
}

export function DashboardPage() {
  const { data, error, loading, reload } = useApi(() => api.get<Dashboard>('/admin/dashboard'), []);
  const [showTable, setShowTable] = useState(false);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  const t = data?.totals;
  const maxDest = Math.max(1, ...(data?.popularDestinations.map((d) => d.bookings) ?? [1]));

  return (
    <>
      <AdminHeader title="Dashboard" description="Every figure below is computed live by SQL aggregate queries (COUNT, SUM, AVG, GROUP BY, HAVING, FILTER) — nothing is hardcoded."
        actions={<Button variant="secondary" onClick={reload} loading={loading}><RefreshCw className="size-4" /> Refresh</Button>} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {!t ? Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-28" />) : <>
          <StatTile label="Total bookings" value={t.total_bookings.toLocaleString('en-IN')} sub={`${t.confirmed_bookings.toLocaleString('en-IN')} confirmed`} icon={ClipboardList} />
          <StatTile label="Confirmed revenue" value={`₹${compactNumber(t.confirmed_revenue)}`} sub={moneyExact(t.confirmed_revenue)} icon={IndianRupee} />
          <StatTile label="Passengers" value={t.total_passengers.toLocaleString('en-IN')} sub="on confirmed bookings" icon={Users} />
          <StatTile label="Active services" value={String(t.active_services)} sub="bus + rail, shown in search" icon={TrainFront} />
          <StatTile label="Confirmed" value={t.confirmed_bookings.toLocaleString('en-IN')} icon={ClipboardList} />
          <StatTile label="Cancelled" value={t.cancelled_bookings.toLocaleString('en-IN')} sub={`${t.cancellation_rate}% cancellation rate`} icon={TicketX} />
          <StatTile label="Avg booking value" value={money(t.avg_booking_value)} sub="confirmed bookings" icon={IndianRupee} />
          <StatTile label="Refunds issued" value={money(t.total_refunds)} sub="demo refunds" icon={Ban} />
        </>}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <section className="card p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-bold">Bookings per day, by mode</h2>
              <p className="text-xs text-ink-400">Last 14 days, by booking date (IST)</p>
            </div>
            <button onClick={() => setShowTable((s) => !s)} className="text-xs font-semibold text-clay-700 hover:underline">{showTable ? 'Show chart' : 'Show as table'}</button>
          </div>
          {!data ? <Skeleton className="h-72" /> : showTable ? (
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="table-head sticky top-0"><tr><th className="px-3 py-2">Day</th><th className="px-3 py-2 text-right">Bus</th><th className="px-3 py-2 text-right">Train</th><th className="px-3 py-2 text-right">Revenue</th></tr></thead>
                <tbody className="divide-y divide-paper-100">{data.daily.map((d) => (
                  <tr key={d.day}><td className="px-3 py-1.5">{formatDate(d.day)}</td><td className="px-3 py-1.5 text-right">{d.bus}</td><td className="px-3 py-1.5 text-right">{d.train}</td><td className="px-3 py-1.5 text-right">{money(d.revenue)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          ) : (
            <div className="h-72" role="img" aria-label="Stacked bar chart of bus and train bookings per day for the last 14 days">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.daily} margin={{ top: 8, right: 4, left: -16, bottom: 0 }} barCategoryGap="22%">
                  <CartesianGrid vertical={false} stroke="#e6e3dc" />
                  <XAxis dataKey="day" tickLine={false} axisLine={{ stroke: '#ddd4c2' }} tick={{ fontSize: 11, fill: '#6b6962' }}
                    tickFormatter={(d: string) => formatDate(d, { day: 'numeric', month: 'short' })} interval="preserveStartEnd" minTickGap={12} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#6b6962' }} />
                  <Tooltip content={<DailyTooltip />} cursor={{ fill: '#f5efe3' }} />
                  <Legend verticalAlign="top" align="right" height={28} iconType="square" iconSize={10}
                    formatter={(v: string) => <span className="text-xs font-medium text-ink-600">{v}</span>} />
                  <Bar dataKey="bus" name="Bus" stackId="mode" fill={SERIES.bus} stroke="#fbf8f1" strokeWidth={2} />
                  <Bar dataKey="train" name="Train" stackId="mode" fill={SERIES.train} stroke="#fbf8f1" strokeWidth={2} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="card p-5">
          <h2 className="font-bold">Bus vs railway</h2>
          <p className="mb-4 text-xs text-ink-400">GROUP BY transport_mode over booking_summary_view</p>
          <div className="space-y-3">
            {!data ? <Skeleton className="h-40" /> : data.byMode.map((m) => {
              const Icon = m.transport_mode === 'BUS' ? Bus : TrainFront;
              const share = data.totals.confirmed_revenue ? Math.round((m.revenue / data.totals.confirmed_revenue) * 100) : 0;
              return (
                <div key={m.transport_mode} className="rounded border border-paper-200 p-4">
                  <div className="flex items-center justify-between">
                    <p className="flex items-center gap-2 font-semibold"><Icon className="size-4 text-ink-400" /> {m.transport_mode === 'BUS' ? 'Bus' : 'Train'}</p>
                    <p className="text-lg font-semibold">{money(m.revenue)}</p>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-paper-100">
                    <div className="h-full rounded-full" style={{ width: `${share}%`, background: m.transport_mode === 'BUS' ? SERIES.bus : SERIES.train }} />
                  </div>
                  <p className="mt-2 text-xs text-ink-500">{share}% of revenue · {m.confirmed} confirmed · {m.cancelled} cancelled · {m.passengers} passengers</p>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-bold">Most booked routes</h2>
          <p className="mb-3 text-xs text-ink-400">route_booking_summary_view</p>
          <table className="w-full text-sm">
            <thead className="table-head"><tr><th className="px-3 py-2">Route</th><th className="px-3 py-2 text-right">Bookings</th><th className="px-3 py-2 text-right">Passengers</th><th className="px-3 py-2 text-right">Revenue</th></tr></thead>
            <tbody className="divide-y divide-paper-100">
              {data?.topRoutes.map((r) => (
                <tr key={r.route_id}>
                  <td className="px-3 py-2"><span className="font-semibold">{r.origin_city} → {r.destination_city}</span> <Badge tone={r.transport_mode === 'BUS' ? 'amber' : 'navy'} className="ml-1">{r.transport_mode === 'BUS' ? 'Bus' : 'Train'}</Badge></td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.confirmed_bookings}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.passengers_carried}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(r.confirmed_revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data && <Skeleton className="h-40" />}
        </section>

        <section className="card p-5">
          <h2 className="font-bold">Popular destinations</h2>
          <p className="mb-4 text-xs text-ink-400">Confirmed bookings · GROUP BY destination HAVING COUNT(*) ≥ 10</p>
          <ul className="space-y-2.5">
            {data?.popularDestinations.map((d) => (
              <li key={d.destination_city} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-3 text-sm" title={`${d.bookings} bookings · ${d.passengers} passengers`}>
                <span className="truncate font-medium">{d.destination_city}</span>
                <span className="h-5 rounded-r-[4px] bg-ink-500/85" style={{ width: `${(d.bookings / maxDest) * 100}%` }} />
                <span className="text-right tabular-nums text-ink-600">{d.bookings}</span>
              </li>
            ))}
          </ul>
          {!data && <Skeleton className="h-40" />}
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.3fr]">
        <section className="card p-5">
          <h2 className="font-bold">Fullest upcoming journeys</h2>
          <p className="mb-4 text-xs text-ink-400">Seat occupancy per schedule, next 3 days</p>
          <ul className="space-y-3">
            {data?.occupancy.map((o) => (
              <li key={o.schedule_id}>
                <div className="flex justify-between gap-3 text-sm">
                  <span className="truncate"><span className="font-semibold">{o.service_name}</span> <span className="text-ink-400">· {formatDate(o.departure_at)} {formatTime(o.departure_at)}</span></span>
                  <span className="shrink-0 tabular-nums font-semibold">{o.occupancy_pct}%</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-paper-100"><div className="h-full rounded-full bg-clay-600" style={{ width: `${o.occupancy_pct}%` }} /></div>
                <p className="mt-0.5 text-[11px] text-ink-400">{o.booked_seats}/{o.total_seats} seats · {o.origin_city} → {o.destination_city}</p>
              </li>
            ))}
          </ul>
        </section>
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">Latest bookings</h2>
            <Link to="/admin/bookings" className="flex items-center gap-1 text-xs font-semibold text-clay-700 hover:underline">All bookings <ArrowRight className="size-3.5" /></Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[30rem] text-sm">
              <tbody className="divide-y divide-paper-100">
                {data?.recent.map((r) => (
                  <tr key={r.booking_reference}>
                    <td className="py-2 pr-3"><Link to={`/booking/${r.booking_reference}`} className="font-mono text-xs font-semibold text-ink-700 hover:underline">{r.booking_reference}</Link><p className="text-xs text-ink-400">{formatInstant(r.booked_at)}</p></td>
                    <td className="py-2 pr-3"><p className="font-medium">{r.origin_city} → {r.destination_city}</p><p className="text-xs text-ink-400">{r.booked_by} · {r.passenger_count} pax</p></td>
                    <td className="py-2 pr-3 text-right font-semibold">{money(r.total_amount)}</td>
                    <td className="py-2 text-right"><StateBadge state={r.booking_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}

interface ReportMeta { key: string; title: string; concepts: string[]; sql: string }
interface ReportResult extends ReportMeta { columns: string[]; rows: Record<string, unknown>[]; elapsed_ms: number }

export function ReportsPage() {
  const list = useApi(() => api.get<ReportMeta[]>('/admin/reports'), []);
  const [active, setActive] = useState<string | null>(null);
  const result = useApi(() => (active ? api.get<ReportResult>(`/admin/reports/${active}`) : Promise.resolve(null)), [active]);
  const meta = list.data?.find((r) => r.key === active);

  return (
    <>
      <AdminHeader title="SQL reports" description="Each report runs the exact SQL shown, against the live database. Useful for demonstrating joins, aggregation, subqueries, views and triggers during a viva." />
      <div className="grid gap-6 lg:grid-cols-[19rem_1fr]">
        <nav className="space-y-1.5" aria-label="Reports">
          {list.loading && <Skeleton className="h-80" />}
          {list.data?.map((r) => (
            <button key={r.key} onClick={() => setActive(r.key)}
              className={`w-full rounded border px-4 py-3 text-left transition ${active === r.key ? 'border-ink-800 bg-ink-800 text-white' : 'border-paper-200 bg-white hover:border-ink-200'}`}>
              <p className="text-sm font-semibold">{r.title}</p>
              <p className={`mt-1 text-[11px] ${active === r.key ? 'text-ink-200' : 'text-ink-400'}`}>{r.concepts.join(' · ')}</p>
            </button>
          ))}
        </nav>
        <div className="min-w-0 space-y-4">
          {!active ? <EmptyState icon={<Code2 className="size-6" />} title="Choose a report">The query and its live result appear here.</EmptyState> : <>
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-paper-200 px-4 py-2.5">
                <p className="text-sm font-bold">{meta?.title}</p>
                <Button size="sm" variant="secondary" onClick={result.reload} loading={result.loading}><Play className="size-3.5" /> Run again</Button>
              </div>
              <pre className="overflow-x-auto bg-ink-950 px-4 py-4  text-[12.5px] leading-relaxed text-ink-100">{meta?.sql}</pre>
            </div>
            {result.error && <ErrorState message={result.error} />}
            {result.data && (
              <div className="card overflow-hidden">
                <p className="border-b border-paper-200 px-4 py-2.5 text-xs text-ink-500">{result.data.rows.length} row(s) · {result.data.elapsed_ms.toFixed(1)} ms</p>
                <div className="max-h-[28rem] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="table-head sticky top-0"><tr>{result.data.columns.map((c) => <th key={c} className="px-4 py-2  normal-case">{c}</th>)}</tr></thead>
                    <tbody className="divide-y divide-paper-100">
                      {result.data.rows.map((row, i) => (
                        <tr key={i}>{result.data!.columns.map((c) => <td key={c} className="px-4 py-2 tabular-nums">{row[c] === null ? <span className="text-ink-300">NULL</span> : String(row[c])}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>}
        </div>
      </div>
    </>
  );
}

export function BookingRecordsPage() {
  const toast = useToast();
  const [filters, setFilters] = useState({ q: '', status: '', mode: '', state: '', date_from: '', date_to: '' });
  const [applied, setApplied] = useState(filters);
  const [cancelTarget, setCancelTarget] = useState<Ticket | null>(null);
  const { data, error, loading, reload } = useApi(
    () => api.get<{ bookings: BookingSummary[]; total_matches: number }>('/admin/bookings', applied), [JSON.stringify(applied)]);

  const openCancel = async (ref: string) => {
    try { setCancelTarget(await api.get<Ticket>(`/bookings/${ref}`)); } catch (err) { toast.error(errorMessage(err)); }
  };
  const set = (k: keyof typeof filters, v: string) => {
    const next = { ...filters, [k]: v };
    setFilters(next);
    if (k !== 'q') setApplied(next);
  };

  return (
    <>
      <AdminHeader title="Booking records" description="All reservations from booking_summary_view. Admins can open any ticket and cancel on a passenger's behalf (the same cancel_booking() function runs)." />
      <form className="card mb-4 flex flex-wrap items-end gap-3 p-4" onSubmit={(e) => { e.preventDefault(); setApplied(filters); }}>
        <input className="input w-64 py-2" placeholder="Reference, PNR, email, name, service" value={filters.q} onChange={(e) => set('q', e.target.value)} aria-label="Search bookings" />
        <select className="input w-auto py-2" value={filters.status} onChange={(e) => set('status', e.target.value)} aria-label="Status">
          <option value="">Status: all</option><option value="CONFIRMED">Confirmed</option><option value="CANCELLED">Cancelled</option>
        </select>
        <select className="input w-auto py-2" value={filters.state} onChange={(e) => set('state', e.target.value)} aria-label="Journey">
          <option value="">Journey: all</option><option value="UPCOMING">Upcoming</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option>
        </select>
        <select className="input w-auto py-2" value={filters.mode} onChange={(e) => set('mode', e.target.value)} aria-label="Mode">
          <option value="">Mode: all</option><option value="BUS">Bus</option><option value="TRAIN">Train</option>
        </select>
        <label className="text-xs font-semibold text-ink-500">Journey from <input type="date" className="input mt-1 w-auto py-2" value={filters.date_from} onChange={(e) => set('date_from', e.target.value)} /></label>
        <label className="text-xs font-semibold text-ink-500">to <input type="date" className="input mt-1 w-auto py-2" value={filters.date_to} onChange={(e) => set('date_to', e.target.value)} /></label>
        <Button type="submit" variant="secondary">Search</Button>
      </form>
      {error && <ErrorState message={error} onRetry={reload} />}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="table-head"><tr>
            <th className="px-4 py-3">Reference</th><th className="px-4 py-3">Passenger account</th><th className="px-4 py-3">Journey</th>
            <th className="px-4 py-3">Seats</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" />
          </tr></thead>
          <tbody className={`divide-y divide-paper-100 ${loading ? 'opacity-50' : ''}`}>
            {!data && loading && <tr><td colSpan={7} className="p-4"><Skeleton className="h-8" /></td></tr>}
            {data?.bookings.map((b) => (
              <tr key={b.booking_id} className="hover:bg-paper-50">
                <td className="px-4 py-3"><p className="font-mono text-xs font-bold">{b.booking_reference}</p><p className="font-mono text-[11px] text-ink-400">PNR {b.pnr_reference}</p></td>
                <td className="px-4 py-3"><p className="font-medium">{b.booked_by}</p><p className="text-xs text-ink-400">{b.user_email}</p></td>
                <td className="px-4 py-3"><p className="font-medium">{b.origin_city} → {b.destination_city}</p><p className="text-xs text-ink-400">#{b.service_number} · {formatDate(b.departure_at)} {formatTime(b.departure_at)}</p></td>
                <td className="px-4 py-3 text-xs">{b.passenger_count} · {b.seat_list.replaceAll('MAIN-', '')}</td>
                <td className="px-4 py-3 text-right font-semibold">{money(b.total_amount)}</td>
                <td className="px-4 py-3"><StateBadge state={b.journey_state} /></td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Link to={`/booking/${b.booking_reference}`} className="mr-2 text-xs font-semibold text-clay-700 hover:underline">Ticket</Link>
                  {b.journey_state === 'UPCOMING' && <button onClick={() => openCancel(b.booking_reference)} className="text-xs font-semibold text-rose-600 hover:underline">Cancel</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && <p className="border-t border-paper-100 px-4 py-2.5 text-xs text-ink-400">Showing {data.bookings.length} of {data.total_matches} matching bookings (newest first, max 200)</p>}
      </div>
      {cancelTarget && (
        <CancelBookingModal open onClose={() => setCancelTarget(null)} reference={cancelTarget.booking_reference} quote={cancelTarget.refund_quote}
          baseAmount={cancelTarget.base_amount} feeAmount={cancelTarget.fee_amount} onCancelled={() => reload()} />
      )}
    </>
  );
}

interface CancellationRow {
  cancellation_id: number; booking_reference: string; cancelled_at: string; cancellation_reason: string | null; refund_percent: number;
  refund_amount: number; total_amount: number; service_number: string; service_name: string; origin_city: string; destination_city: string;
  departure_at: string; transport_mode: string; passenger_count: number; booked_by: string; cancelled_by_name: string; cancelled_by_role: string;
}

export function CancellationsPage() {
  const [q, setQ] = useState('');
  const [mode, setMode] = useState('');
  const [applied, setApplied] = useState('');
  const { data, error, reload } = useApi(
    () => api.get<{ cancellations: CancellationRow[]; summary: { cancellations: number; total_refunded: number; avg_refund_percent: number; last_7_days: number } }>('/admin/cancellations', { q: applied || null, mode: mode || null }),
    [applied, mode]);
  const s = data?.summary;
  return (
    <>
      <AdminHeader title="Cancellation records" description="cancellations joined with booking_summary_view. Bookings are never deleted; their seats are released (seat_reservations.status = RELEASED)." />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {!s ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />) : <>
          <StatTile label="Cancellations" value={String(s.cancellations)} icon={TicketX} />
          <StatTile label="Refunded" value={money(s.total_refunded)} icon={IndianRupee} />
          <StatTile label="Avg refund" value={`${s.avg_refund_percent ?? 0}%`} sub="of fare" icon={IndianRupee} />
          <StatTile label="Last 7 days" value={String(s.last_7_days)} icon={Ban} />
        </>}
      </div>
      <form className="mb-4 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); setApplied(q.trim()); }}>
        <input className="input w-64 py-2" placeholder="Reference, passenger, service" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search cancellations" />
        <select className="input w-auto py-2" value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Mode"><option value="">Mode: all</option><option value="BUS">Bus</option><option value="TRAIN">Train</option></select>
        <Button type="submit" variant="secondary">Search</Button>
      </form>
      {error && <ErrorState message={error} onRetry={reload} />}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[52rem] text-sm">
          <thead className="table-head"><tr>
            <th className="px-4 py-3">Cancelled</th><th className="px-4 py-3">Booking</th><th className="px-4 py-3">Journey</th>
            <th className="px-4 py-3">Reason</th><th className="px-4 py-3 text-right">Paid</th><th className="px-4 py-3 text-right">Refund</th><th className="px-4 py-3">By</th>
          </tr></thead>
          <tbody className="divide-y divide-paper-100">
            {data?.cancellations.map((c) => (
              <tr key={c.cancellation_id}>
                <td className="px-4 py-3 text-xs">{formatInstant(c.cancelled_at)}</td>
                <td className="px-4 py-3"><Link to={`/booking/${c.booking_reference}`} className="font-mono text-xs font-bold hover:underline">{c.booking_reference}</Link><p className="text-xs text-ink-400">{c.booked_by} · {c.passenger_count} pax</p></td>
                <td className="px-4 py-3"><p>{c.origin_city} → {c.destination_city}</p><p className="text-xs text-ink-400">#{c.service_number} · {formatDate(c.departure_at)}</p></td>
                <td className="px-4 py-3 text-xs">{c.cancellation_reason ?? '—'}</td>
                <td className="px-4 py-3 text-right">{money(c.total_amount)}</td>
                <td className="px-4 py-3 text-right font-semibold text-clay-700">{money(c.refund_amount)} <span className="text-xs font-normal text-ink-400">({c.refund_percent}%)</span></td>
                <td className="px-4 py-3 text-xs">{c.cancelled_by_name}{c.cancelled_by_role === 'ADMIN' && <Badge tone="amber" className="ml-1">Admin</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.cancellations.length === 0 && <p className="px-4 py-8 text-center text-sm text-ink-400">No cancellations match.</p>}
      </div>
    </>
  );
}
