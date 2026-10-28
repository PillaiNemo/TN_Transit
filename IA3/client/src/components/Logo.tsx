// TN Transit emblem: a temple tower inside a ring, drawn in SVG (no image assets).
export function LogoMark({ className = 'size-9', inverted = false }: { className?: string; inverted?: boolean }) {
  const ring = inverted ? '#f7f1e6' : '#a8442c';
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <circle cx="20" cy="20" r="18" fill="none" stroke={ring} strokeWidth="2.4" />
      <path d="M11 31 H29 M13 31 V27 H27 V31 M14.5 27 L15.5 23 H24.5 L25.5 27 M16.5 23 L17.2 19.5 H22.8 L23.5 23 M17.8 19.5 L18.3 16 H21.7 L22.2 19.5 M18.6 16 Q20 11.5 21.4 16 M20 12.6 V9.5"
        fill="none" stroke={ring} strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M18.6 31 V28.6 a1.4 1.4 0 0 1 2.8 0 V31" fill={ring} />
    </svg>
  );
}

export function Logo({ inverted = false, subtitle = true }: { inverted?: boolean; subtitle?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark inverted={inverted} />
      <span className="leading-none">
        <span className={`block whitespace-nowrap text-[17px] font-extrabold tracking-tight ${inverted ? 'text-white' : 'text-ink-950'}`}>
          TN TRANSIT
        </span>
        {subtitle && (
          <span className={`mt-1 block text-[11px] font-medium ${inverted ? 'text-slate-200' : 'text-ink-500'}`}>
            Tamil Nadu Connected
          </span>
        )}
      </span>
    </span>
  );
}
