import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { tamilName } from '../lib/places';
import type { City } from '../types';

interface Props {
  label: string;
  cities: City[];
  value: number | null;
  onChange: (id: number | null) => void;
  error?: string | null;
  exclude?: number | null;
  placeholder?: string;
  /** board = large type on the dark journey-planner band; compact = small light input */
  variant?: 'board' | 'compact';
  /** show the label above a compact input */
  labelVisible?: boolean;
}

/** Accessible combobox: type to filter (matches "Trichy" via also_known_as), arrows + Enter to pick. */
export function CitySelect({ label, cities, value, onChange, error, exclude, placeholder = 'Type a city', variant = 'compact', labelVisible = false }: Props) {
  const id = useId();
  const selected = cities.find((c) => c.city_id === value) ?? null;
  const [text, setText] = useState(selected?.city_name ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const board = variant === 'board';

  useEffect(() => { setText(selected?.city_name ?? ''); }, [selected?.city_name]);

  const options = useMemo(() => {
    const q = text.trim().toLowerCase();
    const showAll = !q || (selected && q === selected.city_name.toLowerCase());
    return cities.filter((c) => c.city_id !== exclude &&
      (showAll || c.city_name.toLowerCase().includes(q) || c.also_known_as?.toLowerCase().includes(q)));
  }, [cities, text, exclude, selected]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) {
        setOpen(false);
        setText(selected?.city_name ?? '');
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [selected]);

  const choose = (c: City) => {
    onChange(c.city_id);
    setText(c.city_name);
    setOpen(false);
  };

  const inputClass = board
    ? `block w-full border-0 border-b bg-transparent px-0 pt-1 pb-1.5 display text-[26px] leading-tight text-paper-50 placeholder:text-slate-400 focus:ring-0 focus:outline-none ${error ? 'border-rose-400' : 'border-slate-400 focus:border-sun-300'}`
    : `input ${error ? 'input-error' : ''}`;

  return (
    <div ref={wrap} className="relative">
      <label htmlFor={id} className={board ? 'text-xs font-medium text-slate-200' : labelVisible ? 'label' : 'sr-only'}>{label}</label>
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-invalid={!!error}
        autoComplete="off"
        className={inputClass}
        placeholder={board || labelVisible ? placeholder : label}
        value={text}
        onFocus={(e) => { setOpen(true); e.target.select(); }}
        onChange={(e) => { setText(e.target.value); setOpen(true); setActive(0); if (!e.target.value) onChange(null); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, options.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter' && open && options[active]) { e.preventDefault(); choose(options[active]); }
          else if (e.key === 'Escape') { setOpen(false); }
        }}
      />
      {board && <p className="tamil mt-1 h-4 text-xs text-slate-300">{selected ? tamilName(selected.city_name) : ''}</p>}
      {error && <p className={`mt-1 text-xs font-medium ${board ? 'text-rose-300' : 'text-rose-700'}`} role="alert">{error}</p>}
      {open && (
        <ul id={`${id}-list`} role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full min-w-64 overflow-y-auto border border-ink-200 border-t-2 border-t-clay-500 bg-paper-50 py-1 shadow-lift">
          {options.length === 0 && <li className="px-4 py-3 text-sm text-ink-500">No matching city</li>}
          {options.map((c, i) => (
            <li key={c.city_id} role="option" aria-selected={c.city_id === value}
              onMouseDown={(e) => { e.preventDefault(); choose(c); }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-baseline justify-between gap-3 px-4 py-2 text-sm ${i === active ? 'bg-ink-50' : ''}`}>
              <span>
                <span className="font-semibold text-ink-950">{c.city_name}</span>
                {c.also_known_as && <span className="ml-1.5 text-ink-500">{c.also_known_as}</span>}
                <span className="tamil ml-2 text-xs text-ink-400">{tamilName(c.city_name)}</span>
              </span>
              <span className="shrink-0 text-xs font-medium text-ink-400">
                {[c.bus_stations && 'Bus', c.train_stations && 'Rail'].filter(Boolean).join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
