// An original, metro-style diagram of the TN Transit network (not to scale).
// Lines run at 0° / 45° / 90° like a transit diagram; stations are the 15 demo cities.
import { useEffect, useState } from 'react';
import { TAMIL_NAMES } from '../lib/places';

type Anchor = 'l' | 'r' | 'b' | 't';
const STATIONS: { city: string; label: string; x: number; y: number; at: Anchor; hub?: boolean }[] = [
  { city: 'Chennai', label: 'Chennai', x: 360, y: 60, at: 'r', hub: true },
  { city: 'Vellore', label: 'Vellore', x: 270, y: 60, at: 't' },
  { city: 'Salem', label: 'Salem', x: 200, y: 150, at: 'r' },
  { city: 'Erode', label: 'Erode', x: 150, y: 200, at: 'r' },
  { city: 'Tiruppur', label: 'Tiruppur', x: 110, y: 240, at: 'b' },
  { city: 'Coimbatore', label: 'Coimbatore', x: 50, y: 240, at: 'l', hub: true },
  { city: 'Udhagamandalam', label: 'Ooty', x: 50, y: 170, at: 'l' },
  { city: 'Tiruchirappalli', label: 'Trichy', x: 250, y: 270, at: 'l', hub: true },
  { city: 'Thanjavur', label: 'Thanjavur', x: 330, y: 270, at: 'r' },
  { city: 'Kumbakonam', label: 'Kumbakonam', x: 330, y: 230, at: 'r' },
  { city: 'Dindigul', label: 'Dindigul', x: 200, y: 320, at: 'r' },
  { city: 'Madurai', label: 'Madurai', x: 200, y: 380, at: 'r', hub: true },
  { city: 'Rameswaram', label: 'Rameswaram', x: 340, y: 420, at: 'b' },
  { city: 'Tirunelveli', label: 'Tirunelveli', x: 170, y: 470, at: 'r' },
  { city: 'Kanyakumari', label: 'Kanyakumari', x: 170, y: 530, at: 'r' },
];

// [path, style, approximate length, delay ms]
const LINES: { d: string; accent?: boolean; thin?: boolean; len: number; delay: number }[] = [
  { d: 'M360 60 V140 L250 250 V270 L200 320 V380 L170 410 V530', accent: true, len: 640, delay: 0 }, // southern corridor
  { d: 'M360 60 H270 V80 L200 150 L150 200 L110 240 H50', len: 400, delay: 250 },                    // western line
  { d: 'M50 240 V280 L150 380 H200', len: 260, delay: 600 },                                          // Kongu cross line
  { d: 'M250 270 H330 V230', thin: true, len: 130, delay: 800 },                                       // delta branch
  { d: 'M200 380 L240 420 H340', thin: true, len: 170, delay: 950 },                                   // island branch
  { d: 'M50 240 V170', thin: true, len: 80, delay: 1050 },                                             // hills branch
];

const labelPos = (s: (typeof STATIONS)[number]) => {
  switch (s.at) {
    case 'l': return { x: s.x - 12, y: s.y + 1, anchor: 'end' as const };
    case 'r': return { x: s.x + 12, y: s.y + 1, anchor: 'start' as const };
    case 't': return { x: s.x, y: s.y - 20, anchor: 'middle' as const };
    default: return { x: s.x, y: s.y + 22, anchor: 'middle' as const };
  }
};

export function NetworkMap({ highlight = [], className = '' }: { highlight?: (string | undefined)[]; className?: string }) {
  const [reduced, setReduced] = useState(false);
  useEffect(() => setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches), []);
  const lit = new Set(highlight.filter(Boolean));

  return (
    <svg viewBox="-80 20 530 540" className={className} role="img"
      aria-label="Diagram of the TN Transit network: Chennai, Coimbatore, Madurai, Trichy and eleven other cities connected by bus and rail lines">
      <defs>
        <pattern id="lattice" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.9" className="fill-ink-200" />
        </pattern>
        <path id="corridor" d={LINES[0].d} />
      </defs>
      {/* Dotted survey lattice moves slower than the lines (parallax via --scroll). */}
      <rect x="-80" y="0" width="540" height="600" fill="url(#lattice)"
        style={{ transform: 'translateY(calc(var(--scroll, 0) * 0.04px))' }} />

      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {LINES.map((l) => (
          <path key={l.d} d={l.d}
            className={`route-draw ${l.accent ? 'stroke-clay-500' : 'stroke-ink-900'}`}
            strokeWidth={l.accent ? 5 : l.thin ? 2.25 : 3.5}
            style={{ ['--len' as string]: l.len, ['--delay' as string]: `${l.delay}ms` }} />
        ))}
      </g>

      {!reduced && (
        <g aria-hidden="true">
          <circle r="5" className="fill-paper-50 stroke-clay-600" strokeWidth="2.5">
            {/* begin at 0s so the dot never rests at the SVG origin before moving */}
            <animateMotion dur="11s" begin="0s" repeatCount="indefinite" rotate="auto" keyPoints="0;1" keyTimes="0;1" calcMode="linear">
              <mpath href="#corridor" />
            </animateMotion>
          </circle>
        </g>
      )}

      {STATIONS.map((s) => {
        const p = labelPos(s);
        const on = lit.has(s.city);
        return (
          <g key={s.city} className="transition-opacity">
            {on && !reduced && <circle cx={s.x} cy={s.y} r="5" className="fill-clay-400" style={{ animation: 'pulse-ring 1.6s ease-out infinite' }} />}
            {s.hub
              ? <circle cx={s.x} cy={s.y} r={on ? 8 : 7} className={on ? 'fill-clay-500 stroke-ink-950' : 'fill-paper-50 stroke-ink-950'} strokeWidth="3" />
              : <circle cx={s.x} cy={s.y} r={on ? 6.5 : 4.5} className={on ? 'fill-clay-500 stroke-ink-950' : 'fill-paper-50 stroke-ink-950'} strokeWidth="2.25" />}
            <text x={p.x} y={p.y} textAnchor={p.anchor}
              className={`text-xs font-medium ${on ? 'fill-clay-700 font-semibold' : s.hub ? 'fill-ink-950 font-medium' : 'fill-ink-600'}`}>
              {s.label}
            </text>
            <text x={p.x} y={p.y + 13} textAnchor={p.anchor} className="font-tamil text-[10px] fill-ink-400">{TAMIL_NAMES[s.city]}</text>
          </g>
        );
      })}
    </svg>
  );
}
