// Painted Tamil Nadu scenes (panels cropped from the project's illustration collages,
// served from /public/scenes), plus small SVG city glyphs and the hero's palm corners.

const C = { green: '#1f4d3a', greenLeaf: '#2f6b4c', peach: '#f2c8a2' };

/* ------------------------------------------------------- painted scenes */

export const SCENES = {
  'gopuram': 'a temple gopuram beside a tank among palms',
  'chennai-central': 'the red clock tower of a heritage railway station',
  'ooty-hills': 'a bus on a winding road through tea estates',
  'lighthouse': 'a striped lighthouse above a rocky beach',
  'rock-bridge-train': 'a blue express train crossing an arched river bridge below a rock hill',
  'banana-temple': 'banana leaves framing a temple across paddy fields',
  'mandapam': 'carved temple pillars and brass lamps',
  'temple-street': 'a street of tiled houses leading to a gopuram',
  'kanyakumari': 'the statue on the rock off Kanyakumari at sunset',
  'nataraja': 'a bronze Nataraja in a carved shrine',
  'signboard': 'a green road sign with distances to Chennai, Coimbatore, Madurai and Trichy',
  'hill-fort': 'a stone fort on a hilltop above a river valley',
  'arch-sea': 'a carved stone arch looking out to a shore temple at dusk',
  'station-platform': 'a blue train at a Chennai station platform',
  'tea-hills-bus': 'a red bus climbing through tea gardens',
  'temple-tank': 'a temple and its tank among palms',
  'train-fields': 'a train passing paddy fields and windmills',
  'highway-bus': 'a red bus on a highway past palms and hills',
  'sea-pier': 'a long pier stretching into the sea at sunset',
} as const;
export type Scene = keyof typeof SCENES;

/** One painted scene that fills its box (object-cover); `position` moves the crop focus. */
export function ScenePhoto({ scene, className = '', position, eager = false }: { scene: Scene; className?: string; position?: string; eager?: boolean }) {
  return (
    <img src={`/scenes/${scene}.webp`} alt={`Illustration: ${SCENES[scene]}`} draggable={false}
      loading={eager ? 'eager' : 'lazy'} decoding="async"
      className={`object-cover ${className}`} style={position ? { objectPosition: position } : undefined} />
  );
}

/** Picture header for journey cards (bus or train). */
export function VehiclePicture({ mode, className = '', align = 'middle' }: { mode: 'BUS' | 'TRAIN'; className?: string; align?: 'middle' | 'bottom' }) {
  const position = mode === 'BUS' ? (align === 'bottom' ? 'left 72%' : 'left 65%') : (align === 'bottom' ? 'center 80%' : undefined);
  return <ScenePhoto scene={mode === 'BUS' ? 'highway-bus' : 'train-fields'} className={className} position={position} />;
}

/** The painted scene shown on a city's destination card; cities without one use a glyph. */
export const CITY_SCENE: Partial<Record<string, Scene>> = {
  Chennai: 'chennai-central', Madurai: 'temple-street', Kanyakumari: 'kanyakumari', Udhagamandalam: 'ooty-hills',
  Rameswaram: 'sea-pier', Thanjavur: 'temple-tank', Kumbakonam: 'mandapam', Dindigul: 'hill-fort',
  Tirunelveli: 'nataraja', Tiruchirappalli: 'rock-bridge-train', Coimbatore: 'train-fields',
};

/* ------------------------------------------------------------ city glyphs */

type Glyph = 'temple' | 'tower' | 'hills' | 'cape' | 'fort' | 'rock' | 'bridge' | 'mill';
const CITY_GLYPH: Record<string, Glyph> = {
  Chennai: 'tower', Madurai: 'temple', Thanjavur: 'temple', Kumbakonam: 'temple', Udhagamandalam: 'hills',
  Kanyakumari: 'cape', Vellore: 'fort', Tiruchirappalli: 'rock', Dindigul: 'rock', Rameswaram: 'bridge',
  Coimbatore: 'mill', Tiruppur: 'mill', Erode: 'mill', Salem: 'mill', Tirunelveli: 'temple',
};

