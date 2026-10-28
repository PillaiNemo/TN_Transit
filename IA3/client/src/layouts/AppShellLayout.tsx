import { Bus, CircleHelp, Menu, Search, Ticket, TrainFront, UserRound, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { ScenePhoto } from '../components/Illustrations';
import { Logo } from '../components/Logo';
import { AccountMenu, Footer } from './MainLayout';

/**
 * Shell with the dark-green sidebar, used by search results, My Bookings and Profile.
 * "Bus tickets" / "Train tickets" switch the mode of the current search when on /search.
 */
export function AppShellLayout() {
  const location = useLocation();
  const [params] = useSearchParams();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const onSearch = location.pathname === '/search';
  const modeLink = (mode: 'BUS' | 'TRAIN') => {
    if (!onSearch) return `/?mode=${mode}#plan`;
    const next = new URLSearchParams(params);
    next.set('mode', mode);
    return `/search?${next.toString()}`;
  };
  const currentMode = params.get('mode') === 'TRAIN' ? 'TRAIN' : 'BUS';

  const items = [
    { to: '/#plan', label: 'Search', icon: Search, active: false },
    { to: modeLink('BUS'), label: 'Bus tickets', icon: Bus, active: onSearch && currentMode === 'BUS' },
    { to: modeLink('TRAIN'), label: 'Train tickets', icon: TrainFront, active: onSearch && currentMode === 'TRAIN' },
    { to: '/bookings', label: 'My bookings', icon: Ticket, active: location.pathname === '/bookings' },
    { to: '/profile', label: 'Profile', icon: UserRound, active: location.pathname === '/profile' },
    { to: '/policies', label: 'Help & support', icon: CircleHelp, active: false },
  ];

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-6 py-6"><Link to="/" aria-label="TN Transit home"><Logo inverted /></Link></div>
      <nav className="space-y-1 px-3" aria-label="Sections">
        {items.map(({ to, label, icon: Icon, active }) => (
          <NavLink key={label} to={to}
            className={`flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition ${active ? 'bg-white/12 text-white' : 'text-slate-200 hover:bg-white/8 hover:text-white'}`}>
            <Icon className="size-[18px]" /> {label}
          </NavLink>
        ))}
      </nav>
      <div className="relative mt-auto">
        <ScenePhoto scene="arch-sea" className="block aspect-[4/5] w-full" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-800 via-transparent to-slate-900/80" />
        <p className="script absolute right-5 bottom-10 left-5 -rotate-6 text-[26px] leading-[0.95] text-paper-50/90">Tamil Nadu<br />Moves<br />Together</p>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-paper-50">
      <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 overflow-y-auto bg-slate-800 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 flex lg:hidden" onClick={() => setOpen(false)}>
          <aside className="w-72 overflow-y-auto bg-slate-800" onClick={(e) => e.stopPropagation()}>{sidebar}</aside>
          <div className="flex-1 bg-ink-950/40" />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-16 items-center justify-between bg-paper-50/90 px-4 backdrop-blur-sm sm:px-8">
          <div className="flex items-center gap-3">
            <button className="rounded-lg p-2 text-ink-800 hover:bg-paper-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
            <span className="lg:hidden"><Logo subtitle={false} /></span>
          </div>
          <AccountMenu />
        </header>
        <main className="flex-1"><Outlet /></main>
        <Footer />
      </div>
    </div>
  );
}
