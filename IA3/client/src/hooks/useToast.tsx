import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type ToastKind = 'success' | 'error' | 'info';
interface Toast { id: number; kind: ToastKind; message: string }

const ToastContext = createContext<((kind: ToastKind, message: string) => void) | null>(null);

const STYLES: Record<ToastKind, { icon: typeof Info; ring: string; iconColor: string }> = {
  success: { icon: CheckCircle2, ring: 'border-clay-200', iconColor: 'text-clay-600' },
  error: { icon: XCircle, ring: 'border-rose-200', iconColor: 'text-rose-600' },
  info: { icon: Info, ring: 'border-ink-200', iconColor: 'text-ink-600' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, kind, message }]);
    setTimeout(() => dismiss(id), kind === 'error' ? 6500 : 4000);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="no-print pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => {
          const { icon: Icon, ring, iconColor } = STYLES[t.kind];
          return (
            <div key={t.id} role="status"
              className={`pointer-events-auto flex w-full max-w-md animate-toast-in items-start gap-3 rounded border ${ring} bg-white px-4 py-3 shadow-lift`}>
              <Icon className={`mt-0.5 size-5 shrink-0 ${iconColor}`} />
              <p className="flex-1 text-sm text-ink-900">{t.message}</p>
              <button onClick={() => dismiss(t.id)} className="text-ink-300 hover:text-ink-600" aria-label="Dismiss">
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const push = useContext(ToastContext);
  if (!push) throw new Error('useToast must be used inside ToastProvider');
  return {
    success: (m: string) => push('success', m),
    error: (m: string) => push('error', m),
    info: (m: string) => push('info', m),
  };
}
