// Interactive seat / berth maps drawn entirely from database rows
// (layout_row, layout_col, berth_type, status) returned by GET /api/schedules/:id/seats.
import type { ReactNode } from 'react';
import { BERTH_LABELS, BERTH_SHORT, money } from '../lib/format';
import type { Seat } from '../types';

interface MapProps {
  seats: Seat[];
  selected: Set<number>;
  onToggle: (seat: Seat) => void;
  preference?: string | null;
}

function seatClasses(seat: Seat, isSelected: boolean, preferred: boolean) {
  if (isSelected) return 'border-slate-700 bg-slate-700 text-white shadow-md';
  if (seat.status === 'OCCUPIED') return 'cursor-not-allowed border-booked-300 bg-booked-300 text-booked-700';
  if (seat.status === 'UNAVAILABLE') return 'hatch cursor-not-allowed border-ink-200 bg-paper-100 text-ink-300';
  return `border-white bg-white text-ink-800 shadow-sm hover:-translate-y-0.5 hover:border-slate-400 hover:shadow ${preferred ? 'ring-2 ring-clay-300 ring-offset-1' : ''}`;
}

function SeatButton({ seat, selected, onToggle, preference, shape, showFare }: {
  seat: Seat; selected: Set<number>; onToggle: (s: Seat) => void; preference?: string | null;
  shape: 'seat' | 'berth' | 'sleeper'; showFare?: boolean;
}) {
  const isSelected = selected.has(seat.seat_id);
  const preferred = !!preference && seat.berth_type === preference;
  const disabled = seat.status !== 'AVAILABLE' && !isSelected;
  const size = shape === 'sleeper' ? 'h-[4.5rem] w-12' : shape === 'berth' ? 'h-11 w-12' : 'h-12 w-12';
  const statusText = isSelected ? 'selected' : seat.status === 'OCCUPIED' ? 'booked' : seat.status.toLowerCase();
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onToggle(seat)}
      aria-pressed={isSelected}
      aria-label={`${seat.coach_code === 'MAIN' ? '' : `${seat.coach_code} `}seat ${seat.seat_number}, ${BERTH_LABELS[seat.berth_type] ?? seat.berth_type}, ${money(seat.fare)}, ${statusText === 'booked' ? 'occupied' : statusText}`}
      title={`${seat.seat_number} · ${BERTH_LABELS[seat.berth_type] ?? ''}${seat.fare !== null ? ` · ${money(seat.fare)}` : ''}`}
      className={`relative flex shrink-0 flex-col items-center justify-center rounded-xl border text-sm font-semibold transition ${size} ${seatClasses(seat, isSelected, preferred)}`}
    >
      {shape === 'sleeper' && <span className={`absolute top-1.5 h-1 w-6 rounded-full ${isSelected ? 'bg-white/50' : 'bg-current opacity-25'}`} />}
      <span>{seat.seat_number}</span>
      {shape === 'berth' && <span className="text-[9px] font-medium opacity-70">{BERTH_SHORT[seat.berth_type]}</span>}
      {showFare && seat.status === 'AVAILABLE' && !isSelected && seat.fare !== null && (
        <span className="text-[9px] font-normal text-ink-400">₹{Math.round(seat.fare)}</span>
      )}
    </button>
  );
}

export function SeatLegend({ vertical = false }: { vertical?: boolean }) {
  const items = [
    ['Available', 'border-paper-300 bg-white'],
    ['Selected', 'border-slate-700 bg-slate-700'],
    ['Booked', 'border-booked-300 bg-booked-300'],
    ['Unavailable', 'hatch border-ink-200 bg-paper-100'],
  ];
  return (
    <ul className={vertical ? 'space-y-3' : 'flex flex-wrap gap-x-6 gap-y-2'} aria-label="Seat legend">
      {items.map(([label, cls]) => (
        <li key={label} className="flex items-center gap-2.5 text-sm text-ink-700">
          <span className={`size-5 rounded-md border ${cls}`} /> {label}
        </li>
      ))}
    </ul>
  );
}

/** One bus deck drawn as a grey bus body with steering wheel and windscreen; letters label each row. */
export function BusDeck({ seats, selected, onToggle, title, sleeper }: MapProps & { title: string; sleeper: boolean }) {
  const rows = Math.max(...seats.map((s) => s.layout_row));
  const cols = Math.max(...seats.map((s) => s.layout_col));
  const byPos = new Map(seats.map((s) => [`${s.layout_row}-${s.layout_col}`, s]));
  const lower = title !== 'Upper deck';
  return (
    <figure className="w-fit">
      <figcaption className="mb-2 flex items-baseline justify-between gap-6 px-2 text-xs font-medium text-ink-500">
        <span className="text-sm font-semibold text-ink-950">{title}</span>
        <span>{seats.filter((s) => s.status === 'AVAILABLE').length} free</span>
      </figcaption>
      <div className="relative rounded-[40px] border-[6px] border-[#cfccc5] bg-gradient-to-b from-[#e7e4de] to-[#d9d6cf] px-5 pt-4 pb-6 shadow-inner">
        <div className="mb-4 flex items-center justify-between">
          {lower ? (
            <svg viewBox="0 0 24 24" className="size-9 text-ink-500" aria-label="Driver"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="12" r="2.5" fill="currentColor" /><path d="M3.5 11h6M14.5 11h6M12 14.5V21" stroke="currentColor" strokeWidth="2" /></svg>
          ) : <span className="text-xs text-ink-500">Front</span>}
          <span className="h-5 w-20 rounded-md bg-ink-700/80" aria-hidden="true" />
        </div>
        <div className="grid items-center gap-2" style={{ gridTemplateColumns: `1rem repeat(${cols}, auto)` }}>
          {Array.from({ length: rows }, (_, r) => [
            <span key={`l${r}`} className="text-center text-[11px] font-medium text-ink-400">{String.fromCharCode(65 + r)}</span>,
            ...Array.from({ length: cols }, (_, c) => {
              const seat = byPos.get(`${r + 1}-${c + 1}`);
              return seat
                ? <SeatButton key={seat.seat_id} seat={seat} selected={selected} onToggle={onToggle} shape={sleeper ? 'sleeper' : 'seat'} showFare />
                : <span key={`${r}-${c}`} className={sleeper ? 'w-3' : 'w-5'} aria-hidden="true" />;
            }),
          ])}
        </div>
        <div className="mt-5 flex justify-between px-4" aria-hidden="true">
          <span className="h-3 w-10 rounded bg-ink-600/70" /><span className="h-3 w-10 rounded bg-ink-600/70" />
        </div>
      </div>
    </figure>
  );
}

