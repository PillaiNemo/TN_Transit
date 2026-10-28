import { ChevronDown, LayoutDashboard, LogOut, Menu, Ticket, User as UserIcon, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';

const NAV = [
  { to: '/', label: 'Explore', end: true },
  { to: '/bookings', label: 'My Bookings' },
  { to: '/policies', label: 'Help' },
];

/** Login button, or the signed-in user's menu. Shared by both page shells. */
export function AccountMenu({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  if (!user) {
    return (
      <Link to="/login" className="whitespace-nowrap rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800">
        Login
      </Link>
    );
  }
  const initials = user.full_name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu"
        className={`flex items-center gap-2 rounded-full py-1 pr-2 pl-1 text-sm font-medium ${tone === 'dark' ? 'text-white' : 'text-ink-800 hover:bg-paper-100'}`}>
        <span className="flex size-8 items-center justify-center rounded-full bg-clay-500 text-xs font-semibold text-white">{initials}</span>
        <span className="hidden max-w-32 truncate sm:inline">Hi, {user.full_name.split(' ')[0]}</span>
        <ChevronDown className="size-4 opacity-60" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-60 animate-fade-up rounded-xl border border-paper-200 bg-white p-1.5 shadow-lift">
          <div className="border-b border-paper-100 px-3 py-2.5">
            <p className="truncate text-sm font-semibold text-ink-950">{user.full_name}</p>
            <p className="truncate text-xs text-ink-500">{user.email}</p>
          </div>
          {[
            { to: '/bookings', label: 'My Bookings', icon: Ticket },
            { to: '/profile', label: 'Profile', icon: UserIcon },
            ...(user.role === 'ADMIN' ? [{ to: '/admin', label: 'Admin console', icon: LayoutDashboard }] : []),
          ].map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} role="menuitem" onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-700 hover:bg-paper-50">
              <Icon className="size-4 text-ink-400" /> {label}
            </Link>
          ))}
          <button role="menuitem"
            onClick={async () => { setOpen(false); await logout(); toast.info('You have been signed out'); navigate('/'); }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-rose-700 hover:bg-rose-50">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function Footer() {
  return (
    <footer className="no-print mt-24 border-t border-paper-200 bg-paper-100">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-600">Buses and trains across Tamil Nadu. Simple bookings, brighter journeys.</p>
          <p className="script mt-3 text-2xl text-clay-500">Tamil Nadu moves together</p>
        </div>
        {[
          ['Travel', [['/', 'Plan a journey'], ['/bookings', 'My bookings'], ['/manage', 'Find a booking'], ['/register', 'Create an account']]],
          ['Help', [['/policies#cancellation', 'Cancellation & refunds'], ['/policies#terms', 'Terms of use'], ['/policies#privacy', 'Privacy'], ['/policies#demo', 'About this demo']]],
          ['Contact', [['/policies', 'support@tntransit.demo'], ['/policies', '044 4555 0100'], ['/policies', 'Guindy, Chennai 600032']]],
        ].map(([title, links]) => (
          <div key={title as string}>
            <h3 className="text-sm font-semibold text-ink-950">{title as string}</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {(links as string[][]).map(([to, label]) => (
                <li key={label}><Link to={to} className="text-ink-600 hover:text-clay-600">{label}</Link></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="border-t border-paper-200 px-4 py-4 text-center text-xs text-ink-500">
        © {new Date().getFullYear()} TN Transit · College DBMS project · demonstration data, not affiliated with TNSTC, SETC or Indian Railways
      </p>
    </footer>
  );
}

export function MainLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  // Block body on purpose: an effect's return value is treated as its cleanup, and
  // window.scrollTo() returns a Promise in recent Chromium builds.
  useEffect(() => {
    setMobileOpen(false);
    if (location.hash) {
      document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo(0, 0);
    }
  }, [location.pathname, location.hash]);

  return (
    <div className="flex min-h-screen flex-col">
      <div className="no-print fixed inset-x-0 top-0 z-50 h-[3px] origin-left bg-clay-500"
        style={{ transform: 'scaleX(var(--scroll-progress, 0))' }} aria-hidden="true" />
      <header className="no-print sticky top-0 z-40 bg-paper-50/90 backdrop-blur-sm">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-6 px-4 sm:px-6">
          <Link to="/" aria-label="TN Transit home"><Logo /></Link>
          <div className="flex items-center gap-8">
            <nav className="hidden items-center gap-8 md:flex" aria-label="Main">
              {NAV.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.end}
                  className={({ isActive }) => `text-sm font-medium transition ${isActive ? 'text-clay-600' : 'text-ink-700 hover:text-ink-950'}`}>
                  {n.label}
                </NavLink>
              ))}
            </nav>
            <AccountMenu />
            <button className="rounded-lg p-2 text-ink-800 hover:bg-paper-100 md:hidden" onClick={() => setMobileOpen((o) => !o)} aria-label="Menu" aria-expanded={mobileOpen}>
              {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>
        {mobileOpen && (
          <nav className="border-t border-paper-200 bg-white px-4 py-2 md:hidden" aria-label="Mobile">
            {[...NAV, { to: '/manage', label: 'Find a booking', end: false }].map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className="block rounded-lg px-3 py-3 text-sm font-medium text-ink-800 hover:bg-paper-50">{n.label}</NavLink>
            ))}
          </nav>
        )}
      </header>
      <main className="flex-1"><Outlet /></main>
      <Footer />
    </div>
  );
}
