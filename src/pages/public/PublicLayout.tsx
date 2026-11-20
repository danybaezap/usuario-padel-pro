import { CalendarDays, Medal, Monitor, Radio, Settings, Table2, Users, WifiOff } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { cx } from '@/components/ui';
import { useTournament } from '@/hooks/useTournament';
import { longDate } from '@/lib/format';
import { BrandMark } from '@/components/Brand';
import { Link } from 'react-router-dom';

export function ConnectionPill() {
  const { connection } = useTournament();
  return connection === 'offline' ? (
    <span className="chip bg-rose-500/15 text-rose-300" title="Reconectando…">
      <WifiOff className="h-3 w-3" /> Sin conexión
    </span>
  ) : (
    <span className="chip bg-lime-court/10 text-lime-court" title="Actualización automática en tiempo real">
      <span className="h-1.5 w-1.5 animate-live rounded-full bg-lime-court" /> EN VIVO
    </span>
  );
}

export default function PublicLayout() {
  const { snapshot: s, canAdmin } = useTournament();
  const t = s.tournament;
  const base = `/t/${t.slug}`;
  const loc = useLocation();
  const anyFinished = s.categories.some((c) => c.status === 'finished') || t.status === 'finished';
  const links = [
    { to: base, label: 'En vivo', icon: Radio, end: true },
    { to: `${base}/clasificacion`, label: 'Clasificación', icon: Table2 },
    { to: `${base}/calendario`, label: 'Calendario', icon: CalendarDays },
    { to: `${base}/parejas`, label: 'Parejas', icon: Users },
    ...(anyFinished ? [{ to: `${base}/premiacion`, label: 'Premiación', icon: Medal }] : []),
  ];
  return (
    <div className="pb-24 sm:pb-10">
      <header className="relative overflow-hidden border-b border-white/[0.06] bg-gradient-to-b from-ink-850 to-ink-950">
        <div className="court-lines pointer-events-none absolute inset-0 opacity-40" />
        <div className="pointer-events-none absolute -left-20 top-0 h-48 w-96 rounded-full bg-lime-court/10 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-4 pb-4 pt-4 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <Link to="/" aria-label="Inicio">
              <BrandMark className="h-9 sm:h-10" />
            </Link>
            <div className="flex items-center gap-2">
              <ConnectionPill />
              <Link to={`${base}/tv`} className="btn-secondary btn-sm hidden sm:inline-flex" title="Modo TV / proyector">
                <Monitor className="h-3.5 w-3.5" /> TV
              </Link>
              {canAdmin && (
                <Link to={`/admin/${t.slug}`} className="btn-secondary btn-sm">
                  <Settings className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Admin</span>
                </Link>
              )}
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              {t.isDemo && <span className="chip mb-2 bg-fuchsia-500/15 text-fuchsia-300">DEMOSTRACIÓN</span>}
              <h1 className="display text-4xl leading-none text-white sm:text-5xl lg:text-6xl">{t.name}</h1>
              <p className="mt-2 text-sm capitalize text-slate-400">
                {longDate(t.date)}
                {t.venue ? ` · ${t.venue}` : ''}
              </p>
            </div>
            {t.status === 'finished' && (
              <Link to={`${base}/premiacion`} className="chip bg-amber-400/15 px-3 py-1 text-sm text-amber-300">
                <Medal className="h-4 w-4" /> Torneo finalizado · ver premiación
              </Link>
            )}
          </div>
          <nav className="mt-5 hidden gap-1 sm:flex">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  cx('flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition', isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white')
                }
              >
                <l.icon className="h-4 w-4" /> {l.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6" key={loc.pathname}>
        <Outlet />
      </main>
      {/* Navegación inferior móvil */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid border-t border-white/10 bg-ink-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden" style={{ gridTemplateColumns: `repeat(${links.length}, minmax(0, 1fr))` }}>
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) => cx('flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold', isActive ? 'text-lime-court' : 'text-slate-500')}
          >
            <l.icon className="h-5 w-5" />
            {l.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
