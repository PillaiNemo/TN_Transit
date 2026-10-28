import {
  ArrowLeft, BadgeIndianRupee, Building2, Bus, CalendarClock, ClipboardList, Database, LayoutDashboard, Menu,
  Armchair, Route, TicketX, TrainFront, Truck, X,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ScenePhoto } from '../components/Illustrations';
import { Logo } from '../components/Logo';
import { useAuth } from '../hooks/useAuth';

const SECTIONS = [
  { title: 'Overview', items: [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/admin/reports', label: 'SQL reports', icon: Database },
  ] },
  { title: 'Network', items: [
    { to: '/admin/cities', label: 'Cities & stations', icon: Building2 },
    { to: '/admin/routes', label: 'Routes', icon: Route },
    { to: '/admin/operators', label: 'Operators', icon: Truck },
    { to: '/admin/vehicles', label: 'Buses & trains', icon: Bus },
  ] },
  { title: 'Operations', items: [
    { to: '/admin/services', label: 'Services', icon: TrainFront },
    { to: '/admin/schedules', label: 'Schedules', icon: CalendarClock },
    { to: '/admin/seats', label: 'Seats & coaches', icon: Armchair },
    { to: '/admin/fares', label: 'Fares & fees', icon: BadgeIndianRupee },
  ] },
  { title: 'Records', items: [
    { to: '/admin/bookings', label: 'Bookings', icon: ClipboardList },
    { to: '/admin/cancellations', label: 'Cancellations', icon: TicketX },
  ] },
];

export function AdminLayout() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => { setOpen(false); }, [location.pathname]);

  const sidebar = (
    <nav className="flex h-full flex-col gap-6 overflow-y-auto px-3 py-5" aria-label="Admin">
      {SECTIONS.map((s) => (
        <div key={s.title}>
          <p className="mb-1.5 px-3 text-xs font-medium text-slate-400">{s.title}</p>
          {s.items.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => `flex items-center gap-3 border-l-2 px-3 py-2 text-sm transition ${
                isActive ? 'border-sun-300 bg-slate-700 text-paper-50' : 'border-transparent text-slate-200 hover:text-paper-50'}`}>
              <Icon className="size-4" /> {label}
            </NavLink>
          ))}
        </div>
      ))}
      <ScenePhoto scene="signboard" className="mt-auto aspect-[4/3] w-full rounded-md opacity-90" />
      <Link to="/" className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:text-paper-50">
        <ArrowLeft className="size-4" /> Back to passenger site
      </Link>
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-paper-50">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-slate-800 lg:flex">
        <div className="border-b border-slate-600 px-5 py-4"><Link to="/admin"><Logo inverted subtitle={false} /></Link></div>
        {sidebar}
      </aside>
      {open && (
        <div className="fixed inset-0 z-50 flex lg:hidden" onClick={() => setOpen(false)}>
          <aside className="flex w-72 flex-col bg-slate-800" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-600 px-5 py-4">
              <Logo inverted subtitle={false} />
              <button onClick={() => setOpen(false)} className="text-ink-300" aria-label="Close menu"><X className="size-5" /></button>
            </div>
            {sidebar}
          </aside>
          <div className="flex-1 bg-ink-950/40" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-ink-200 bg-paper-50/90 px-4 backdrop-blur-sm sm:px-6">
          <div className="flex items-center gap-3">
            <button className="rounded-lg p-1.5 text-ink-700 hover:bg-paper-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="size-5" /></button>
            <span className="text-xs font-medium text-ink-500">Operations console</span>
          </div>
          <span className="text-sm text-ink-500">Signed in as <span className="font-medium text-ink-950">{user?.full_name}</span></span>
        </header>
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8"><Outlet /></div>
      </div>
    </div>
  );
}

export function AdminHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-ink-950 pb-5">
      <div>
        <h1 className="display text-4xl text-ink-950">{title}</h1>
        {description && <p className="mt-1.5 max-w-3xl text-sm text-ink-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