/** A small landmark icon for a city (decorative). */
export function CityGlyph({ city, className = 'size-12' }: { city: string; className?: string }) {
  const g = CITY_GLYPH[city] ?? 'temple';
  const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <circle cx="35" cy="13" r="6" fill={C.peach} />
      {g === 'temple' && <g {...s}><path d="M10 42 H38 M13 42 V34 H35 V42 M15 34 L17 27 H31 L33 34 M18 27 L19.5 21 H28.5 L30 27 M20.5 21 L21.5 15 H26.5 L27.5 21 M22 15 Q24 9 26 15 M24 11 V7" /><path d="M22 42 V38 a2 2 0 0 1 4 0 V42" /></g>}
      {g === 'tower' && <g {...s}><path d="M8 42 H40 M10 42 V30 H38 V42 M19 42 V12 H29 V42 M17 12 L24 5 L31 12" /><circle cx="24" cy="18" r="3" /><path d="M13 36 V33 M35 36 V33" /></g>}
      {g === 'hills' && <g {...s}><path d="M4 40 L16 22 L24 32 L32 18 L44 40 Z" /><path d="M13 27 L16 22 L19 26 M29 23 L32 18 L35 23" /><path d="M10 40 V36 M14 40 V34 M38 40 V35" /></g>}
      {g === 'cape' && <g {...s}><path d="M4 38 q5 -3 10 0 t10 0 t10 0 t10 0" /><path d="M4 43 q5 -3 10 0 t10 0 t10 0 t10 0" /><path d="M16 34 L20 26 H30 L33 34 M21 26 V21 H29 V26 M23 21 Q25 16 27 21" /></g>}
      {g === 'fort' && <g {...s}><path d="M6 42 V22 H10 V18 H14 V22 H18 V18 H22 V22 H26 V18 H30 V22 H34 V18 H38 V22 H42 V42 Z" /><path d="M20 42 V34 a4 4 0 0 1 8 0 V42" /></g>}
      {g === 'rock' && <g {...s}><path d="M4 42 C 10 30, 14 24, 22 22 C 30 20, 38 30, 44 42 Z" /><path d="M20 22 V16 H27 V21 M21.5 16 Q23.5 11 25.5 16" /></g>}
      {g === 'bridge' && <g {...s}><path d="M4 26 H44 M4 26 V40 M44 26 V40 M10 40 V32 a4 4 0 0 1 8 0 V40 M22 40 V32 a4 4 0 0 1 8 0 V40 M34 40 V32 a4 4 0 0 1 6 -2" /><path d="M4 44 q5 -2 10 0 t10 0 t10 0 t10 0" /></g>}
      {g === 'mill' && <g {...s}><path d="M6 42 V28 L14 23 V28 L22 23 V28 L30 23 V42 Z M30 42 H42 V18 H36 V42" /><path d="M36 14 q2 -3 0 -6 M40 13 q2 -3 0 -6" /><path d="M12 36 H16 M20 36 H24" /></g>}
    </svg>
  );
}

/** Corner palm-leaf decoration (as in the hero corners). */
export function PalmCorner({ className = '', flip = false }: { className?: string; flip?: boolean }) {
  return (
    <svg viewBox="0 0 160 160" className={className} aria-hidden="true" style={flip ? { transform: 'scaleX(-1)' } : undefined}>
      {[[0, 160, 120, 40], [0, 160, 150, 90], [0, 160, 70, 10], [0, 160, 30, 0]].map(([x1, y1, x2, y2], i) => (
        <g key={i}>
          <path d={`M${x1} ${y1} Q${(x1 + x2) / 2 + 20} ${(y1 + y2) / 2} ${x2} ${y2}`} fill="none" stroke={i % 2 ? C.greenLeaf : C.green} strokeWidth="3" />
          {Array.from({ length: 9 }, (_, k) => {
            const t = (k + 1) / 10;
            const px = x1 + (x2 - x1) * t + 10 * t;
            const py = y1 + (y2 - y1) * t;
            return <path key={k} d={`M${px} ${py} l${14 - k} ${-10 + k} M${px} ${py} l${-6 + k / 2} ${-16 + k}`} stroke={i % 2 ? C.greenLeaf : C.green} strokeWidth="3.2" strokeLinecap="round" />;
          })}
        </g>
      ))}
    </svg>
  );
}
