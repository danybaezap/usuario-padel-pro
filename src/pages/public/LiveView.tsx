import { motion } from 'framer-motion';
import { Clock, History } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CourtCard, MatchLine, useCategoryMap } from '@/components/sport';
import { Podium, StandingsTable } from '@/components/standings';
import { CategoryBadge, Empty, ProgressBar, SectionTitle, Tabs } from '@/components/ui';
import { CATEGORY_THEME } from '@/domain/defaults';
import { matchOnCourt } from '@/domain/scheduler';
import { categoryProgress, computeStandings } from '@/domain/standings';
import { useEstimates, upcomingOrdered } from '@/hooks/useEstimates';
import { useNow, useTournament } from '@/hooks/useTournament';
import { PairLabel } from '@/components/sport';

export default function LiveView() {
  const { snapshot: s, index } = useTournament();
  const now = useNow(15000);
  const est = useEstimates(s, now);
  const cats = useCategoryMap(s);
  const slug = s.tournament.slug;
  const activeCats = s.categories.filter((c) => s.pairs.some((p) => p.categoryId === c.id));
  const [tab, setTab] = useState(activeCats[0]?.id ?? s.categories[0].id);
  const upcoming = upcomingOrdered(s, est).filter((u) => u.match.status === 'pending');
  const recent = s.matches
    .filter((m) => m.status === 'finished')
    .sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''))
    .slice(0, 6);
  const courts = s.courts.filter((c) => c.active).sort((a, b) => a.number - b.number);
  const nextByCourt = new Map<string, string>();
  for (const u of upcoming) if (u.slot && !nextByCourt.has(u.slot.courtId)) nextByCourt.set(u.slot.courtId, u.match.id);

  if (!s.matches.length)
    return (
      <Empty title="El torneo aún no ha comenzado">
        Hay {s.pairs.length} parejas inscritas. El calendario de partidos aparecerá aquí en cuanto la organización lo genere.
      </Empty>
    );

  return (
    <div className="space-y-10">
      <section>
        <SectionTitle eyebrow="Ahora mismo">Canchas</SectionTitle>
        <div className="grid gap-4 md:grid-cols-3">
          {courts.map((c) => {
            const nextId = nextByCourt.get(c.id);
            return (
              <CourtCard key={c.id} s={s} index={index} court={c} match={matchOnCourt(s, c.id)} now={now} slug={slug} next={nextId ? s.matches.find((m) => m.id === nextId) : undefined} />
            );
          })}
        </div>
      </section>

      <section>
        <SectionTitle eyebrow="Vista general">Líderes por categoría</SectionTitle>
        <div className="grid gap-4 lg:grid-cols-3">
          {activeCats.map((c) => {
            const st = computeStandings(s, c.id).slice(0, 3);
            const pr = categoryProgress(s, c.id);
            const theme = CATEGORY_THEME[c.code];
            return (
              <motion.div layout key={c.id} className="card relative overflow-hidden p-5">
                <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${theme.gradient}`} />
                <div className="relative">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CategoryBadge code={c.code} size="md" />
                      <span className="display text-xl text-white">{c.name}</span>
                    </div>
                    <span className="text-xs text-slate-400">{pr.percent}%</span>
                  </div>
                  <ProgressBar value={pr.percent} color={theme.hex} className="mb-4" />
                  {c.podium.length ? (
                    <Podium s={s} index={index} category={c} slug={slug} />
                  ) : (
                    <ol className="space-y-2">
                      {st.map((r) => (
                        <li key={r.pairId} className="flex items-center gap-3">
                          <span className="display w-5 text-center text-lg" style={{ color: r.position === 1 && r.played ? theme.hex : '#94a3b8' }}>
                            {r.position}
                          </span>
                          <div className="min-w-0 flex-1">
                            <PairLabel index={index} pairId={r.pairId} slug={slug} size="sm" />
                          </div>
                          <span className="num text-sm font-bold text-white">{r.won}G</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <SectionTitle eyebrow="Orden estimado" action={<Link to={`/t/${slug}/calendario`} className="btn-ghost btn-sm">Calendario completo</Link>}>
            Próximos partidos
          </SectionTitle>
          {upcoming.length ? (
            <div className="space-y-2">
              {upcoming.slice(0, 6).map(({ match, slot }) => (
                <MatchLine key={match.id} s={s} index={index} match={match} slug={slug} categories={cats} time={slot?.start} />
              ))}
              <p className="flex items-center gap-1.5 pt-1 text-[11px] text-slate-500">
                <Clock className="h-3 w-3" /> Horas estimadas; pueden variar según la duración de los partidos.
              </p>
            </div>
          ) : (
            <Empty title="No hay partidos pendientes" />
          )}
        </section>
        <section>
          <SectionTitle eyebrow="Recién terminados">Últimos resultados</SectionTitle>
          {recent.length ? (
            <div className="space-y-2">
              {recent.map((m) => (
                <MatchLine key={m.id} s={s} index={index} match={m} slug={slug} categories={cats} time={m.finishedAt} />
              ))}
            </div>
          ) : (
            <Empty icon={<History className="h-6 w-6" />} title="Aún no hay resultados" />
          )}
        </section>
      </div>

      <section>
        <SectionTitle
          eyebrow="Clasificación"
          action={
            <Tabs
              value={tab}
              onChange={setTab}
              items={s.categories.map((c) => ({ value: c.id, label: <><CategoryBadge code={c.code} /> {c.code}</> }))}
            />
          }
        >
          {cats.get(tab)?.name}
        </SectionTitle>
        <div className="card p-4 sm:p-5">
          <StandingsTable s={s} index={index} category={cats.get(tab)!} slug={slug} />
        </div>
      </section>
    </div>
  );
}