/** Coach selector: rounded tabs, one per coach of the chosen class. */
export function CoachConsist({ coaches, active, onPick, selected }: {
  coaches: { code: string; classCode: string; free: number; seats: Seat[] }[];
  active: string | undefined;
  onPick: (code: string) => void;
  selected: Set<number>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Coaches">
      <span className="mr-1 rounded-l-full rounded-r-md bg-slate-700 px-3 py-2 text-xs font-semibold text-white" aria-hidden="true">Engine</span>
      {coaches.map((c) => {
        const on = c.code === active;
        const mine = c.seats.filter((s) => selected.has(s.seat_id)).length;
        return (
          <button key={c.code} role="tab" aria-selected={on} onClick={() => onPick(c.code)}
            className={`relative rounded-lg border px-4 py-2 text-left transition ${on ? 'border-slate-700 bg-slate-50' : 'border-paper-300 bg-white hover:border-slate-400'}`}>
            <span className="block text-sm font-semibold text-ink-950">{c.code}</span>
            <span className="text-[11px] text-ink-500">{c.free} free</span>
            {mine > 0 && <span className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full bg-slate-700 text-[10px] font-semibold text-white">{mine}</span>}
          </button>
        );
      })}
    </div>
  );
}

const BAY_CONFIG: Record<string, { perSide: number; side: number }> = {
  TRAIN_SL: { perSide: 3, side: 2 },
  TRAIN_3A: { perSide: 3, side: 2 },
  TRAIN_2A: { perSide: 2, side: 2 },
  TRAIN_1A: { perSide: 2, side: 0 },
};

/** One train coach drawn as a grey carriage; sleeper-type coaches as bays, chair cars as rows. */
export function TrainCoach({ seats, selected, onToggle, preference }: MapProps) {
  const layout = seats[0]?.layout_code;
  const rows = [...new Set(seats.map((s) => s.layout_row))].sort((a, b) => a - b);

  const frame = (children: ReactNode) => (
    <div className="overflow-x-auto pb-2">
      <div className="inline-flex min-w-fit flex-col rounded-[28px] border-[6px] border-[#cfccc5] bg-gradient-to-b from-[#e7e4de] to-[#d9d6cf] p-4 shadow-inner">
        <div className="mb-3 flex justify-between px-1 text-[11px] font-medium text-ink-500"><span>◂ Entry · toilet</span><span>Middle aisle</span><span>Entry · toilet ▸</span></div>
        {children}
      </div>
    </div>
  );

  if (layout === 'TRAIN_CC') {
    const cols = Math.max(...seats.map((s) => s.layout_col));
    const byPos = new Map(seats.map((s) => [`${s.layout_row}-${s.layout_col}`, s]));
    return frame(
      <div className="grid grid-flow-col gap-1.5" style={{ gridTemplateRows: `repeat(${cols}, auto)` }}>
        {rows.map((r) => Array.from({ length: cols }, (_, c) => {
          const seat = byPos.get(`${r}-${c + 1}`);
          return seat
            ? <SeatButton key={seat.seat_id} seat={seat} selected={selected} onToggle={onToggle} preference={preference} shape="seat" />
            : <span key={`${r}-${c}`} className="h-4" aria-hidden="true" />;
        }))}
      </div>,
    );
  }

  const cfg = BAY_CONFIG[layout] ?? { perSide: 3, side: 2 };
  return frame(
    <div className="flex gap-2">
      {rows.map((r) => {
        const bay = seats.filter((s) => s.layout_row === r).sort((a, b) => a.layout_col - b.layout_col);
        const sideA = bay.slice(0, cfg.perSide);
        const sideB = bay.slice(cfg.perSide, cfg.perSide * 2);
        const side = bay.slice(cfg.perSide * 2);
        return (
          <div key={r} className="flex flex-col gap-1.5 rounded-2xl bg-white/40 p-1.5" aria-label={`${layout === 'TRAIN_1A' ? 'Cabin' : 'Bay'} ${r}`}>
            <div className="flex gap-1.5">{sideA.map((s) => <SeatButton key={s.seat_id} seat={s} selected={selected} onToggle={onToggle} preference={preference} shape="berth" />)}</div>
            <div className="flex gap-1.5">{sideB.map((s) => <SeatButton key={s.seat_id} seat={s} selected={selected} onToggle={onToggle} preference={preference} shape="berth" />)}</div>
            {cfg.side > 0 && (
              <>
                <div className="my-1 h-4" aria-hidden="true" />
                <div className="flex gap-1.5">{side.map((s) => <SeatButton key={s.seat_id} seat={s} selected={selected} onToggle={onToggle} preference={preference} shape="berth" />)}</div>
              </>
            )}
          </div>
        );
      })}
    </div>,
  );
}
