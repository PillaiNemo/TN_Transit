import { ArrowLeft, ArrowRight, Minus, Plus, RefreshCw, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { VehiclePicture } from '../components/Illustrations';
import { BookingSteps } from '../components/Journey';
import { BusDeck, CoachConsist, SeatLegend, TrainCoach } from '../components/SeatMap';
import { MAX_PASSENGERS } from '../components/SearchWidget';
import { Button, DemoNotice, ErrorState, Spinner } from '../components/ui';
import { AmenityIcon } from '../lib/amenities';
import { useApi } from '../hooks/useApi';
import { useToast } from '../hooks/useToast';
import { clearDraft, loadDraft, saveDraft } from '../lib/draft';
import { BERTH_LABELS, dayOffset, formatDate, formatDuration, formatTime, money } from '../lib/format';
import { api } from '../services/api';
import type { Seat, ServiceResult } from '../types';

const TRAIN_PREFS: Record<string, string[]> = {
  TRAIN_SL: ['LOWER', 'MIDDLE', 'UPPER', 'SIDE_LOWER', 'SIDE_UPPER'],
  TRAIN_3A: ['LOWER', 'MIDDLE', 'UPPER', 'SIDE_LOWER', 'SIDE_UPPER'],
  TRAIN_2A: ['LOWER', 'UPPER', 'SIDE_LOWER', 'SIDE_UPPER'],
  TRAIN_1A: ['LOWER', 'UPPER'],
  TRAIN_CC: ['WINDOW', 'AISLE', 'CENTER'],
};

export function SeatSelectionPage() {
  const { scheduleId: idParam } = useParams();
  const scheduleId = Number(idParam);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const schedule = useApi(() => api.get<ServiceResult>(`/schedules/${scheduleId}`), [scheduleId]);
  const seatMap = useApi(() => api.get<Seat[]>(`/schedules/${scheduleId}/seats`), [scheduleId]);

  const [limit, setLimit] = useState(() => Math.min(MAX_PASSENGERS, Math.max(1, Number(params.get('passengers')) || 1)));
  const [selected, setSelected] = useState<Set<number>>(() => new Set(loadDraft(scheduleId)?.seats.map((s) => s.seat_id) ?? []));
  const [classCode, setClassCode] = useState<string | null>(params.get('class'));
  const [coach, setCoach] = useState<string | null>(null);
  const [preference, setPreference] = useState<string | null>(null);

  const seats = seatMap.data ?? [];
  const isTrain = schedule.data?.transport_mode === 'TRAIN';

  // Group seats: class -> coach -> seats (already ordered by the SQL ORDER BY).
  const classes = useMemo(() => {
    const map = new Map<string, { class_code: string; class_name: string; fare: number | null; coaches: Map<string, Seat[]>; available: number }>();
    for (const s of seats) {
      if (!map.has(s.class_code)) map.set(s.class_code, { class_code: s.class_code, class_name: s.class_name, fare: s.fare, coaches: new Map(), available: 0 });
      const c = map.get(s.class_code)!;
      if (!c.coaches.has(s.coach_code)) c.coaches.set(s.coach_code, []);
      c.coaches.get(s.coach_code)!.push(s);
      if (s.status === 'AVAILABLE') c.available++;
    }
    return [...map.values()];
  }, [seats]);

  // If a previously selected seat got booked meanwhile (e.g. after refresh), drop it.
  useEffect(() => {
    if (!seats.length) return;
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => seats.find((s) => s.seat_id === id)?.status === 'AVAILABLE'));
      if (next.size < prev.size) toast.info('Some seats you picked earlier are no longer available and were removed.');
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seats]);

  const activeClass = classes.find((c) => c.class_code === classCode) ?? classes.find((c) => c.fare !== null) ?? classes[0];
  const coaches = activeClass ? [...activeClass.coaches.entries()] : [];
  const activeCoach = coaches.find(([code]) => code === coach) ?? coaches[0];
  const layout = activeCoach?.[1][0]?.layout_code;
  const selectedSeats = seats.filter((s) => selected.has(s.seat_id));
  const baseTotal = selectedSeats.reduce((sum, s) => sum + (s.fare ?? 0), 0);
  const fee = (schedule.data?.fee_per_passenger ?? 0) * selectedSeats.length;

  const toggle = (seat: Seat) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(seat.seat_id)) {
        next.delete(seat.seat_id);
      } else {
        if (next.size >= limit) {
          toast.info(`You can select ${limit} seat${limit > 1 ? 's' : ''} for ${limit} passenger${limit > 1 ? 's' : ''}. Increase passengers to add more.`);
          return prev;
        }
        next.add(seat.seat_id);
      }
      return next;
    });
  };

  const switchClass = (code: string) => {
    if (code === activeClass?.class_code) return;
    if (selected.size) toast.info('Seats from one class per booking — your selection was cleared.');
    setSelected(new Set());
    setClassCode(code);
    setCoach(null);
    setPreference(null);
  };

  // Pick the first free seats matching the berth preference across this class's coaches.
  const autoPick = () => {
    if (!activeClass) return;
    const pool = [...activeClass.coaches.values()].flat().filter((s) => s.status === 'AVAILABLE' && !selected.has(s.seat_id));
    const ranked = preference ? [...pool.filter((s) => s.berth_type === preference), ...pool.filter((s) => s.berth_type !== preference)] : pool;
    const needed = limit - selected.size;
    if (needed <= 0) return toast.info('You have already selected seats for every passenger.');
    const picks = ranked.slice(0, needed);
    if (!picks.length) return toast.error('No free seats left in this class.');
    setSelected((prev) => new Set([...prev, ...picks.map((s) => s.seat_id)]));
    if (picks[0]) setCoach(picks[0].coach_code);
    const matched = preference ? picks.filter((s) => s.berth_type === preference).length : picks.length;
    toast.success(preference && matched < picks.length
      ? `Picked ${picks.length} seats (${matched} matched your ${BERTH_LABELS[preference].toLowerCase()} preference).`
      : `Picked ${picks.length} seat${picks.length > 1 ? 's' : ''}.`);
  };

  const proceed = () => {
    saveDraft({
      schedule_id: scheduleId,
      seats: selectedSeats.map(({ seat_id, seat_number, coach_code, class_code, class_name, berth_type, fare }) =>
        ({ seat_id, seat_number, coach_code, class_code, class_name, berth_type, fare })),
    });
    navigate(`/checkout/${scheduleId}`);
  };

  if (schedule.loading || seatMap.loading) return <Spinner label="Loading seat map" />;
  if (schedule.error || seatMap.error || !schedule.data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <ErrorState message={schedule.error ?? seatMap.error ?? 'Not found'} />
        <p className="mt-4"><Link to="/#plan" className="link text-sm">Start a new search</Link></p>
      </div>
    );
  }
  const s = schedule.data;
  const offset = dayOffset(s.departure_at, s.arrival_at);

  return (
    <div className="mx-auto max-w-[88rem] px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-950">
          <ArrowLeft className="size-4" /> Back
        </button>
        <BookingSteps current={0} />
        <span className="hidden w-16 lg:block" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[19rem_minmax(0,1fr)_19rem]">
        {/* ---------------------------------------------- Journey card */}
        <aside className="space-y-5 lg:col-span-2 xl:sticky xl:top-24 xl:col-span-1 xl:h-fit">
          <div className="card overflow-hidden p-4">
            <div className="h-36 overflow-hidden rounded-xl"><VehiclePicture mode={s.transport_mode} className="block h-full w-full" /></div>
            <div className="px-1 pt-4">
              <p className="text-xl font-bold text-ink-950">{s.service_name}</p>
              <p className="text-sm text-ink-500">{isTrain ? `#${s.service_number}` : s.operator_name} · {s.service_type}</p>
              <div className="mt-4 grid grid-cols-[auto_auto_auto] items-center justify-between gap-2">
                <div><p className="figure text-lg font-semibold">{formatTime(s.departure_at)}</p><p className="text-xs text-ink-500">{s.origin_city}</p></div>
                <ArrowRight className="size-5 text-ink-400" />
                <div className="text-right"><p className="figure text-lg font-semibold">{formatTime(s.arrival_at)}{offset > 0 && <sup className="text-xs text-clay-600"> +1</sup>}</p><p className="text-xs text-ink-500">{s.destination_city}</p></div>
              </div>
              <p className="mt-2 text-xs text-ink-500">{formatDuration(s.duration_minutes)} · Direct · {formatDate(s.departure_at, { day: 'numeric', month: 'short' })}</p>
              {!isTrain && (
                <p className="mt-4 border-t border-paper-200 pt-4"><span className="text-2xl font-bold text-ink-950">{money(s.min_fare)}</span><span className="block text-xs text-ink-500">per seat</span></p>
              )}
              {s.amenities.length > 0 && !isTrain && (
                <ul className="mt-4 space-y-2 border-t border-paper-200 pt-4">
                  {s.amenities.map((a) => <li key={a} className="flex items-center gap-2.5 text-sm text-ink-700"><AmenityIcon name={a} className="size-4 text-clay-600" /> {a}</li>)}
                </ul>
              )}
            </div>

            {isTrain && (
              <div className="mt-4 border-t border-paper-200 px-1 pt-4">
                <h2 className="mb-2 text-sm font-semibold text-ink-950">Select Coach</h2>
                <div className="space-y-2" role="radiogroup" aria-label="Class">
                  {classes.map((c) => {
                    const on = c.class_code === activeClass?.class_code;
                    return (
                      <button key={c.class_code} role="radio" aria-checked={on} disabled={c.fare === null} onClick={() => switchClass(c.class_code)}
                        className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition disabled:opacity-40 ${on ? 'border-slate-600 bg-slate-50' : 'border-paper-200 hover:border-slate-300'}`}>
                        <span className={`flex size-5 shrink-0 items-center justify-center rounded-md border-2 text-[11px] text-white ${on ? 'border-slate-700 bg-slate-700' : 'border-paper-300'}`}>{on ? '✓' : ''}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-ink-950">{c.class_code} - {c.class_name}</span>
                          <span className="text-[11px] text-ink-500">{c.available} available</span>
                        </span>
                        <span className="text-sm font-semibold">{money(c.fare)}</span>
                      </button>
                    );
                  })}
                </div>
                {layout && TRAIN_PREFS[layout] && (
                  <div className="mt-4">
                    <label className="label" htmlFor="pref">Berth preference</label>
                    <select id="pref" className="input py-2" value={preference ?? ''} onChange={(e) => setPreference(e.target.value || null)}>
                      <option value="">No preference</option>
                      {TRAIN_PREFS[layout].map((p) => <option key={p} value={p}>{BERTH_LABELS[p]}</option>)}
                    </select>
                    <Button variant="secondary" className="mt-3 w-full" onClick={autoPick}><Sparkles className="size-4" /> Auto-select {limit - selected.size > 0 ? `${limit - selected.size} ` : ''}best berths</Button>
                    {preference && <p className="mt-2 text-xs text-ink-500">Matching free berths are ringed in maroon.</p>}
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* ---------------------------------------------- Seat map */}
        <section className={`min-w-0 space-y-5 ${isTrain ? 'card p-5' : ''}`}>
          {isTrain ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-ink-950">{activeClass?.class_name} Coach - {activeCoach?.[0]}</h2>
                <Button variant="ghost" size="sm" onClick={seatMap.reload}><RefreshCw className="size-3.5" /> Refresh</Button>
              </div>
              <CoachConsist selected={selected} active={activeCoach?.[0]} onPick={setCoach}
                coaches={coaches.map(([code, list]) => ({ code, classCode: activeClass!.class_code, seats: list, free: list.filter((x) => x.status === 'AVAILABLE').length }))} />
              {activeCoach && (
                <>
                  <TrainCoach seats={activeCoach[1]} selected={selected} onToggle={toggle} preference={preference} />
                  <p className="text-center text-xs text-ink-500">Coach {activeCoach[0]} · {activeCoach[1].length} berths · LB MB UB = lower, middle, upper · SL SU = side lower, side upper</p>
                </>
              )}
              <div className="flex justify-center"><SeatLegend /></div>
            </>
          ) : (
            <>
              <div className="flex justify-end"><Button variant="ghost" size="sm" onClick={seatMap.reload}><RefreshCw className="size-3.5" /> Refresh availability</Button></div>
              <div className="flex flex-wrap justify-center gap-8">
                {coaches.map(([code, list]) => (
                  <BusDeck key={code} seats={list} selected={selected} onToggle={toggle}
                    title={code === 'LOWER' ? 'Lower deck' : code === 'UPPER' ? 'Upper deck' : 'Seats'}
                    sleeper={list[0]?.layout_code === 'BUS_SLEEPER'} />
                ))}
              </div>
            </>
          )}
          <DemoNotice className="text-center" />
        </section>

        {/* ---------------------------------------------- Selection summary */}
        <aside className="lg:sticky lg:top-24 lg:h-fit">
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink-950">Selected {isTrain ? 'Berths' : 'Seats'}</h2>
              <div className="flex items-center gap-1 rounded-full border border-paper-300 px-1">
                <button className="p-1 text-ink-600 disabled:text-ink-200" aria-label="Fewer passengers" disabled={limit <= 1}
                  onClick={() => {
                    const next = limit - 1;
                    setLimit(next);
                    if (selected.size > next) setSelected(new Set([...selected].slice(0, next)));
                  }}><Minus className="size-3.5" /></button>
                <span className="w-12 text-center text-xs font-medium text-ink-700">{selected.size}/{limit} pax</span>
                <button className="p-1 text-ink-600 disabled:text-ink-200" aria-label="More passengers" disabled={limit >= MAX_PASSENGERS}
                  onClick={() => setLimit(limit + 1)}><Plus className="size-3.5" /></button>
              </div>
            </div>

            {selectedSeats.length === 0 ? (
              <p className="mt-4 rounded-xl bg-paper-50 px-4 py-6 text-center text-sm text-ink-500">Choose up to {limit} {isTrain ? 'berth' : 'seat'}{limit > 1 ? 's' : ''} on the map.</p>
            ) : isTrain ? (
              <ul className="mt-4 space-y-2">
                {selectedSeats.map((x) => (
                  <li key={x.seat_id} className="flex items-center gap-3 rounded-xl border border-paper-200 px-3 py-2">
                    <span className="flex size-5 items-center justify-center rounded-md bg-slate-700 text-[11px] text-white">✓</span>
                    <span className="flex-1 text-sm"><span className="font-semibold text-ink-950">{x.coach_code}-{x.seat_number}</span> <span className="text-xs text-ink-500">{BERTH_LABELS[x.berth_type]}</span><span className="block text-xs text-ink-500">{money(x.fare)}</span></span>
                    <button onClick={() => toggle(x)} className="rounded-lg p-1 text-ink-400 hover:bg-rose-50 hover:text-rose-700" aria-label={`Remove seat ${x.seat_number}`}><X className="size-4" /></button>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="mt-4 flex flex-wrap gap-2">
                {selectedSeats.map((x) => (
                  <li key={x.seat_id}>
                    <button onClick={() => toggle(x)} title="Remove" aria-label={`Remove seat ${x.seat_number}`}
                      className="flex h-10 min-w-10 items-center justify-center rounded-lg bg-slate-700 px-2 text-sm font-semibold text-white hover:bg-rose-700">
                      {x.seat_number}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {!isTrain && <div className="mt-6 border-t border-paper-200 pt-5"><SeatLegend vertical /></div>}

            <dl className="mt-6 space-y-1.5 border-t border-paper-200 pt-5 text-sm">
              <div className="flex justify-between text-ink-600"><dt>Fare × {selectedSeats.length}</dt><dd>{money(baseTotal)}</dd></div>
              <div className="flex justify-between text-ink-600"><dt>Booking fee ({money(s.fee_per_passenger)} each)</dt><dd>{money(fee)}</dd></div>
              <div className="pt-2"><dt className="text-sm text-ink-500">Total Fare</dt><dd className="text-3xl font-bold text-ink-950">{money(baseTotal + fee)}</dd></div>
            </dl>
            <Button variant="accent" size="lg" className="mt-5 w-full" disabled={!selectedSeats.length} onClick={proceed}>
              Proceed <ArrowRight className="size-4" />
            </Button>
            {selected.size > 0 && (
              <button onClick={() => { setSelected(new Set()); clearDraft(scheduleId); }} className="mt-3 w-full text-center text-xs font-medium text-ink-500 hover:text-ink-900">Clear selection</button>
            )}
            <p className="mt-3 text-[11px] leading-relaxed text-ink-400">Seats aren't held while you continue — the database re-checks availability when you confirm.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
