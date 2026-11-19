import { CalendarRange, ExternalLink, Gauge, Layers, Lock, Settings2, Share2, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { FullScreenMessage, cx } from '@/components/ui';
import { repo } from '@/data';
import { hashPin, isLocallyUnlocked, setLocallyUnlocked } from '@/data/localRepo';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { useTournament } from '@/hooks/useTournament';
import { BrandMark } from '../Home';
import { ConnectionPill } from '../public/PublicLayout';
import { DemoControls } from './DemoControls';

function AdminGate({ children }: { children: React.ReactNode }) {
  const { snapshot: s } = useTournament();
  const { user, ready } = useAuth();
  const toast = useToast();
  const [pin, setPin] = useState('');
  const [, force] = useState(0);
  const t = s.tournament;

  if (repo.mode === 'supabase') {
    if (!ready) return null;
    if (!user)
      return (
        <FullScreenMessage title="Acceso restringido">
          <p className="text-slate-400">Inicia sesión como organizador para administrar este torneo.</p>
          <Link className="btn-primary" to={`/login?next=/admin/${t.slug}`}>
            Iniciar sesión
          </Link>
          <Link className="btn-ghost btn-sm" to={`/t/${t.slug}`}>
            Ver dashboard público
          </Link>
        </FullScreenMessage>
      );
    if (user.id !== t.ownerId)
      return (
        <FullScreenMessage title="Sin permisos">
          <p className="text-slate-400">Tu cuenta no es la organizadora de este torneo.</p>
          <Link className="btn-secondary" to={`/t/${t.slug}`}>
            Ver dashboard público
          </Link>
        </FullScreenMessage>
      );
    return <>{children}</>;
  }

  if (t.localAdminHash && !isLocallyUnlocked(t.id))
    return (
      <FullScreenMessage title="Panel de administración">
        <form
          className="card w-full max-w-xs space-y-3 p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if ((await hashPin(pin)) === t.localAdminHash) {
              setLocallyUnlocked(t.id, true);
              force((x) => x + 1);
            } else toast.error('PIN incorrecto');
          }}
        >
          <Lock className="mx-auto h-6 w-6 text-slate-400" />
          <input className="input text-center" type="password" inputMode="numeric" placeholder="PIN" value={pin} onChange={(e) => setPin(e.target.value)} autoFocus />
          <button className="btn-primary w-full">Entrar</button>
        </form>
        <Link className="btn-ghost btn-sm" to={`/t/${t.slug}`}>
          Ver dashboard público
        </Link>
      </FullScreenMessage>
    );
  return <>{children}</>;
}

export default function AdminLayout() {
  const { snapshot: s, busy } = useTournament();
  const base = `/admin/${s.tournament.slug}`;
  const links = [
    { to: base, label: 'Control en vivo', icon: Gauge, end: true },
    { to: `${base}/inscripciones`, label: 'Inscripciones', icon: Users },
    { to: `${base}/partidos`, label: 'Partidos', icon: CalendarRange },
    { to: `${base}/categorias`, label: 'Categorías y cierre', icon: Layers },
    { to: `${base}/configuracion`, label: 'Configuración', icon: Settings2 },
    { to: `${base}/compartir`, label: 'Compartir y exportar', icon: Share2 },
  ];
  return (
    <AdminGate>
      <div className="min-h-screen pb-20">
        <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-ink-950/90 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
            <Link to="/" aria-label="Inicio">
              <BrandMark className="origin-left scale-90" />
            </Link>
            <span className="hidden h-6 w-px bg-white/10 sm:block" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-white">{s.tournament.name}</div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500">
                Panel de administración{s.tournament.isDemo ? ' · demostración' : ''}
              </div>
            </div>
            {busy && <span className="text-xs text-slate-400">Guardando…</span>}
            <ConnectionPill />
            <Link to={`/t/${s.tournament.slug}`} target="_blank" className="btn-secondary btn-sm">
              <ExternalLink className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Público</span>
            </Link>
          </div>
          <nav className="scrollbar-thin mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2 sm:px-6">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) => cx('flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition', isActive ? 'bg-lime-court text-ink-950' : 'text-slate-400 hover:bg-white/5 hover:text-white')}
              >
                <l.icon className="h-4 w-4" /> {l.label}
              </NavLink>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
          {s.tournament.isDemo && <DemoControls />}
          <Outlet />
        </main>
      </div>
    </AdminGate>
  );
}
