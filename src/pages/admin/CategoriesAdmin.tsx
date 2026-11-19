import { CalendarPlus, Dices, Flag, Medal as MedalIcon, RotateCcw, Swords, Trash2, Trophy } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MatchLine, useCategoryMap } from '@/components/sport';
import { Podium, StandingsTable } from '@/components/standings';
import { CategoryBadge, ProgressBar, SectionTitle, cx, useConfirm } from '@/components/ui';
import {
  cancelPlayoffs,
  clearSchedule,
  declareChampions,
  finishTournament,
  generateSchedule,
  performDraw,
  reopenCategory,
  reopenTournament,
  startPlayoffs,
} from '@/domain/commands';
import { CATEGORY_THEME } from '@/domain/defaults';
import { previewSchedule } from '@/domain/roundRobin';
import { categoryProgress, computeStandings } from '@/domain/standings';
import type { Category, ScheduleConfig } from '@/domain/types';
import { useTournament } from '@/hooks/useTournament';

export default function CategoriesAdmin() {
  const { snapshot: s, run } = useTournament();
  const { ask, dialog } = useConfirm();
  const allDone = s.categories.filter((c) => s.pairs.some((p) => p.categoryId === c.id)).every((c) => c.status === 'finished');
  return (
    <div className="space-y-8">
      {dialog}
      <SectionTitle
        eyebrow="Competición"
        action={
          s.tournament.status === 'finished' ? (
            <div className="flex gap-2">
              <Link to={`/t/${s.tournament.slug}/premiacion`} className="btn-primary btn-sm">
                <Trophy className="h-4 w-4" /> Pantalla de premiación
              </Link>
              <button className="btn-secondary btn-sm" onClick={() => run(reopenTournament, 'Torneo reabierto')}>
                Reabrir torneo
              </button>
            </div>
          ) : (
            <button
              className="btn-primary btn-sm"
              disabled={!allDone || !s.pairs.length}
              title={allDone ? '' : 'Todas las categorías con parejas deben tener campeones'}
              onClick={async () => {
                if (await ask('Finalizar torneo', 'Se cerrará el torneo y se mostrará la pantalla de premiación en todas las pantallas públicas.', { confirm: 'Finalizar torneo' }))
                  await run(finishTournament, 'Torneo finalizado 🏆');
              }}
            >
              <Flag className="h-4 w-4" /> Finalizar torneo
            </button>
          )
        }
      >
        Categorías, calendario y cierre
      </SectionTitle>
      {s.categories.map((c) => (
        <CategoryCard key={c.id} category={c} ask={ask} />
      ))}
    </div>
  );
}

