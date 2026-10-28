import { ArrowRight, Bus, MapPinned, MousePointerClick, ShieldCheck, Shuffle, TrainFront } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CITY_SCENE, CityGlyph, PalmCorner, ScenePhoto } from '../components/Illustrations';
import { NetworkMap } from '../components/NetworkMap';
import { SearchWidget } from '../components/SearchWidget';
import { Button, DemoNotice, SectionTitle, Skeleton } from '../components/ui';
import { useApi } from '../hooks/useApi';
import { useCities } from '../hooks/useCities';
import { addDays, formatDuration, money, todayIST } from '../lib/format';
import { tamilName } from '../lib/places';
import { api } from '../services/api';
import type { HomeData, Mode } from '../types';

const FEATURES = [
  [MapPinned, 'Wide Network', 'Major Tamil Nadu cities'],
  [MousePointerClick, 'Easy Booking', 'In a few clicks'],
  [ShieldCheck, 'Safe & Reliable', 'No double bookings, ever'],
  [Shuffle, 'Flexible Travel', 'Buses & trains together'],
] as const;

const STEPS = [
  ['Search', 'Choose two cities, a date and bus or train. Every result is read live from the timetable database.'],
  ['Pick seats', 'See the real seat or berth map for that one journey — booked seats are marked.'],
  ['Confirm', 'Add passenger names and confirm with the demo payment. Everything is saved in one transaction.'],
  ['Travel', 'Keep your reference. Print the ticket, or cancel later and see the refund first.'],
];

