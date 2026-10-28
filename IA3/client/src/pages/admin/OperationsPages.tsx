import { Ban, Check, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ResourceManager, type FormValues } from '../../components/admin/ResourceManager';
import { Badge, Button, EmptyState, ErrorState, Field, Modal, Skeleton, StateBadge } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { useLookups } from '../../hooks/useLookups';
import { useToast } from '../../hooks/useToast';
import { BERTH_SHORT, formatDate, formatInstant, formatTime, money, moneyExact, todayIST } from '../../lib/format';
import { AdminHeader } from '../../layouts/AdminLayout';
import { api, errorMessage } from '../../services/api';
import type { Mode } from '../../types';

const MODE_OPTIONS = [{ value: 'BUS', label: 'Bus' }, { value: 'TRAIN', label: 'Train' }];
const toLocalInput = (wall: unknown) => String(wall ?? '').slice(0, 16).replace(' ', 'T');

export function SchedulesPage() {
  const { lookups } = useLookups();
  const serviceOptions = lookups.services.map((s) => ({ value: s.service_id, label: `${s.service_number} — ${s.service_name}` }));
  return (
    <>
      <AdminHeader title="Schedules"
        description="Dated runs of a service. Creating with “repeat” inserts many rows in one INSERT … SELECT generate_series(); dates that already exist are skipped by ON CONFLICT on UNIQUE(service_id, journey_date)." />
      <ResourceManager endpoint="/admin/schedules" idKey="schedule_id" noun="Schedule" searchPlaceholder="Service or city"
        initialFilters={{ date_from: todayIST() }}
        filters={[
          { name: 'service_id', label: 'Service', options: serviceOptions },
          { name: 'mode', label: 'Mode', options: MODE_OPTIONS },
          { name: 'status', label: 'Status', options: [{ value: 'SCHEDULED', label: 'Scheduled' }, { value: 'CANCELLED', label: 'Cancelled' }] },
          { name: 'date_from', label: 'From', type: 'date' },
          { name: 'date_to', label: 'To', type: 'date' },
        ]}
        defaults={{ repeat_days: 1, journey_date: todayIST() }}
        toForm={(r) => ({ departure_at: toLocalInput(r.departure_at), arrival_at: toLocalInput(r.arrival_at), status: String(r.status) })}
        deleteHint="Only a schedule that has never been booked can be deleted (bookings.schedule_id is ON DELETE RESTRICT). To stop sales, set its status to Cancelled."
        columns={[
          { key: 'journey_date', label: 'Date', render: (r) => <span className="font-semibold">{formatDate(String(r.journey_date))}</span> },
          { key: 'service', label: 'Service', render: (r) => <div><p className="font-semibold">{String(r.service_name)}</p><p className="font-mono text-xs text-ink-400">#{String(r.service_number)} · {String(r.origin_city)} → {String(r.destination_city)}</p></div> },
          { key: 'times', label: 'Departs → arrives', render: (r) => `${formatTime(String(r.departure_at))} → ${formatTime(String(r.arrival_at))}` },
          { key: 'occupancy', label: 'Booked seats', render: (r) => {
            const total = Number(r.total_seats); const booked = Number(r.booked_seats);
            const pct = total ? Math.round((booked / total) * 100) : 0;
            return (
              <div className="w-32">
                <div className="flex justify-between text-xs"><span>{booked}/{total}</span><span className="text-ink-400">{pct}%</span></div>
                <div className="mt-1 h-1.5 rounded-full bg-paper-200"><div className="h-full rounded-full bg-clay-500" style={{ width: `${pct}%` }} /></div>
              </div>
            );
          } },
          { key: 'confirmed_bookings', label: 'Bookings', className: 'text-right' },
          { key: 'status', label: 'Status', render: (r) => <StateBadge state={String(r.status)} /> },
        ]}
        fields={[
          { name: 'service_id', label: 'Service', type: 'select', required: true, options: serviceOptions, createOnly: true, wide: true },
          { name: 'journey_date', label: 'First journey date', type: 'date', required: true, createOnly: true },
          { name: 'departure_time', label: 'Departure time', type: 'time', required: true, createOnly: true },
          { name: 'duration_minutes', label: 'Duration (minutes)', type: 'number', min: 10, max: 2879, createOnly: true, hint: 'Leave blank to use the route estimate' },
          { name: 'repeat_days', label: 'Repeat for (days)', type: 'number', required: true, min: 1, max: 60, createOnly: true, hint: '1 = just this date' },
          { name: 'departure_at', label: 'Departure', type: 'datetime', required: true, editOnly: true },
          { name: 'arrival_at', label: 'Arrival', type: 'datetime', required: true, editOnly: true,
            validate: (v, f) => (String(v) <= String(f.departure_at) ? 'Arrival must be after departure' : null) },
          { name: 'status', label: 'Status', type: 'select', required: true, editOnly: true,
            options: [{ value: 'SCHEDULED', label: 'Scheduled (on sale)' }, { value: 'CANCELLED', label: 'Cancelled (withdrawn)' }],
            hint: 'A journey with confirmed bookings cannot be cancelled here' },
        ]} />
    </>
  );
}

interface CoachRow { coach_id: number; coach_code: string; layout_code: string; layout_name: string; class_code: string; class_name: string; seats: number; blocked_seats: number; reservations_ever: number }
interface SeatRow { seat_id: number; seat_number: string; berth_type: string; is_active: boolean; upcoming_reservations: number }

export function SeatConfigPage() {
  const toast = useToast();
  const { lookups } = useLookups();
  const [vehicleId, setVehicleId] = useState<number | null>(null);
  const [coachId, setCoachId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [newCoach, setNewCoach] = useState({ coach_code: '', layout_code: '' });
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<CoachRow | null>(null);
  const vehicle = lookups.vehicles.find((v) => v.vehicle_id === vehicleId);

  const coaches = useApi(() => (vehicleId ? api.get<CoachRow[]>(`/admin/vehicles/${vehicleId}/coaches`) : Promise.resolve([])), [vehicleId]);
  const seats = useApi(() => (coachId ? api.get<SeatRow[]>(`/admin/coaches/${coachId}/seats`) : Promise.resolve([])), [coachId]);

  const addCoach = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^[A-Za-z0-9]{1,8}$/.test(newCoach.coach_code) || !newCoach.layout_code) {
      toast.error('Enter a coach code (letters/digits) and choose a layout.');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/admin/vehicles/${vehicleId}/coaches`, newCoach);
      toast.success(`Coach ${newCoach.coach_code.toUpperCase()} added with its seats`);
      setAdding(false);
      setNewCoach({ coach_code: '', layout_code: '' });
      coaches.reload();
    } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  };

  const removeCoach = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.del(`/admin/coaches/${deleting.coach_id}`);
      toast.success(`Coach ${deleting.coach_code} removed`);
      if (coachId === deleting.coach_id) setCoachId(null);
      coaches.reload();
    } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); setDeleting(null); }
  };

  const toggleSeat = async (s: SeatRow) => {
    try {
      await api.patch(`/admin/seats/${s.seat_id}`, { is_active: !s.is_active });
      seats.setData((list) => list?.map((x) => (x.seat_id === s.seat_id ? { ...x, is_active: !x.is_active } : x)) ?? null);
      coaches.reload();
    } catch (err) { toast.error(errorMessage(err)); }
  };

  return (
    <>
      <AdminHeader title="Seats & coaches"
        description="Coaches (or bus decks) are generated by the add_coach() stored function from a layout template. A seat that was ever reserved cannot be deleted — block it instead." />
      <div className="card mb-6 flex flex-wrap items-end gap-4 p-5">
        <Field label="Vehicle" htmlFor="sc-vehicle">
          <select id="sc-vehicle" className="input w-80" value={vehicleId ?? ''} onChange={(e) => { setVehicleId(Number(e.target.value) || null); setCoachId(null); }}>
            <option value="">Choose a bus or train…</option>
            {(['BUS', 'TRAIN'] as Mode[]).map((m) => (
              <optgroup key={m} label={m === 'BUS' ? 'Buses' : 'Trains'}>
                {lookups.vehicles.filter((v) => v.transport_mode === m).map((v) => <option key={v.vehicle_id} value={v.vehicle_id}>{v.vehicle_number} — {v.vehicle_name}</option>)}
              </optgroup>
            ))}
          </select>
        </Field>
        {vehicle && <Button variant="secondary" onClick={() => setAdding(true)}><Plus className="size-4" /> Add {vehicle.transport_mode === 'BUS' ? 'deck / layout' : 'coach'}</Button>}
      </div>

      {!vehicleId ? (
        <EmptyState icon={<Check className="size-6" />} title="Pick a vehicle to see its seat configuration" />
      ) : coaches.error ? <ErrorState message={coaches.error} onRetry={coaches.reload} /> : (
        <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="table-head"><tr><th className="px-4 py-3">Coach</th><th className="px-4 py-3">Layout / class</th><th className="px-4 py-3 text-right">Seats</th><th className="px-4 py-3 text-right">Blocked</th><th className="px-4 py-3" /></tr></thead>
              <tbody className="divide-y divide-paper-100">
                {coaches.loading && <tr><td colSpan={5} className="p-4"><Skeleton className="h-6" /></td></tr>}
                {coaches.data?.map((c) => (
                  <tr key={c.coach_id} className={`cursor-pointer hover:bg-paper-50 ${coachId === c.coach_id ? 'bg-clay-50/60' : ''}`} onClick={() => setCoachId(c.coach_id)}>
                    <td className="px-4 py-3  font-bold">{c.coach_code}</td>
                    <td className="px-4 py-3"><p className="font-semibold">{c.class_name} ({c.class_code})</p><p className="text-xs text-ink-400">{c.layout_name}</p></td>
                    <td className="px-4 py-3 text-right">{c.seats}</td>
                    <td className="px-4 py-3 text-right">{c.blocked_seats || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={(e) => { e.stopPropagation(); setDeleting(c); }} className="rounded-lg p-1.5 text-ink-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Delete coach ${c.coach_code}`}>
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {coaches.data?.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-400">No coaches yet — add one to generate seats.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="card p-5">
            {!coachId ? <p className="py-10 text-center text-sm text-ink-400">Select a coach to view and block individual seats.</p> : (
              <>
                <h2 className="font-bold">Seats in {coaches.data?.find((c) => c.coach_id === coachId)?.coach_code}</h2>
                <p className="mt-0.5 mb-4 text-xs text-ink-400">Click a seat to block or unblock it. Blocked seats show as “Unavailable” to passengers; existing reservations stay valid.</p>
                {seats.loading ? <Skeleton className="h-40" /> : (
                  <div className="flex flex-wrap gap-1.5">
                    {seats.data?.map((s) => (
                      <button key={s.seat_id} onClick={() => toggleSeat(s)} title={`${s.upcoming_reservations} upcoming reservation(s)`}
                        className={`flex h-11 w-12 flex-col items-center justify-center rounded-lg border text-xs font-bold transition ${s.is_active ? 'border-clay-500/60 bg-white hover:bg-clay-50' : 'hatch border-paper-300 text-ink-300'}`}>
                        {s.is_active ? s.seat_number : <Ban className="size-3.5" />}
                        <span className="text-[9px] font-medium opacity-60">{s.is_active ? BERTH_SHORT[s.berth_type] : s.seat_number}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title={`Add to ${vehicle?.vehicle_number ?? ''}`}
        footer={<><Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button><Button type="submit" form="coach-form" loading={busy}>Generate seats</Button></>}>
        <form id="coach-form" onSubmit={addCoach} className="space-y-4" noValidate>
          <Field label="Coach / deck code" hint={vehicle?.transport_mode === 'BUS' ? 'MAIN for seaters, LOWER / UPPER for sleeper decks' : 'e.g. S3, B2, A1, H1, C4'} htmlFor="nc-code">
            <input id="nc-code" className="input  uppercase" maxLength={8} value={newCoach.coach_code} onChange={(e) => setNewCoach({ ...newCoach, coach_code: e.target.value })} />
          </Field>
          <Field label="Layout" htmlFor="nc-layout">
            <select id="nc-layout" className="input" value={newCoach.layout_code} onChange={(e) => setNewCoach({ ...newCoach, layout_code: e.target.value })}>
              <option value="">Select…</option>
              {lookups.layouts.filter((l) => l.transport_mode === vehicle?.transport_mode).map((l) => (
                <option key={l.layout_code} value={l.layout_code}>{l.layout_name} — {l.seat_count} seats</option>
              ))}
            </select>
          </Field>
          <p className="text-xs text-ink-400">The database rejects the coach if it would exceed the vehicle's capacity.</p>
        </form>
      </Modal>
      <Modal open={!!deleting} onClose={() => setDeleting(null)} title={`Delete coach ${deleting?.coach_code}?`}
        footer={<><Button variant="secondary" onClick={() => setDeleting(null)}>Keep</Button><Button variant="danger" loading={busy} onClick={removeCoach}>Delete coach</Button></>}>
        <p className="text-sm text-ink-600">Deletes the coach and its {deleting?.seats} seats in one transaction.</p>
        {deleting && deleting.reservations_ever > 0 && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Its seats have {deleting.reservations_ever} reservation record(s), so the foreign key will refuse this delete to protect booking history.</p>
        )}
      </Modal>
    </>
  );
}

export function FaresPage() {
  const toast = useToast();
  const { lookups } = useLookups();
  const fees = useApi(() => api.get<{ transport_mode: Mode; fee_per_passenger: number }[]>('/admin/booking-fees'), []);
  const history = useApi(() => api.get<Record<string, string | number>[]>('/admin/fare-history'), []);
  const [feeDraft, setFeeDraft] = useState<Record<string, string>>({});

  const saveFee = async (mode: Mode) => {
    const value = Number(feeDraft[mode]);
    if (Number.isNaN(value) || value < 0 || value > 1000) return toast.error('Fee must be between 0 and 1000');
    try {
      await api.put(`/admin/booking-fees/${mode}`, { fee_per_passenger: value });
      toast.success(`${mode === 'BUS' ? 'Bus' : 'Train'} booking fee updated`);
      fees.reload();
    } catch (err) { toast.error(errorMessage(err)); }
  };

  const serviceMode = (f: FormValues) => lookups.services.find((s) => String(s.service_id) === String(f.service_id))?.transport_mode;

  return (
    <>
      <AdminHeader title="Fares & fees"
        description="Fares are per (service, class). Changing a fare affects only NEW bookings: each ticket stores the fare charged in passengers.passenger_fare. Every change is logged by the trg_fare_history trigger." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        {fees.data?.map((f) => (
          <div key={f.transport_mode} className="card flex flex-wrap items-end justify-between gap-3 p-5">
            <div>
              <p className="label">{f.transport_mode === 'BUS' ? 'Bus' : 'Train'} booking fee / passenger</p>
              <p className="display text-3xl">{moneyExact(f.fee_per_passenger)}</p>
            </div>
            <div className="flex gap-2">
              <input type="number" min={0} max={1000} className="input w-28 py-2" placeholder="New fee" aria-label="New fee"
                value={feeDraft[f.transport_mode] ?? ''} onChange={(e) => setFeeDraft({ ...feeDraft, [f.transport_mode]: e.target.value })} />
              <Button variant="secondary" disabled={!feeDraft[f.transport_mode]} onClick={() => saveFee(f.transport_mode)}>Update</Button>
            </div>
          </div>
        ))}
      </div>

      <ResourceManager endpoint="/admin/fares" idKey="fare_rule_id" noun="Fare" searchPlaceholder="Service or city" onSaved={history.reload}
        filters={[{ name: 'mode', label: 'Mode', options: MODE_OPTIONS }]}
        toForm={(r) => ({ fare: Number(r.fare) })}
        deleteHint="Removing a fare takes that class off sale for the service. Existing tickets are unaffected because they keep their own fare."
        columns={[
          { key: 'service', label: 'Service', render: (r) => <div><p className="font-semibold">{String(r.service_name)}</p><p className="font-mono text-xs text-ink-400">#{String(r.service_number)} · {String(r.origin_city)} → {String(r.destination_city)}</p></div> },
          { key: 'class_name', label: 'Class', render: (r) => <span>{String(r.class_name)} <span className="text-ink-400">({String(r.class_code)})</span></span> },
          { key: 'fare', label: 'Fare', render: (r) => <span className="font-bold">{moneyExact(Number(r.fare))}</span> },
          { key: 'change_count', label: 'Changes', render: (r) => (Number(r.change_count) ? <Badge tone="amber">{String(r.change_count)}</Badge> : '—') },
          { key: 'updated_at', label: 'Last updated', render: (r) => <span className="text-xs">{formatInstant(String(r.updated_at))}</span> },
        ]}
        fields={[
          { name: 'service_id', label: 'Service', type: 'select', required: true, createOnly: true, wide: true,
            options: lookups.services.map((s) => ({ value: s.service_id, label: `${s.service_number} — ${s.service_name}` })) },
          { name: 'class_code', label: 'Class', type: 'select', required: true, createOnly: true,
            options: (f) => lookups.seat_classes.filter((c) => !serviceMode(f) || c.transport_mode === serviceMode(f)).map((c) => ({ value: c.class_code, label: c.class_name })) },
          { name: 'fare', label: 'Fare (₹ per passenger)', type: 'number', required: true, min: 0, max: 100000, step: 5 },
        ]} />

      <h2 className="mt-10 mb-3 text-lg font-bold">Fare change history <span className="text-sm font-normal text-ink-400">(fare_history, written by trigger)</span></h2>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead className="table-head"><tr><th className="px-4 py-3">When</th><th className="px-4 py-3">Service</th><th className="px-4 py-3">Class</th><th className="px-4 py-3 text-right">Old</th><th className="px-4 py-3 text-right">New</th></tr></thead>
          <tbody className="divide-y divide-paper-100">
            {history.data?.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-ink-400">No fare changes yet. Edit a fare above and it will appear here.</td></tr>}
            {history.data?.map((h) => (
              <tr key={h.fare_history_id}>
                <td className="px-4 py-2.5 text-xs">{formatInstant(String(h.changed_at))}</td>
                <td className="px-4 py-2.5">{h.service_number} {h.service_name}</td>
                <td className="px-4 py-2.5">{h.class_name}</td>
                <td className="px-4 py-2.5 text-right text-ink-400 line-through">{money(Number(h.old_fare))}</td>
                <td className="px-4 py-2.5 text-right font-semibold">{money(Number(h.new_fare))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
