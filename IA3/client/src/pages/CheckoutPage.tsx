import { AlertTriangle, ArrowLeft, Lock, UserRound } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { BookingSteps, JourneyStrip } from '../components/Journey';
import { Button, DemoNotice, ErrorState, Field, Spinner } from '../components/ui';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { clearDraft, loadDraft, saveDraft } from '../lib/draft';
import { BERTH_LABELS, moneyExact, seatLabel } from '../lib/format';
import { ApiError, api } from '../services/api';
import type { Gender, Meta, Seat, ServiceResult } from '../types';

interface PassengerForm { passenger_name: string; age: string; gender: Gender | '' }
type Errors = Record<string, string>;

export function CheckoutPage() {
  const { scheduleId: idParam } = useParams();
  const scheduleId = Number(idParam);
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const draft = useMemo(() => loadDraft(scheduleId), [scheduleId]);

  const schedule = useApi(() => api.get<ServiceResult>(`/schedules/${scheduleId}`), [scheduleId]);
  const seatMap = useApi(() => api.get<Seat[]>(`/schedules/${scheduleId}/seats`), [scheduleId]);
  const meta = useApi(() => api.get<Meta>('/meta'), []);

  const [passengers, setPassengers] = useState<PassengerForm[]>(() =>
    (draft?.seats ?? []).map(() => ({ passenger_name: '', age: '', gender: '' })));
  const [contact, setContact] = useState({ email: user?.email ?? '', phone: user?.phone ?? '' });
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);

  // Seats in the draft that have been taken since they were picked.
  const stale = useMemo(() => {
    if (!seatMap.data || !draft) return [];
    return draft.seats.filter((d) => seatMap.data!.find((s) => s.seat_id === d.seat_id)?.status !== 'AVAILABLE');
  }, [seatMap.data, draft]);

  useEffect(() => {
    if (stale.length) setConflict(`Seat ${stale.map((s) => `${s.coach_code}-${s.seat_number}`).join(', ')} is no longer available.`);
  }, [stale]);

  if (!draft || draft.seats.length === 0) return <Navigate to={`/book/${scheduleId}`} replace />;
  if (schedule.loading || seatMap.loading) return <Spinner label="Preparing checkout" />;
  if (schedule.error || !schedule.data) {
    return <div className="mx-auto max-w-3xl px-4 py-12"><ErrorState message={schedule.error ?? 'Journey not found'} /></div>;
  }
  const s = schedule.data;
  const seats = draft.seats;
  const baseTotal = seats.reduce((sum, x) => sum + (x.fare ?? 0), 0);
  const feeEach = s.fee_per_passenger ?? 0;
  const fee = feeEach * seats.length;

  const setP = (i: number, field: keyof PassengerForm, value: string) => {
    setPassengers((list) => list.map((p, j) => (j === i ? { ...p, [field]: value } : p)));
    setErrors((e) => ({ ...e, [`${i}.${field}`]: '' }));
  };

  const validate = () => {
    const e: Errors = {};
    passengers.forEach((p, i) => {
      const name = p.passenger_name.trim();
      if (name.length < 2) e[`${i}.passenger_name`] = 'Enter the full name (at least 2 letters)';
      else if (!/^\p{L}[\p{L}\p{M} .'-]*$/u.test(name)) e[`${i}.passenger_name`] = 'Use letters, spaces, dots or hyphens only';
      const age = Number(p.age);
      if (!p.age) e[`${i}.age`] = 'Age is required';
      else if (!Number.isInteger(age) || age < 1 || age > 120) e[`${i}.age`] = 'Age must be between 1 and 120';
      if (!p.gender) e[`${i}.gender`] = 'Select gender';
    });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.email.trim())) e.email = 'Enter a valid email address';
    if (!/^[6-9]\d{9}$/.test(contact.phone.trim())) e.phone = 'Enter a 10-digit mobile number starting with 6–9';
    if (!agree) e.agree = 'Please accept the demo terms and cancellation policy';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!validate()) {
      toast.error('Please fix the highlighted fields.');
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setSubmitting(true);
    setConflict(null);
    try {
      const booking = await api.post<{ booking_reference: string }>('/bookings', {
        schedule_id: scheduleId,
        contact_email: contact.email.trim(),
        contact_phone: contact.phone.trim(),
        passengers: passengers.map((p, i) => ({
          passenger_name: p.passenger_name.trim(), age: Number(p.age), gender: p.gender, seat_id: seats[i].seat_id,
        })),
      });
      clearDraft(scheduleId);
      toast.success('Booking confirmed!');
      navigate(`/booking/${booking.booking_reference}?new=1`, { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Booking failed';
      if (err instanceof ApiError && err.status === 409) {
        setConflict(message);
        seatMap.reload();
      }
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const chooseOtherSeats = () => {
    const staleIds = new Set(stale.map((x) => x.seat_id));
    saveDraft({ schedule_id: scheduleId, seats: seats.filter((x) => !staleIds.has(x.seat_id)) });
    navigate(`/book/${scheduleId}?passengers=${seats.length}`);
  };

  const policy = meta.data?.cancellation_policy ?? [];
  const sectionHead = (n: string, title: string, note?: string) => (
    <div className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="flex size-7 items-center justify-center rounded-full bg-clay-500 text-xs font-semibold text-white">{Number(n)}</span>
      <h2 className="text-xl font-semibold text-ink-950">{title}</h2>
      {note && <p className="text-xs text-ink-500">{note}</p>}
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <Link to={`/book/${scheduleId}?passengers=${seats.length}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-950">
          <ArrowLeft className="size-4" /> Change seats
        </Link>
        <BookingSteps current={1} />
      </div>
      <h1 className="display text-4xl text-ink-950 sm:text-5xl">Who's travelling?</h1>
      <p className="mt-2 text-sm text-ink-600">Names must match the photo ID carried on the journey.</p>

      {conflict && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-l-2 border-amber-600 bg-amber-50 px-4 py-3" role="alert">
          <p className="flex items-start gap-2 text-sm text-amber-900"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> {conflict}</p>
          <Button variant="secondary" size="sm" onClick={chooseOtherSeats}>Choose other seats</Button>
        </div>
      )}

      <form onSubmit={submit} noValidate className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-12">
          <section className="card p-6">
            {sectionHead('01', 'Passengers', `${seats.length} seat${seats.length > 1 ? 's' : ''} selected`)}
            <div className="divide-y divide-ink-200">
              {passengers.map((p, i) => {
                const seat = seats[i];
                const err = (f: string) => errors[`${i}.${f}`];
                return (
                  <fieldset key={seat.seat_id} className="grid gap-4 py-5 first:pt-0 md:grid-cols-[8rem_1fr]">
                    <legend className="sr-only">Passenger {i + 1}</legend>
                    <div>
                      <p className="figure text-2xl font-medium text-ink-950">{seatLabel(seat.coach_code, seat.seat_number)}</p>
                      <p className="text-xs text-ink-500">{BERTH_LABELS[seat.berth_type]} · {seat.class_code}</p>
                      <p className="figure text-xs text-ink-700">{moneyExact(seat.fare)}</p>
                    </div>
                    <div>
                      <div className="grid gap-4 sm:grid-cols-[1fr_6rem_9rem]">
                        <Field label={`Passenger ${i + 1} · full name`} error={err('passenger_name')} htmlFor={`p${i}-name`}>
                          <input id={`p${i}-name`} className={`input ${err('passenger_name') ? 'input-error' : ''}`} autoComplete={i === 0 ? 'name' : 'off'}
                            aria-invalid={!!err('passenger_name')} value={p.passenger_name} maxLength={100}
                            onChange={(e) => setP(i, 'passenger_name', e.target.value)} placeholder="As on ID card" />
                        </Field>
                        <Field label="Age" error={err('age')} htmlFor={`p${i}-age`}>
                          <input id={`p${i}-age`} type="number" inputMode="numeric" min={1} max={120} className={`input ${err('age') ? 'input-error' : ''}`}
                            aria-invalid={!!err('age')} value={p.age} onChange={(e) => setP(i, 'age', e.target.value)} />
                        </Field>
                        <Field label="Gender" error={err('gender')} htmlFor={`p${i}-gender`}>
                          <select id={`p${i}-gender`} className={`input ${err('gender') ? 'input-error' : ''}`} aria-invalid={!!err('gender')}
                            value={p.gender} onChange={(e) => setP(i, 'gender', e.target.value)}>
                            <option value="">Select</option><option value="F">Female</option><option value="M">Male</option><option value="O">Other</option>
                          </select>
                        </Field>
                      </div>
                      {i === 0 && user && !p.passenger_name && (
                        <button type="button" onClick={() => setP(0, 'passenger_name', user.full_name)}
                          className="link mt-3 inline-flex items-center gap-1.5 text-xs">
                          <UserRound className="size-3.5" /> I'm travelling — use my name
                        </button>
                      )}
                    </div>
                  </fieldset>
                );
              })}
            </div>
          </section>

          <section className="card p-6">
            {sectionHead('02', 'Contact', 'Where the ticket would be sent — no messages are sent in this demo')}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email" error={errors.email} htmlFor="c-email">
                <input id="c-email" type="email" autoComplete="email" className={`input ${errors.email ? 'input-error' : ''}`} aria-invalid={!!errors.email}
                  value={contact.email} onChange={(e) => { setContact({ ...contact, email: e.target.value }); setErrors({ ...errors, email: '' }); }} />
              </Field>
              <Field label="Mobile number" error={errors.phone} htmlFor="c-phone">
                <input id="c-phone" inputMode="numeric" autoComplete="tel-national" maxLength={10} className={`input ${errors.phone ? 'input-error' : ''}`} aria-invalid={!!errors.phone}
                  value={contact.phone} onChange={(e) => { setContact({ ...contact, phone: e.target.value.replace(/\D/g, '') }); setErrors({ ...errors, phone: '' }); }} />
              </Field>
            </div>
          </section>

          <section>
            {sectionHead('03', 'Journey')}
            <JourneyStrip s={s} />
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:h-fit">
          <div className="card overflow-hidden">
            <h2 className="border-b border-paper-200 px-5 py-4 text-lg font-semibold">Fare summary</h2>
            <dl className="space-y-1.5 px-5 py-4 text-sm">
              {seats.map((x) => (
                <div key={x.seat_id} className="flex justify-between text-ink-700">
                  <dt>{seatLabel(x.coach_code, x.seat_number)} <span className="text-ink-400">· {x.class_code}</span></dt><dd className="figure">{moneyExact(x.fare)}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-dashed border-ink-300 pt-2"><dt className="text-ink-600">Base fare · {seats.length} passenger{seats.length > 1 ? 's' : ''}</dt><dd className="figure">{moneyExact(baseTotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-600">Booking fee · {moneyExact(feeEach)} × {seats.length}</dt><dd className="figure">{moneyExact(fee)}</dd></div>
              <div className="flex items-baseline justify-between border-t border-paper-200 pt-3"><dt className="font-semibold">Total payable</dt><dd className="figure text-2xl font-medium">{moneyExact(baseTotal + fee)}</dd></div>
            </dl>
            <div className="border-t border-dashed border-ink-300 px-5 py-4">
              <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-ink-700">
                <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-ink-950" checked={agree} aria-invalid={!!errors.agree}
                  onChange={(e) => { setAgree(e.target.checked); setErrors({ ...errors, agree: '' }); }} />
                <span>
                  I understand this is a demonstration and no real payment is taken. Refunds:{' '}
                  {policy.map((p) => `${p.refund_percent}% if ≥${p.min_hours_before}h before`).join(', ') || 'see policy'}; booking fee non-refundable.{' '}
                  <Link to="/policies#cancellation" target="_blank" className="link">Policy</Link>
                </span>
              </label>
              {errors.agree && <p className="mt-1 text-xs font-medium text-rose-700" role="alert">{errors.agree}</p>}

              <Button type="submit" variant="accent" size="lg" className="mt-5 w-full" loading={submitting} disabled={stale.length > 0}>
                Demo Payment / Confirm Booking
              </Button>
              <p className="mt-3 flex items-center justify-center gap-1.5 text-xs font-medium text-ink-500"><Lock className="size-3" /> Saved in one database transaction</p>
            </div>
          </div>
          <DemoNotice className="mt-4" />
        </aside>
      </form>
    </div>
  );
}
