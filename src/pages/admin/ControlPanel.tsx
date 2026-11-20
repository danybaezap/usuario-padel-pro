import { AlertTriangle, ArrowRightLeft, Check, ChevronDown, Pause, Play, PlayCircle, RotateCcw, Sparkles, Timer, Undo2, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MatchLine, PairLabel, useCategoryMap } from '@/components/sport';
import { CategoryBadge, Empty, LiveDot, Modal, ProgressBar, SectionTitle, Stat, cx } from '@/components/ui';
import { assignMatch } from '@/domain/commands';
import { CATEGORY_THEME } from '@/domain/defaults';
import { matchOnCourt, proposeForFreeCourts, rankCandidates, type Proposal } from '@/domain/scheduler';
import { categoryProgress } from '@/domain/standings';
import type { Court, Match } from '@/domain/types';
import { PHASE_LABEL } from '@/domain/types';
import { useNow, useTournament } from '@/hooks/useTournament';
import { elapsed } from '@/lib/format';
import { useMatchActions } from './matchActions';

export default function ControlPanel() {
  const { snapshot: s, index, run } = useTournament();
  const now = useNow(15000);
  const cats = useCategoryMap(s);
  const { actions, ui } = useMatchActions();
  const [picker, setPicker] = useState<Court | null>(null);
  const proposals = useMemo(() => proposeForFreeCourts(s, new Date()), [s]);
  const courts = s.courts.filter((c) => c.active).sort((a, b) => a.number - b.number);
  const live = s.matches.filter((m) => m.status === 'in_progress').length;
  const pending = s.matches.filter((m) => m.status === 'pending').length;
  const finished = s.matches.filter((m) => m.status === 'finished').length;
  const suspended = s.matches.filter((m) => m.status === 'suspended');
  const recent = s.matches.filter((m) => m.status === 'finished').sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? '')).slice(0, 5);

  if (!s.matches.length)
    return (
      <Empty title="Todavía no hay partidos" icon={<Sparkles className="h-6 w-6" />}>
        Registra las parejas y genera el calendario Round Robin de cada categoría.
        <div className="mt-4 flex justify-center gap-2">
          <Link to={`/admin/${s.tournament.slug}/inscripciones`} className="btn-secondary btn-sm">
            Inscripciones
          </Link>
          <Link to={`/admin/${s.tournament.slug}/categorias`} className="btn-primary btn-sm">
            Generar calendario
          </Link>
        </div>
      </Empty>
    );

  const confirmAll = () =>
    run((x) => {
      let cur = x;
      for (const p of proposeForFreeCourts(x, new Date())) {
        if (p.warnings.length) continue;
        cur = assignMatch(cur, p.match.id, p.courtId, new Date());
      }
      return cur;
    }, 'Propuestas confirmadas');

  return (
    <div className="space-y-8">
      {ui}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="En juego" value={live} />
        <Stat label="Pendientes" value={pending} sub={suspended.length ? `${suspended.length} suspendidos` : undefined} />
        <Stat label="Finalizados" value={finished} />
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Progreso</div>
          <div className="space-y-1.5">
            {s.categories.filter((c) => s.matches.some((m) => m.categoryId === c.id)).map((c) => {
              const p = categoryProgress(s, c.id);
              return (
                <div key={c.id} className="flex items-center gap-2">
                  <CategoryBadge code={c.code} />
                  <ProgressBar value={p.percent} color={CATEGORY_THEME[c.code].hex} />
                  <span className="num w-9 text-right text-[11px] text-slate-400">{p.percent}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <section>
        <SectionTitle
          eyebrow="Asignación inteligente"
          action={
            proposals.some((p) => !p.warnings.length) && (
              <button className="btn-primary btn-sm" onClick={confirmAll}>
                <Wand2 className="h-4 w-4" /> Confirmar todas las propuestas
              </button>
            )
          }
        >
          Canchas
        </SectionTitle>
        <div className="grid gap-4 lg:grid-cols-3">
          {courts.map((court) => {
            const m = matchOnCourt(s, court.id);
            const proposal = proposals.find((p) => p.courtId === court.id);
            return (
              <AdminCourt
                key={court.id}
                court={court}
                match={m}
                proposal={proposal}
                now={now}
                courts={courts}
                onPick={() => setPicker(court)}
                actions={actions}
              />
            );
          })}
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <SectionTitle eyebrow="Orden de prioridad">Cola de partidos</SectionTitle>
          <Queue />
          {suspended.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-300">Suspendidos</h3>
              <div className="space-y-1.5">
                {suspended.map((m) => (
                  <MatchLine
                    key={m.id}
                    s={s}
                    index={index}
                    match={m}
                    categories={cats}
                    extra={
                      <div className="flex gap-1">
                        <button className="btn-secondary btn-sm" onClick={() => actions.resume(m)}>
                          <RotateCcw className="h-3 w-3" /> Reanudar
                        </button>
                        <button className="btn-ghost btn-sm" onClick={() => actions.score(m)}>
                          Resultado
                        </button>
                      </div>
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </section>
        <section>
          <SectionTitle eyebrow="Correcciones rápidas">Últimos resultados</SectionTitle>
          {recent.length ? (
            <div className="space-y-1.5">
              {recent.map((m) => (
                <MatchLine
                  key={m.id}
                  s={s}
                  index={index}
                  match={m}
                  categories={cats}
                  time={m.finishedAt}
                  extra={
                    <button className="btn-ghost btn-sm" onClick={() => actions.score(m)}>
                      Corregir
                    </button>
                  }
                />
              ))}
            </div>
          ) : (
            <Empty title="Sin resultados aún" />
          )}
        </section>
      </div>

      <Modal open={!!picker} onClose={() => setPicker(null)} title={`Elegir partido · ${picker?.name ?? ''}`} wide>
        {picker && <CandidatePicker court={picker} onPick={(m) => { void actions.assign(m, picker.id); setPicker(null); }} />}
      </Modal>
    </div>
  );
}


function AdminCourt({
  court,
  match,
  proposal,
  now,
  courts,
  onPick,
  actions,
}: {
  court: Court;
  match?: Match;
  proposal?: Proposal;
  now: Date;
  courts: Court[];
  onPick: () => void;
  actions: ReturnType<typeof useMatchActions>['actions'];
}) {
  const { snapshot: s, index } = useTournament();
  const [moveOpen, setMoveOpen] = useState(false);
  const cat = match ? s.categories.find((c) => c.id === match.categoryId) : proposal ? s.categories.find((c) => c.id === proposal.match.categoryId) : undefined;
  const theme = cat ? CATEGORY_THEME[cat.code] : null;

  return (
    <div className="card relative flex flex-col overflow-hidden p-4" style={theme && match ? { boxShadow: `inset 0 3px 0 ${theme.hex}` } : undefined}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="display text-lg text-white">{court.name}</span>
          {cat && match && <CategoryBadge code={cat.code} />}
          {match && match.phase !== 'round_robin' && <span className="chip bg-amber-400/15 text-amber-300">{PHASE_LABEL[match.phase]}</span>}
        </div>
        {match?.status === 'in_progress' ? (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-accent">
            <LiveDot /> {elapsed(match.startedAt, now)}
          </span>
        ) : match?.status === 'scheduled' ? (
          <span className="chip bg-sky-500/15 text-sky-300">
            <Timer className="h-3 w-3" /> Llamado {elapsed(match.scheduledAt, now)}
          </span>
        ) : (
          <span className="chip bg-white/5 text-slate-400">Libre</span>
        )}
      </div>

      {match ? (
        <>
          <div className="space-y-2">
            <PairLabel index={index} pairId={match.pair1Id} />
            <div className="h-px bg-white/10" />
            <PairLabel index={index} pairId={match.pair2Id} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {match.status === 'scheduled' ? (
              <button className="btn-primary btn-sm" onClick={() => actions.start(match)}>
                <Play className="h-3.5 w-3.5" /> Iniciar
              </button>
            ) : (
              <button className="btn-primary btn-sm" onClick={() => actions.score(match)}>
                <Check className="h-3.5 w-3.5" /> Resultado
              </button>
            )}
            {match.status === 'scheduled' ? (
              <button className="btn-secondary btn-sm" onClick={() => actions.score(match)}>
                <Check className="h-3.5 w-3.5" /> Resultado
              </button>
            ) : (
              <button className="btn-secondary btn-sm" onClick={() => actions.suspend(match)}>
                <Pause className="h-3.5 w-3.5" /> Suspender
              </button>
            )}
            <div className="relative">
              <button className="btn-secondary btn-sm w-full" onClick={() => setMoveOpen((o) => !o)} disabled={courts.length < 2}>
                <ArrowRightLeft className="h-3.5 w-3.5" /> Cancha <ChevronDown className="h-3 w-3" />
              </button>
              {moveOpen && (
                <div className="absolute left-0 top-full z-20 mt-1 w-full overflow-hidden rounded-xl border border-white/10 bg-ink-850 shadow-xl">
                  {courts.filter((c) => c.id !== court.id).map((c) => (
                    <button key={c.id} className="block w-full px-3 py-2 text-left text-xs hover:bg-white/10" onClick={() => { setMoveOpen(false); void actions.move(match, c.id); }}>
                      {c.name} {matchOnCourt(s, c.id) ? '(intercambiar)' : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {match.status === 'scheduled' ? (
              <button className="btn-ghost btn-sm" onClick={() => actions.postpone(match)} title="Devuelve el partido a pendientes con menor prioridad">
                <Undo2 className="h-3.5 w-3.5" /> Posponer
              </button>
            ) : (
              <button className="btn-ghost btn-sm" onClick={() => actions.unassign(match)} title="Devuelve el partido a pendientes">
                <Undo2 className="h-3.5 w-3.5" /> A pendientes
              </button>
            )}
          </div>
        </>
      ) : proposal ? (
        <div className="flex flex-1 flex-col">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-accent/80">
            <Sparkles className="h-3.5 w-3.5" /> Propuesta {cat && <CategoryBadge code={cat.code} />}
          </div>
          <div className="space-y-1.5 rounded-xl border border-dashed border-accent/25 bg-accent/[0.04] p-3">
            <PairLabel index={index} pairId={proposal.match.pair1Id} size="sm" />
            <PairLabel index={index} pairId={proposal.match.pair2Id} size="sm" />
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {proposal.reasons.slice(0, 3).map((r) => (
              <span key={r} className="chip bg-white/5 text-[10px] text-slate-400">
                {r}
              </span>
            ))}
            {proposal.warnings.map((w) => (
              <span key={w} className="chip bg-amber-500/15 text-[10px] text-amber-300">
                <AlertTriangle className="h-3 w-3" /> {w}
              </span>
            ))}
          </div>
          <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
            <button className="btn-primary btn-sm" onClick={() => actions.assign(proposal.match, court.id)}>
              <Check className="h-3.5 w-3.5" /> Confirmar
            </button>
            <button className="btn-secondary btn-sm" onClick={onPick}>
              Elegir otro
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center py-8 text-center text-sm text-slate-500">
          <PlayCircle className="mb-2 h-6 w-6 opacity-50" />
          No hay partidos elegibles
          <span className="text-xs">(parejas ocupadas o calendario completado)</span>
        </div>
      )}
    </div>
  );
}

function CandidatePicker({ court, onPick }: { court: Court; onPick: (m: Match) => void }) {
  const { snapshot: s, index } = useTournament();
  const cands = rankCandidates(s, new Date());
  const busyPending = s.matches.filter((m) => m.status === 'pending' && !cands.some((c) => c.match.id === m.id));
  return (
    <div>
      <p className="mb-3 text-sm text-slate-400">
        Partidos elegibles para {court.name}, ordenados por prioridad (descansos, vuelta, progreso de la categoría y espera de las parejas).
      </p>
      <div className="max-h-[55vh] space-y-1.5 overflow-y-auto pr-1">
        {cands.map((c, i) => {
          const cat = s.categories.find((x) => x.id === c.match.categoryId)!;
          return (
            <button key={c.match.id} className="flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-left transition hover:border-accent/40 hover:bg-white/[0.05]" onClick={() => onPick(c.match)}>
              <span className="num w-5 text-xs text-slate-500">{i + 1}</span>
              <CategoryBadge code={cat.code} />
              <div className="min-w-0 flex-1 text-sm">
                <div className="truncate text-white">{index.pairName(c.match.pair1Id)}</div>
                <div className="truncate text-slate-300">{index.pairName(c.match.pair2Id)}</div>
              </div>
              <div className="text-right text-[11px]">
                <div className="text-slate-500">{c.match.phase === 'round_robin' ? `V${c.match.leg} · J${c.match.round}` : PHASE_LABEL[c.match.phase]}</div>
                {!c.restOk && <div className="text-amber-300">Descanso: faltan {c.restDeficit} min</div>}
                {c.match.postponedCount > 0 && <div className="text-slate-400">Pospuesto</div>}
              </div>
            </button>
          );
        })}
        {!cands.length && <Empty title="No hay partidos elegibles" />}
      </div>
      {busyPending.length > 0 && <p className="mt-3 text-xs text-slate-500">{busyPending.length} partidos pendientes no aparecen porque alguna de sus parejas está ocupada en otra cancha.</p>}
    </div>
  );
}

function Queue() {
  const { snapshot: s, index } = useTournament();
  const cands = rankCandidates(s, new Date()).slice(0, 8);
  if (!cands.length) return <Empty title="Sin partidos en cola" />;
  return (
    <div className="space-y-1.5">
      {cands.map((c, i) => {
        const cat = s.categories.find((x) => x.id === c.match.categoryId)!;
        return (
          <div key={c.match.id} className={cx('flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2')} style={{ borderLeft: `3px solid ${CATEGORY_THEME[cat.code].hex}` }}>
            <span className="num w-5 text-xs text-slate-500">{i + 1}</span>
            <div className="min-w-0 flex-1 text-sm leading-tight">
              <div className="truncate text-white">{index.pairName(c.match.pair1Id)}</div>
              <div className="truncate text-slate-400">{index.pairName(c.match.pair2Id)}</div>
            </div>
            {!c.restOk ? <span className="chip bg-amber-500/15 text-amber-300">Descansa {c.restDeficit}′</span> : <span className="chip bg-white/5 text-slate-400">V{c.match.leg}·J{c.match.round}</span>}
          </div>
        );
      })}
    </div>
  );
}
