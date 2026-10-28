import { AlertTriangle, Loader2, X } from 'lucide-react';
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'accent' | 'sun' | 'secondary' | 'ghost' | 'danger' | 'success';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-slate-700 text-paper-50 hover:bg-slate-800 disabled:bg-ink-300',
  sun: 'bg-sun-300 text-ink-950 hover:bg-sun-400 disabled:bg-sun-100',
  accent: 'bg-clay-500 text-white hover:bg-clay-600 disabled:bg-clay-200',
  // "success" is kept as an alias of the accent so existing call sites read naturally.
  success: 'bg-clay-500 text-white hover:bg-clay-600 disabled:bg-clay-200',
  secondary: 'border border-ink-300 bg-transparent text-ink-900 hover:border-ink-900 disabled:text-ink-300 disabled:hover:border-ink-300',
  ghost: 'text-ink-700 hover:bg-ink-50 disabled:text-ink-300',
  danger: 'bg-rose-700 text-white hover:bg-rose-800 disabled:bg-rose-300',
};
const SIZES = { sm: 'px-3 py-1.5 text-[13px]', md: 'px-4 py-2.5 text-sm', lg: 'px-6 py-3.5 text-[15px]' };

export function Button({
  variant = 'primary', size = 'md', loading, className = '', children, disabled, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof SIZES; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition active:translate-y-px disabled:cursor-not-allowed disabled:active:translate-y-0 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

/** A thin animated line that runs across, like a train between stations. */
export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20" role="status">
      <div className="relative h-px w-40 overflow-hidden bg-ink-200">
        <span className="absolute inset-y-0 w-12 animate-[spinner-run_1.1s_ease-in-out_infinite] bg-clay-500" />
      </div>
      <span className="text-xs font-medium text-ink-500">{label}</span>
      <style>{'@keyframes spinner-run{0%{left:-3rem}100%{left:100%}}'}</style>
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-ink-100/70 ${className}`} />;
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start rounded-2xl border border-paper-200 bg-white px-6 py-10 shadow-card sm:flex-row sm:gap-8">
      <div className="mb-4 flex size-12 shrink-0 items-center justify-center rounded-full bg-sun-200 text-clay-600">{icon}</div>
      <div>
        <h3 className="display text-2xl text-ink-950">{title}</h3>
        {children && <div className="mt-1.5 max-w-lg text-sm text-ink-600">{children}</div>}
        {action && <div className="mt-6">{action}</div>}
      </div>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-6 py-6">
      <p className="flex items-center gap-2 font-semibold text-rose-900"><AlertTriangle className="size-4" /> We couldn't load this</p>
      <p className="max-w-lg text-sm text-ink-700">{message}</p>
      {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

const BADGE_TONES = {
  moss: 'text-moss-700 border-moss-200 bg-moss-50',
  teal: 'text-moss-700 border-moss-200 bg-moss-50',
  rose: 'text-rose-700 border-rose-200 bg-rose-50',
  clay: 'text-clay-700 border-clay-200 bg-clay-50',
  amber: 'text-amber-800 border-amber-200 bg-amber-50',
  navy: 'text-ink-700 border-ink-200 bg-paper-50',
  gray: 'text-ink-500 border-ink-200 bg-paper-100',
};
export function Badge({ tone = 'navy', children, className = '' }: { tone?: keyof typeof BADGE_TONES; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg border px-1.5 py-[1px] text-xs font-medium ${BADGE_TONES[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function StateBadge({ state }: { state: string }) {
  const map: Record<string, [keyof typeof BADGE_TONES, string]> = {
    UPCOMING: ['moss', 'Upcoming'],
    COMPLETED: ['gray', 'Completed'],
    CANCELLED: ['rose', 'Cancelled'],
    CONFIRMED: ['moss', 'Confirmed'],
    SCHEDULED: ['moss', 'Scheduled'],
  };
  const [tone, label] = map[state] ?? ['navy', state];
  return <Badge tone={tone}>{label}</Badge>;
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; size?: 'md' | 'lg';
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previous?.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/45 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div ref={panel} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}
        className={`flex max-h-[92vh] w-full animate-fade-up flex-col border-t-4 border-clay-500 bg-paper-50 shadow-lift sm:rounded-lg ${size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}>
        <div className="flex items-center justify-between border-b border-ink-200 px-5 py-4">
          <h2 className="display text-xl text-ink-950">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-400 hover:bg-ink-50 hover:text-ink-800" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-ink-200 px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, error, hint, children, htmlFor }: { label: string; error?: string | null; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <p className="mt-1 text-xs font-medium text-rose-700" role="alert">{error}</p>
        : hint ? <p className="mt-1 text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
}

export function DemoNotice({ className = '' }: { className?: string }) {
  return (
    <p className={`text-xs font-medium text-ink-400 ${className}`}>
      Demonstration data · fictional schedules &amp; fares · not an official TNSTC, SETC or Indian Railways service
    </p>
  );
}

/** Section heading used across pages: mono kicker, serif title, optional Tamil gloss. */
export function SectionTitle({ kicker, title, tamil, children }: { kicker: string; title: ReactNode; tamil?: string; children?: ReactNode }) {
  return (
    <div className="mb-8">
      <p className="kicker">{kicker}</p>
      <div className="mt-2">
        <h2 className="display text-3xl leading-tight text-ink-950 sm:text-[40px]">
          {title} {tamil && <span className="tamil ml-1 align-middle text-base font-normal text-ink-400">{tamil}</span>}
        </h2>
        {children && <div className="mt-2 max-w-2xl text-sm text-ink-600">{children}</div>}
      </div>
    </div>
  );
}
