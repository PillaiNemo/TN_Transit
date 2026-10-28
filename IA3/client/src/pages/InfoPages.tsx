import { CalendarCheck, Compass, ShieldAlert, Ticket, UserRound } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Badge, Button, Field, Skeleton } from '../components/ui';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { formatInstant, money } from '../lib/format';
import { api, errorMessage } from '../services/api';
import type { Meta, User } from '../types';

export function ManageBookingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [ref, setRef] = useState('');
  const [error, setError] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = ref.trim().toUpperCase();
    if (!/^TNT[A-Z0-9]{7}$/.test(value)) return setError('Booking references are 10 characters and start with TNT, e.g. TNT7KQ2MXP');
    navigate(`/booking/${value}`);
  };
  return (
    <div className="mx-auto max-w-xl px-4 py-14">
      <CalendarCheck className="mx-auto size-10 text-clay-600" />
      <h1 className="mt-4 text-center display text-3xl">Manage a booking</h1>
      <p className="mt-1 text-center text-sm text-ink-500">Open a ticket to view, print or cancel it.</p>
      <form onSubmit={submit} className="card mt-8 space-y-4 p-6" noValidate>
        <Field label="Booking reference" error={error} htmlFor="m-ref">
          <input id="m-ref" className={`input  text-lg uppercase ${error ? 'input-error' : ''}`} maxLength={10} placeholder="TNT…"
            value={ref} onChange={(e) => { setRef(e.target.value); setError(''); }} />
        </Field>
        <Button type="submit" className="w-full">Open booking</Button>
        <p className="text-xs leading-relaxed text-ink-400">
          For privacy, a booking can only be opened by the account that made it{user ? '' : ', so you will be asked to log in'}.
          Lookups never reveal other passengers' details.
        </p>
      </form>
      {user && <p className="mt-4 text-center text-sm"><Link to="/bookings" className="font-semibold text-clay-700 hover:underline">See all my bookings →</Link></p>}
    </div>
  );
}

export function ProfilePage() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const { data: me, reload } = useApi(() => api.get<User>('/auth/me'), []);
  const [form, setForm] = useState({ full_name: user?.full_name ?? '', phone: user?.phone ?? '' });
  const [pw, setPw] = useState({ current_password: '', new_password: '' });
  const [busy, setBusy] = useState<'profile' | 'password' | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (form.full_name.trim().length < 2) errs.full_name = 'Enter your full name';
    if (!/^[6-9]\d{9}$/.test(form.phone)) errs.phone = '10-digit mobile number starting with 6–9';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy('profile');
    try {
      await api.put('/auth/me', form);
      await refresh();
      reload();
      toast.success('Profile updated');
    } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(null); }
  };

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.new_password.length < 8) return setErrors({ new_password: 'At least 8 characters with a letter and a number' });
    setBusy('password');
    try {
      await api.put('/auth/me/password', pw);
      setPw({ current_password: '', new_password: '' });
      setErrors({});
      toast.success('Password changed');
    } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(null); }
  };

  return (
    <div className="px-4 pb-8 sm:px-8">
      <div className="max-w-4xl">
      <p className="kicker">Account · கணக்கு</p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <span className="flex size-14 items-center justify-center rounded-full bg-slate-700 text-sun-300"><UserRound className="size-7" /></span>
        <div>
          <h1 className="display text-4xl">{user?.full_name}</h1>
          <p className="text-sm text-ink-500">{user?.email} · Member since {user ? formatInstant(user.created_at).split(',')[0] : ''}</p>
        </div>
        {user?.role === 'ADMIN' && <Badge tone="amber">Administrator</Badge>}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {me?.stats ? [
          ['Bookings', me.stats.total_bookings], ['Confirmed', me.stats.confirmed_bookings],
          ['Cancelled', me.stats.cancelled_bookings], ['Total spent', money(me.stats.total_spent)],
        ].map(([label, value]) => (
          <div key={label} className="card p-4"><p className="text-xs font-semibold text-ink-400">{label}</p><p className="mt-1 display text-2xl">{value}</p></div>
        )) : [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <form onSubmit={saveProfile} className="card space-y-4 p-6" noValidate>
          <h2 className="font-bold">Personal details</h2>
          <Field label="Full name" error={errors.full_name} htmlFor="pf-name">
            <input id="pf-name" className={`input ${errors.full_name ? 'input-error' : ''}`} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </Field>
          <Field label="Email" hint="Email is your login and cannot be changed" htmlFor="pf-email">
            <input id="pf-email" className="input" value={user?.email ?? ''} disabled />
          </Field>
          <Field label="Mobile number" error={errors.phone} htmlFor="pf-phone">
            <input id="pf-phone" className={`input ${errors.phone ? 'input-error' : ''}`} maxLength={10} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '') })} />
          </Field>
          <Button type="submit" loading={busy === 'profile'}>Save changes</Button>
        </form>
        <form onSubmit={savePassword} className="card space-y-4 p-6" noValidate>
          <h2 className="font-bold">Change password</h2>
          <Field label="Current password" htmlFor="pf-cur">
            <input id="pf-cur" type="password" autoComplete="current-password" className="input" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} />
          </Field>
          <Field label="New password" error={errors.new_password} hint="8+ characters with a letter and a number" htmlFor="pf-new">
            <input id="pf-new" type="password" autoComplete="new-password" className={`input ${errors.new_password ? 'input-error' : ''}`} value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} />
          </Field>
          <Button type="submit" variant="secondary" loading={busy === 'password'} disabled={!pw.current_password || !pw.new_password}>Update password</Button>
        </form>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/bookings"><Button variant="secondary"><Ticket className="size-4" /> My Bookings</Button></Link>
        {user?.role === 'ADMIN' && <Link to="/admin"><Button variant="secondary">Admin dashboard</Button></Link>}
      </div>
      </div>
    </div>
  );
}