function CategoryCard({ category: c, ask }: { category: Category; ask: ReturnType<typeof useConfirm>['ask'] }) {
  const { snapshot: s, index, run } = useTournament();
  const cats = useCategoryMap(s);
  const theme = CATEGORY_THEME[c.code];
  const pairs = s.pairs.filter((p) => p.categoryId === c.id);
  const hasMatches = s.matches.some((m) => m.categoryId === c.id);
  const started = s.matches.some((m) => m.categoryId === c.id && m.status !== 'pending');
  const progress = categoryProgress(s, c.id);
  const standings = computeStandings(s, c.id);
  const topTie3 = standings.slice(0, 3).some((r) => r.unresolvedTie);
  const topTie = standings.slice(0, 4).some((r) => r.unresolvedTie);
  const anyTie = standings.some((r) => r.unresolvedTie);
  const [cfg, setCfg] = useState<ScheduleConfig>({ mode: 'legs', legs: 1, matchesPerPair: Math.max(1, Math.min(3, pairs.length - 1)) });
  const [po, setPo] = useState<{ size: 2 | 4; thirdPlaceMatch: boolean }>({ size: pairs.length >= 4 ? 4 : 2, thirdPlaceMatch: false });
  const playoffMatches = s.matches.filter((m) => m.categoryId === c.id && m.phase !== 'round_robin').sort((a, b) => a.orderIndex - b.orderIndex);
  let preview: ReturnType<typeof previewSchedule> | null = null;
  let previewError = '';
  try {
    if (pairs.length >= 2) preview = previewSchedule(pairs.map((p) => p.id), cfg);
  } catch (e) {
    previewError = (e as Error).message;
  }

  const statusLabel = { registration: 'Inscripciones', round_robin: 'Round Robin', playoffs: 'Fase final', finished: 'Finalizada' }[c.status];

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] px-5 py-4" style={{ background: `linear-gradient(90deg, ${theme.hex}1f, transparent)` }}>
        <CategoryBadge code={c.code} size="lg" />
        <div className="min-w-0 flex-1">
          <h3 className="display text-2xl text-white">{c.name}</h3>
          <div className="text-xs text-slate-400">
            {pairs.length} parejas · {statusLabel}
            {c.scheduleConfig && ` · ${c.scheduleConfig.mode === 'legs' ? `${c.scheduleConfig.legs} vuelta(s)` : `${c.scheduleConfig.matchesPerPair} partidos por pareja`}`}
          </div>
        </div>
        {hasMatches && (
          <div className="flex w-48 items-center gap-2">
            <ProgressBar value={progress.percent} color={theme.hex} />
            <span className="num text-xs text-slate-400">
              {progress.finished}/{progress.total - progress.cancelled}
            </span>
          </div>
        )}
      </div>

      <div className="space-y-5 p-5">
        {/* 1. Generación del calendario */}
        {!hasMatches && (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="mb-3 flex items-center gap-2 font-semibold text-white">
              <CalendarPlus className="h-4 w-4" /> Calendario Round Robin
            </div>
            {pairs.length < 2 ? (
              <p className="text-sm text-slate-400">Se necesitan al menos 2 parejas.</p>
            ) : (
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="label">Formato</label>
                  <select className="input w-auto" value={cfg.mode} onChange={(e) => setCfg({ ...cfg, mode: e.target.value as ScheduleConfig['mode'] })}>
                    <option value="legs">Vueltas completas (todos contra todos)</option>
                    <option value="matches_per_pair">Número reducido de partidos</option>
                  </select>
                </div>
                {cfg.mode === 'legs' ? (
                  <div>
                    <label className="label">Vueltas</label>
                    <input type="number" min={1} max={6} className="input w-24" value={cfg.legs} onChange={(e) => setCfg({ ...cfg, legs: Math.max(1, Number(e.target.value)) })} />
                  </div>
                ) : (
                  <div>
                    <label className="label">Partidos por pareja</label>
                    <input type="number" min={1} max={(pairs.length - 1) * 6} className="input w-24" value={cfg.matchesPerPair} onChange={(e) => setCfg({ ...cfg, matchesPerPair: Math.max(1, Number(e.target.value)) })} />
                  </div>
                )}
                {preview && (
                  <div className="text-sm text-slate-300">
                    <b className="text-white">{preview.totalMatches}</b> partidos · {preview.minPerPair === preview.maxPerPair ? `${preview.minPerPair} por pareja` : `${preview.minPerPair}–${preview.maxPerPair} por pareja`}
                    {pairs.length % 2 === 1 && <span className="block text-xs text-slate-500">Número impar: en cada jornada descansa una pareja.</span>}
                    {!preview.balanced && <span className="block text-xs text-amber-300">Atención: no todas las parejas jugarán el mismo número de partidos.</span>}
                  </div>
                )}
                {previewError && <span className="text-sm text-rose-300">{previewError}</span>}
                <button
                  className="btn-primary ml-auto"
                  disabled={!preview}
                  onClick={async () => {
                    if (await ask('Generar calendario', <>Se generarán {preview?.totalMatches} partidos para {c.name}. A partir de ese momento las parejas de la categoría quedan fijas.</>, { confirm: 'Generar' }))
                      await run((x) => generateSchedule(x, c.id, cfg), `Calendario de ${c.name} generado`);
                  }}
                >
                  Generar calendario
                </button>
              </div>
            )}
          </div>
        )}
        {hasMatches && !started && (
          <button
            className="btn-ghost btn-sm"
            onClick={async () => {
              if (await ask('Eliminar calendario', 'Se borrarán los partidos de esta categoría (aún no se ha jugado ninguno) y se reabrirán las inscripciones.', { confirm: 'Eliminar', danger: true }))
                await run((x) => clearSchedule(x, c.id), 'Calendario eliminado');
            }}
          >
            <Trash2 className="h-4 w-4" /> Eliminar calendario para modificar inscripciones o formato
          </button>
        )}

        {hasMatches && (
          <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
            <StandingsTable s={s} index={index} category={c} compact />
            <div className="space-y-3">
              {/* 2. Cierre de round robin */}
              {c.status === 'round_robin' && (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-sm">
                  <div className="mb-2 font-semibold text-white">Cierre del Round Robin</div>
                  {!progress.complete ? (
                    <p className="text-slate-400">
                      Faltan <b className="text-white">{progress.total - progress.finished - progress.cancelled}</b> partidos. Los campeones solo se pueden declarar cuando todos los partidos estén disputados o cancelados.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {anyTie && (
                        <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-rose-200">
                          Hay parejas empatadas en todos los criterios. Último criterio: sorteo.
                          <button
                            className="btn-secondary btn-sm mt-2 w-full"
                            onClick={async () => {
                              if (await ask('Realizar sorteo', 'La aplicación ordenará al azar las parejas empatadas y el resultado quedará registrado y visible para todos.', { confirm: 'Sortear' }))
                                await run((x) => performDraw(x, c.id), 'Sorteo realizado');
                            }}
                          >
                            <Dices className="h-4 w-4" /> Realizar sorteo
                          </button>
                        </div>
                      )}
                      <button
                        className="btn-primary w-full"
                        disabled={topTie3}
                        onClick={async () => {
                          if (await ask('Declarar campeones', <>Se proclamará el podio de {c.name} según la clasificación final del Round Robin.</>, { confirm: 'Declarar campeones' }))
                            await run((x) => declareChampions(x, c.id), `🏆 Campeones de ${c.name} declarados`);
                        }}
                      >
                        <Trophy className="h-4 w-4" /> Declarar campeones
                      </button>
                      <div className="rounded-lg border border-white/10 p-3">
                        <div className="mb-2 flex items-center gap-1.5 font-semibold text-slate-200">
                          <Swords className="h-4 w-4" /> Fase eliminatoria (opcional)
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <select className="input w-auto py-1.5 text-xs" value={po.size} onChange={(e) => setPo({ ...po, size: Number(e.target.value) as 2 | 4 })}>
                            {pairs.length >= 4 && <option value={4}>Semifinales (1º-4º, 2º-3º) + final</option>}
                            <option value={2}>Final directa (1º vs 2º)</option>
                          </select>
                          {po.size === 4 && (
                            <label className="flex items-center gap-1.5 text-xs text-slate-300">
                              <input type="checkbox" checked={po.thirdPlaceMatch} onChange={(e) => setPo({ ...po, thirdPlaceMatch: e.target.checked })} /> Partido por el 3er puesto
                            </label>
                          )}
                        </div>
                        {po.size === 4 && !po.thirdPlaceMatch && <p className="mt-1 text-[11px] text-slate-500">Sin partido por el 3er puesto, el tercer lugar es el semifinalista perdedor mejor clasificado en el Round Robin.</p>}
                        <button
                          className="btn-secondary btn-sm mt-2 w-full"
                          disabled={topTie}
                          onClick={async () => {
                            if (await ask('Activar fase eliminatoria', <>Se crearán los cruces de {po.size === 4 ? 'semifinales' : 'la final'} para {c.name} con la clasificación actual. Puedes desactivarla mientras no haya comenzado ningún partido.</>, { confirm: 'Activar fase final' }))
                              await run((x) => startPlayoffs(x, c.id, po), 'Fase eliminatoria activada');
                          }}
                        >
                          Activar fase eliminatoria
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 3. Fase final */}
              {(c.status === 'playoffs' || (c.status === 'finished' && playoffMatches.length > 0)) && (
                <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-4 text-sm">
                  <div className="mb-2 font-semibold text-amber-200">Fase eliminatoria</div>
                  <div className="space-y-1.5">
                    {playoffMatches.map((m) => (
                      <MatchLine key={m.id} s={s} index={index} match={m} categories={cats} showCategory={false} />
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">Asigna y registra estos partidos desde Control en vivo. La final se crea al terminar ambas semifinales.</p>
                  {c.status === 'playoffs' && playoffMatches.every((m) => m.status === 'pending') && (
                    <button className="btn-ghost btn-sm mt-2" onClick={() => run((x) => cancelPlayoffs(x, c.id), 'Fase eliminatoria desactivada')}>
                      Desactivar fase eliminatoria
                    </button>
                  )}
                </div>
              )}

              {/* 4. Podio */}
              {c.status === 'finished' && (
                <div className="rounded-xl border border-white/[0.06] p-4">
                  <div className="mb-3 flex items-center gap-2 font-semibold text-white">
                    <MedalIcon className="h-4 w-4 text-amber-300" /> Podio oficial
                  </div>
                  <Podium s={s} index={index} category={c} />
                  {s.tournament.status !== 'finished' && (
                    <button
                      className={cx('btn-ghost btn-sm mt-3')}
                      onClick={async () => {
                        if (await ask('Reabrir categoría', 'Se retirará el podio para poder corregir resultados. Tendrás que volver a declarar campeones.', { confirm: 'Reabrir', danger: true }))
                          await run((x) => reopenCategory(x, c.id), 'Categoría reabierta');
                      }}
                    >
                      <RotateCcw className="h-4 w-4" /> Reabrir para corregir
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
