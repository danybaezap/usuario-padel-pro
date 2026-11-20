import { motion } from 'framer-motion';
import { ArrowRight, Database, FlaskConical, HardDrive, LogOut, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { repo, type TournamentSummary } from '@/data';
import { hashPin, setLocallyUnlocked } from '@/data/localRepo';
import { createTournamentSnapshot } from '@/domain/commands';
import { createDemoTournament } from '@/domain/demo';
import { DomainError } from '@/domain/types';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { longDate } from '@/lib/format';
import { BrandMark } from '@/components/Brand';
import { CategoryBadge, Spinner, useConfirm } from '@/components/ui';

const STATUS_LABEL = { registration: 'Inscripciones', in_progress: 'En juego', finished: 'Finalizado' } as const;

export default function Home() {
  const { user, ready } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const { ask, dialog } = useConfirm();
  const [list, setList] = useState<TournamentSummary[] | null>(null);
  const [name, setName] = useState('');
  const [venue, setVenue] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [pin, setPin] = useState('');
  const [creating, setCreating] = useState(false);
  const needsLogin = repo.mode === 'supabase' && !user;

  const refresh = useCallback(async () => {
    try {
      setList(await repo.listTournaments());
    } catch (e) {
      toast.error((e as Error).message);
      setList([]);
    }
  }, [toast]);

  useEffect(() => {
    if (ready) void refresh();
  }, [ready, user, refresh]);

  const create = async (demo: boolean) => {
    if (needsLogin) return nav('/login');
    setCreating(true);
    try {
      const localAdminHash = repo.mode === 'local' && pin && !demo ? await hashPin(pin) : null;
      const snap = demo
        ? createDemoTournament({ ownerId: user?.id ?? null })
        : createTournamentSnapshot({ name, venue, date, ownerId: user?.id ?? null, localAdminHash });
      const saved = await repo.create(snap);
      if (localAdminHash) setLocallyUnlocked(saved.tournament.id, true);
      toast.success(demo ? 'Torneo de demostración creado' : 'Torneo creado');
      nav(`/admin/${saved.tournament.slug}${demo ? '' : '/inscripciones'}`);
    } catch (e) {
      toast.error(e instanceof DomainError ? e.message : (e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const remove = async (t: TournamentSummary) => {
    const ok = await ask('Eliminar torneo', <>Se borrará <b>{t.name}</b> con todas sus parejas, partidos y resultados. Esta acción no se puede deshacer.</>, { confirm: 'Eliminar', danger: true });
    if (!ok) return;
    try {
      await repo.remove(t.id);
      toast.success('Torneo eliminado');
      void refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const real = (list ?? []).filter((t) => !t.isDemo);
  const demos = (list ?? []).filter((t) => t.isDemo);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6">
      {dialog}
      <header className="flex items-center justify-end">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="chip border border-white/10 bg-white/[0.03] text-slate-300" title={repo.mode === 'supabase' ? 'Datos en Supabase con sincronización en tiempo real' : 'Datos guardados en este navegador'}>
            {repo.mode === 'supabase' ? <Database className="h-3 w-3" /> : <HardDrive className="h-3 w-3" />}
            {repo.mode === 'supabase' ? 'Supabase' : 'Modo local'}
          </span>
          {repo.mode === 'supabase' &&
            (user ? (
              <button className="btn-ghost btn-sm" onClick={() => repo.signOut()}>
                <LogOut className="h-3.5 w-3.5" /> {user.email}
              </button>
            ) : (
              <Link className="btn-secondary btn-sm" to="/login">
                Acceso organizador
              </Link>
            ))}
        </div>
      </header>

      <section className="relative mt-10 overflow-hidden rounded-3xl border border-white/[0.07] bg-gradient-to-br from-ink-850 via-ink-900 to-ink-950 p-6 sm:p-10">
        <div className="court-lines pointer-events-none absolute inset-0 opacity-50" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-lime-court/20 blur-3xl" />
        <div className="relative grid gap-10 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <BrandMark variant="full" className="mb-8 h-14 sm:h-16" />
            <div className="mb-3 flex gap-1.5">
              <CategoryBadge code="A" size="md" />
              <CategoryBadge code="B" size="md" />
              <CategoryBadge code="C" size="md" />
            </div>
            <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="display text-5xl leading-[0.95] text-white sm:text-6xl">
              Tu torneo de pádel,
              <br />
              <span className="text-lime-court">en vivo.</span>
            </motion.h1>
            <p className="mt-4 max-w-lg text-slate-300">
              Round Robin con parejas fijas en tres categorías, tres canchas compartidas, asignación inteligente de partidos, marcadores en tiempo real y pantallas para TV y móvil.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <button className="btn-secondary" onClick={() => create(true)} disabled={creating}>
                <FlaskConical className="h-4 w-4" /> Probar modo demostración
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">24 jugadores · 12 parejas · simulación de partidos. Los torneos demo se guardan aparte de los reales.</p>
          </div>

          <form
            className="card p-5 sm:p-6"
            onSubmit={(e) => {
              e.preventDefault();
              void create(false);
            }}
          >
            <h2 className="display mb-4 text-2xl text-white">Nuevo torneo</h2>
            {needsLogin ? (
              <div className="space-y-3 text-sm text-slate-300">
                <p>Inicia sesión como organizador para crear y administrar torneos. El público no necesita cuenta.</p>
                <Link to="/login" className="btn-primary w-full">
                  Acceder
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="label" htmlFor="tname">
                    Nombre del torneo
                  </label>
                  <input id="tname" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Open de Primavera 2026" required minLength={3} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="tvenue">
                      Sede
                    </label>
                    <input id="tvenue" className="input" value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Club…" />
                  </div>
                  <div>
                    <label className="label" htmlFor="tdate">
                      Fecha
                    </label>
                    <input id="tdate" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
                  </div>
                </div>
                {repo.mode === 'local' && (
                  <div>
                    <label className="label" htmlFor="tpin">
                      PIN de administración (recomendado)
                    </label>
                    <input id="tpin" type="password" inputMode="numeric" className="input" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Protege el panel en este equipo" minLength={4} />
                  </div>
                )}
                <button className="btn-primary w-full" disabled={creating}>
                  {creating ? <Spinner className="h-4 w-4 text-ink-950" /> : <Plus className="h-4 w-4" />} Crear torneo
                </button>
                <p className="text-[11px] text-slate-500">Se crean automáticamente las categorías A, B y C y 3 canchas (configurable).</p>
              </div>
            )}
          </form>
        </div>
      </section>

      {repo.mode === 'local' && (
        <div className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-xs text-amber-200/90">
          <b>Modo local:</b> los datos se guardan en este navegador y se sincronizan al instante entre sus pestañas y ventanas (p. ej. panel + TV en un segundo monitor). Para que jugadores y espectadores sigan el torneo desde sus teléfonos, configura Supabase (ver README).
        </div>
      )}

      <TournamentList title="Mis torneos" items={real} loading={list === null} onRemove={remove} />
      {demos.length > 0 && <TournamentList title="Torneos de demostración" items={demos} loading={false} onRemove={remove} demo />}
    </div>
  );
}

function TournamentList({ title, items, loading, onRemove, demo }: { title: string; items: TournamentSummary[]; loading: boolean; onRemove: (t: TournamentSummary) => void; demo?: boolean }) {
  return (
    <section className="mt-10">
      <h2 className="display mb-3 text-xl text-slate-200">{title}</h2>
      {loading ? (
        <Spinner />
      ) : !items.length ? (
        <p className="text-sm text-slate-500">Todavía no hay torneos.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((t) => (
            <div key={t.id} className="card card-hover group flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-white">{t.name}</div>
                  <div className="text-xs capitalize text-slate-400">{longDate(t.date)}{t.venue ? ` · ${t.venue}` : ''}</div>
                </div>
                <span className={`chip ${t.status === 'in_progress' ? 'bg-lime-court/15 text-lime-court' : t.status === 'finished' ? 'bg-amber-400/15 text-amber-300' : 'bg-white/5 text-slate-300'}`}>
                  {demo ? 'Demo · ' : ''}
                  {STATUS_LABEL[t.status]}
                </span>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <Link to={`/admin/${t.slug}`} className="btn-primary btn-sm">
                  Administrar <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                <Link to={`/t/${t.slug}`} className="btn-secondary btn-sm">
                  Público
                </Link>
                <button className="btn-ghost btn-sm ml-auto opacity-60 hover:opacity-100" onClick={() => onRemove(t)} aria-label="Eliminar torneo">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
