import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { LogoMark } from '../components/Logo';
import { NetworkMap } from '../components/NetworkMap';
import { Button, Field } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { errorMessage } from '../services/api';

const DEMO_ACCOUNTS = [
  { label: 'Passenger (Priya)', email: 'priya@example.com', password: 'Demo@123' },
  { label: 'Administrator', email: 'admin@tntransit.demo', password: 'Admin@123' },
];

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-6xl gap-12 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_26rem] lg:py-16">
      <div className="hidden lg:block">
        <p className="kicker">TN Transit account</p>
        <p className="display mt-4 max-w-md text-5xl leading-[1.02] text-ink-950">Every ticket, <em className="text-clay-500">one place.</em></p>
        <p className="tamil mt-3 text-sm text-ink-400">உங்கள் பயணங்கள் அனைத்தும்</p>
        <NetworkMap className="mt-8 w-full max-w-sm opacity-80" />
      </div>
      <div>
        <LogoMark className="size-10" />
        <h1 className="display mt-6 text-4xl text-ink-950">{title}</h1>
        <p className="mt-1 text-sm text-ink-600">{subtitle}</p>
        <div className="mt-8 border-t-2 border-ink-950 pt-6">{children}</div>
      </div>
    </div>
  );
}

function PasswordInput({ id, value, onChange, error, autoComplete }: { id: string; value: string; onChange: (v: string) => void; error?: string; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input id={id} type={show ? 'text' : 'password'} autoComplete={autoComplete} className={`input pr-10 ${error ? 'input-error' : ''}`}
        aria-invalid={!!error} value={value} onChange={(e) => onChange(e.target.value)} />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute top-1/2 right-3 -translate-y-1/2 text-ink-400 hover:text-ink-700"
        aria-label={show ? 'Hide password' : 'Show password'}>
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

const safeNext = (next: string | null) => (next && next.startsWith('/') && !next.startsWith('//') ? next : null);

export function LoginPage() {
  const { login, user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={next ?? '/'} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) errs.email = 'Enter a valid email address';
    if (!password) errs.password = 'Enter your password';
    setErrors(errs);
    setFormError('');
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const u = await login(email.trim(), password);
      toast.success(`Welcome back, ${u.full_name.split(' ')[0]}`);
      navigate(next ?? (u.role === 'ADMIN' ? '/admin' : '/'), { replace: true });
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Log in to TN Transit" subtitle="Book, view and cancel your journeys.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {formError && <p className="rounded bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-700" role="alert">{formError}</p>}
        <Field label="Email" error={errors.email} htmlFor="login-email">
          <input id="login-email" type="email" autoComplete="email" className={`input ${errors.email ? 'input-error' : ''}`} aria-invalid={!!errors.email}
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" error={errors.password} htmlFor="login-password">
          <PasswordInput id="login-password" autoComplete="current-password" value={password} onChange={setPassword} error={errors.password} />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={busy}>Log in</Button>
      </form>
      <p className="mt-5 text-center text-sm text-ink-500">New here? <Link to={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-clay-700 hover:underline">Create an account</Link></p>

      <div className="mt-6 rounded border border-dashed border-paper-300 bg-paper-50 p-4">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-500"><KeyRound className="size-3.5" /> Demo accounts</p>
        <div className="mt-3 space-y-2">
          {DEMO_ACCOUNTS.map((a) => (
            <button key={a.email} type="button" onClick={() => { setEmail(a.email); setPassword(a.password); setErrors({}); }}
              className="flex w-full items-center justify-between rounded-lg bg-white px-3 py-2 text-left text-sm ring-1 ring-paper-200 hover:ring-ink-300">
              <span className="font-semibold text-ink-800">{a.label}</span>
              <span className="font-mono text-xs text-ink-400">{a.email}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-ink-400">Fills the form only. Passwords are checked against bcrypt hashes in PostgreSQL.</p>
      </div>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { register, user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={next ?? '/'} replace />;
  const set = (k: keyof typeof form, v: string) => { setForm({ ...form, [k]: v }); setErrors({ ...errors, [k]: '' }); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (form.full_name.trim().length < 2) errs.full_name = 'Enter your full name';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) errs.email = 'Enter a valid email address';
    if (!/^[6-9]\d{9}$/.test(form.phone)) errs.phone = '10-digit mobile number starting with 6–9';
    if (form.password.length < 8) errs.password = 'At least 8 characters';
    else if (!/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) errs.password = 'Include at least one letter and one number';
    if (form.confirm !== form.password) errs.confirm = 'Passwords do not match';
    setErrors(errs);
    setFormError('');
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await register({ full_name: form.full_name.trim(), email: form.email.trim(), phone: form.phone, password: form.password });
      toast.success('Account created. You are now logged in.');
      navigate(next ?? '/', { replace: true });
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Create your account" subtitle="It takes less than a minute.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {formError && <p className="rounded bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-700" role="alert">{formError}</p>}
        <Field label="Full name" error={errors.full_name} htmlFor="r-name">
          <input id="r-name" autoComplete="name" className={`input ${errors.full_name ? 'input-error' : ''}`} aria-invalid={!!errors.full_name}
            value={form.full_name} onChange={(e) => set('full_name', e.target.value)} />
        </Field>
        <Field label="Email" error={errors.email} htmlFor="r-email">
          <input id="r-email" type="email" autoComplete="email" className={`input ${errors.email ? 'input-error' : ''}`} aria-invalid={!!errors.email}
            value={form.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Mobile number" error={errors.phone} htmlFor="r-phone">
          <input id="r-phone" inputMode="numeric" autoComplete="tel-national" maxLength={10} className={`input ${errors.phone ? 'input-error' : ''}`} aria-invalid={!!errors.phone}
            value={form.phone} onChange={(e) => set('phone', e.target.value.replace(/\D/g, ''))} />
        </Field>
        <Field label="Password" error={errors.password} hint="8+ characters with a letter and a number" htmlFor="r-pass">
          <PasswordInput id="r-pass" autoComplete="new-password" value={form.password} onChange={(v) => set('password', v)} error={errors.password} />
        </Field>
        <Field label="Confirm password" error={errors.confirm} htmlFor="r-confirm">
          <PasswordInput id="r-confirm" autoComplete="new-password" value={form.confirm} onChange={(v) => set('confirm', v)} error={errors.confirm} />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={busy}>Create account</Button>
      </form>
      <p className="mt-5 text-center text-sm text-ink-500">Already registered? <Link to="/login" className="font-semibold text-clay-700 hover:underline">Log in</Link></p>
    </AuthShell>
  );
}