export function PoliciesPage() {
  const { data: meta, loading } = useApi(() => api.get<Meta>('/meta'), []);
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
  }, [hash, meta]);
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="display text-5xl">Help &amp; policies</h1>
      <div className="mt-8 space-y-10 text-sm leading-relaxed text-ink-700">
        <section id="cancellation" className="scroll-mt-24">
          <h2 className="text-lg font-bold text-ink-950">Cancellation &amp; refunds</h2>
          <p className="mt-2">Refunds depend on how long before departure you cancel. These rules are rows of the <code className="rounded bg-paper-100 px-1">cancellation_policy</code> table, so they always match what the system applies.</p>
          <div className="card mt-4 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="table-head"><tr><th className="px-4 py-2.5">Cancelled at least</th><th className="px-4 py-2.5">Refund of fare</th></tr></thead>
              <tbody className="divide-y divide-paper-100">
                {loading && <tr><td colSpan={2} className="px-4 py-3"><Skeleton className="h-4" /></td></tr>}
                {meta?.cancellation_policy.map((p) => (
                  <tr key={p.policy_id}><td className="px-4 py-2.5">{p.min_hours_before} hours before departure</td><td className="px-4 py-2.5 font-semibold">{p.refund_percent}%</td></tr>
                ))}
                {meta && <tr><td className="px-4 py-2.5">Less than {Math.min(...meta.cancellation_policy.map((p) => p.min_hours_before))} hours</td><td className="px-4 py-2.5 text-rose-600">Cannot be cancelled</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="mt-3">Booking fees ({meta?.booking_fees.map((f) => `${f.transport_mode === 'BUS' ? 'bus' : 'train'} ${money(f.fee_per_passenger)}`).join(', ')} per passenger) are not refundable. Cancelled bookings stay in your history.</p>
        </section>
        <section id="terms" className="scroll-mt-24">
          <h2 className="text-lg font-bold text-ink-950">Terms of use</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>One booking covers up to 6 passengers on one journey, in one class.</li>
            <li>Seats are not held while you browse. The database confirms availability only when you press Confirm Booking.</li>
            <li>Passengers must carry a valid photo ID matching the name on the ticket.</li>
          </ul>
        </section>
        <section id="privacy" className="scroll-mt-24">
          <h2 className="text-lg font-bold text-ink-950">Privacy</h2>
          <p className="mt-2">Passwords are stored only as bcrypt hashes. Tickets can be opened only by the account that booked them (and by administrators). There is no public lookup that shows passenger details.</p>
        </section>
        <section id="demo" className="scroll-mt-24 rounded-md border border-amber-200 bg-amber-50 p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold text-amber-900"><ShieldAlert className="size-5" /> About this demonstration</h2>
          <p className="mt-2 text-amber-900">TN Transit is a college DBMS project. Operators, service numbers, timetables, fares, seat availability and App PNR numbers are fictional and are not official TNSTC, SETC or Indian Railways data. No real payment is taken and no ticket is valid for travel.</p>
        </section>
      </div>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <Compass className="size-12 text-ink-300" />
      <h1 className="mt-4 display text-3xl">This page took a wrong turn</h1>
      <p className="mt-2 text-sm text-ink-500">The address may be mistyped, or the page has moved.</p>
      <Link to="/" className="mt-6"><Button>Back to home</Button></Link>
    </div>
  );
}