export function HomePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { cities } = useCities();
  const { data, loading } = useApi(() => api.get<HomeData>('/home'), []);
  const [lit, setLit] = useState<(string | undefined)[]>([]);
  const [ref, setRef] = useState('');
  const [refError, setRefError] = useState('');
  const tomorrow = addDays(todayIST(), 1);
  const chennai = cities.find((c) => c.city_name === 'Chennai');
  const madurai = cities.find((c) => c.city_name === 'Madurai');
  const coimbatore = cities.find((c) => c.city_name === 'Coimbatore');
  const initialMode: Mode = params.get('mode') === 'TRAIN' ? 'TRAIN' : 'BUS';

  const openBooking = (e: FormEvent) => {
    e.preventDefault();
    const value = ref.trim().toUpperCase();
    if (!/^TNT[A-Z0-9]{7}$/.test(value)) {
      setRefError('References are 10 characters and start with TNT, for example TNT7KQ2MXP');
      return;
    }
    navigate(`/booking/${value}`);
  };

  return (
    <>
      {/* ------------------------------------------------------------ Hero */}
      <section className="relative overflow-hidden pb-6">
        <PalmCorner className="pointer-events-none absolute -bottom-6 -left-10 hidden w-48 opacity-90 lg:block" />
        <PalmCorner flip className="pointer-events-none absolute -right-10 -bottom-6 hidden w-48 opacity-90 lg:block" />

        <div className="mx-auto grid max-w-7xl gap-10 px-4 pt-8 sm:px-6 lg:grid-cols-[1fr_1.15fr] lg:items-center lg:pt-10">
          <div className="animate-fade-up">
            <h1 className="display text-[clamp(3.2rem,6.6vw,5.8rem)] leading-[0.98] text-ink-950">
              Every<br /><span className="text-clay-500">City a New</span><br />Story
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-ink-600">
              Buses and trains across Tamil Nadu.<br />Simple bookings. Brighter journeys.
            </p>
            <a href="#plan" className="mt-6 inline-flex size-11 items-center justify-center rounded-full border border-ink-300 text-ink-800 transition hover:border-clay-500 hover:bg-clay-500 hover:text-white" aria-label="Plan a journey">
              <ArrowRight className="size-5" />
            </a>
          </div>

          {/* Collage of painted scenes */}
          <div className="relative xl:pr-32" style={{ transform: 'translate3d(0, calc(var(--scroll, 0) * -0.04px), 0)' }}>
            <div className="grid h-[340px] grid-cols-3 grid-rows-[1.25fr_1fr] gap-3 sm:h-[460px]">
              <ScenePhoto eager scene="gopuram" position="52% center" className="h-full w-full rounded-t-full rounded-b-2xl border-4 border-white shadow-md" />
              <ScenePhoto eager scene="lighthouse" position="35% center" className="h-full w-full rounded-2xl shadow-md" />
              <ScenePhoto eager scene="banana-temple" className="h-full w-full rounded-t-full rounded-b-2xl border-4 border-white shadow-md" />
              <ScenePhoto eager scene="tea-hills-bus" position="62% center" className="h-full w-full rounded-2xl shadow-md" />
              <ScenePhoto eager scene="rock-bridge-train" className="col-span-2 h-full w-full rounded-2xl rounded-tl-[80px] shadow-md" />
            </div>
            <p className="script pointer-events-none absolute top-6 right-0 hidden rotate-6 text-right text-[26px] leading-[1] text-ink-700 xl:block">
              Chennai<br />Coimbatore<br />Madurai<br />Trichy<br />and beyond…
            </p>
          </div>
        </div>

        {/* Search card */}
        <div id="plan" className="relative z-10 mx-auto mt-8 max-w-6xl scroll-mt-24 px-4 sm:px-6">
          <SearchWidget key={`${chennai?.city_id ?? 'x'}-${initialMode}`}
            initial={{ from: chennai?.city_id ?? null, to: madurai?.city_id ?? null, mode: initialMode }}
            onChange={(v) => setLit([v.fromName, v.toName])} />
        </div>

        {/* Feature row */}
        <ul className="relative z-10 mx-auto mt-10 grid max-w-6xl grid-cols-2 gap-6 px-4 sm:px-6 lg:grid-cols-4">
          {FEATURES.map(([Icon, title, text]) => (
            <li key={title} className="flex items-center gap-3">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-sun-200 text-clay-600"><Icon className="size-5" /></span>
              <span><span className="block text-sm font-semibold text-ink-950">{title}</span><span className="text-xs text-ink-500">{text}</span></span>
            </li>
          ))}
        </ul>
      </section>

      <div className="mx-auto max-w-7xl space-y-24 px-4 pt-16 sm:px-6">
        {/* ------------------------------------------------ Popular routes */}
        <section aria-labelledby="routes-title">
          <div id="routes-title" className="flex flex-wrap items-end justify-between gap-4">
            <SectionTitle kicker="Explore" title="Popular routes" tamil="பிரபலமான வழிகள்">
              Ranked by confirmed bookings, with today's lowest fares.
            </SectionTitle>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {loading && Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
            {data?.featured_routes.map((r, i) => {
              const Icon = r.transport_mode === 'BUS' ? Bus : TrainFront;
              return (
                <Link key={`${r.origin_city}-${r.destination_city}-${r.transport_mode}`} data-reveal style={{ ['--delay' as string]: `${(i % 4) * 70}ms` }}
                  to={`/search?from=${r.origin_city_id}&to=${r.destination_city_id}&date=${tomorrow}&mode=${r.transport_mode}&passengers=1`}
                  className="card group block p-5 transition hover:-translate-y-0.5 hover:shadow-lift">
                  <span className="flex items-center justify-between">
                    <span className={`flex size-9 items-center justify-center rounded-full ${r.transport_mode === 'BUS' ? 'bg-clay-50 text-clay-600' : 'bg-slate-50 text-slate-700'}`}><Icon className="size-4" /></span>
                    <span className="text-xs text-ink-400">{r.bookings} bookings</span>
                  </span>
                  <span className="mt-4 flex items-center gap-2 text-base font-semibold text-ink-950">
                    {r.origin_city} <ArrowRight className="size-4 text-ink-400" /> {r.destination_city}
                  </span>
                  <span className="mt-1 block text-sm text-ink-500">
                    {r.min_duration_minutes ? formatDuration(r.min_duration_minutes) : '—'} · from <span className="font-semibold text-clay-600">{money(r.from_fare)}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        {/* --------------------------------------------- Destinations */}
        <section aria-labelledby="dest-title">
          <div id="dest-title">
            <SectionTitle kicker="Destinations" title="Where the network goes" tamil="இலக்குகள்">
              Fifteen cities, from the Nilgiri hills to the tip at Kanyakumari.
            </SectionTitle>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {loading && Array.from({ length: 12 }, (_, i) => <li key={i}><Skeleton className="h-48 rounded-2xl" /></li>)}
            {data?.popular_destinations.map((d, i) => {
              const from = d.city_name === 'Chennai' ? coimbatore : chennai;
              const mode = d.bus_services >= d.train_services ? 'BUS' : 'TRAIN';
              const scene = CITY_SCENE[d.city_name];
              return (
                <li key={d.city_id} data-reveal style={{ ['--delay' as string]: `${(i % 6) * 60}ms` }}>
                  <Link to={`/search?from=${from?.city_id ?? ''}&to=${d.city_id}&date=${tomorrow}&mode=${mode}&passengers=1`}
                    className="card group block h-full overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lift">
                    <span className="block aspect-[4/3] overflow-hidden bg-sun-100">
                      {scene
                        ? <ScenePhoto scene={scene} className="h-full w-full transition duration-500 group-hover:scale-105" />
                        : <span className="flex h-full items-center justify-center text-slate-700 transition group-hover:text-clay-600"><CityGlyph city={d.city_name} className="size-16" /></span>}
                    </span>
                    <span className="block p-3">
                      <span className="block truncate text-sm font-semibold text-ink-950">{d.city_name}</span>
                      <span className="block truncate text-xs text-ink-500">{d.also_known_as ?? tamilName(d.city_name)}</span>
                      <span className="text-[11px] text-ink-400">{d.services} services</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {/* -------------------------------------------------- Network map */}
        <section className="card grid gap-8 overflow-hidden p-6 sm:p-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <p className="kicker">The network</p>
            <h2 className="display mt-2 text-4xl text-ink-950">One map, bus and rail</h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-600">
              The main corridor runs from Chennai through Trichy and Madurai to Kanyakumari, with lines west to Coimbatore and the hills.
              Pick cities in the search above and they light up here.
            </p>
            {data && (
              <dl className="mt-8 grid max-w-sm grid-cols-3 gap-4">
                {[[data.stats.cities, 'Cities'], [data.stats.active_services, 'Daily services'], [data.stats.upcoming_journeys.toLocaleString('en-IN'), 'Journeys open']].map(([n, l]) => (
                  <div key={l as string}><dt className="sr-only">{l}</dt><dd className="display text-3xl text-clay-500">{n}</dd><dd className="text-xs text-ink-500">{l}</dd></div>
                ))}
              </dl>
            )}
            <a href="#plan" className="mt-8 inline-block"><Button variant="primary">Plan a journey <ArrowRight className="size-4" /></Button></a>
          </div>
          <NetworkMap highlight={lit} className="mx-auto w-full max-w-[460px]" />
        </section>

        {/* ----------------------------------------------- How it works */}
        <section aria-labelledby="how-title">
          <div id="how-title"><SectionTitle kicker="How it works" title="Four steps to a confirmed seat" tamil="முன்பதிவு" /></div>
          <ol className="grid gap-4 md:grid-cols-4">
            {STEPS.map(([title, text], i) => (
              <li key={title} className="card p-6" data-reveal style={{ ['--delay' as string]: `${i * 100}ms` }}>
                <span className={`flex size-10 items-center justify-center rounded-full text-sm font-semibold ${i === 0 ? 'bg-clay-500 text-white' : 'bg-sun-200 text-clay-700'}`}>{i + 1}</span>
                <h3 className="mt-4 text-lg font-semibold text-ink-950">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ------------------------------------------------- Booking lookup */}
        <section id="manage" className="grid gap-6 rounded-2xl bg-slate-700 p-6 text-white sm:p-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <h2 className="display text-3xl">Already booked?</h2>
            <p className="mt-2 text-sm text-slate-200">View, print or cancel your ticket with its reference. For privacy you'll be asked to sign in.</p>
          </div>
          <form onSubmit={openBooking} noValidate>
            <label htmlFor="home-ref" className="mb-1.5 block text-xs font-medium text-slate-200">Booking reference</label>
            <div className="flex gap-2">
              <input id="home-ref" value={ref} onChange={(e) => { setRef(e.target.value); setRefError(''); }}
                placeholder="TNT7KQ2MXP" maxLength={10} aria-invalid={!!refError}
                className="input border-slate-500 bg-slate-800 uppercase tracking-wider text-white placeholder:text-slate-400 focus:border-sun-300 focus:ring-slate-600" />
              <Button type="submit" variant="accent">Open</Button>
            </div>
            {refError && <p className="mt-2 text-xs font-medium text-sun-300" role="alert">{refError}</p>}
          </form>
        </section>
        <DemoNotice />
      </div>
    </>
  );
}
