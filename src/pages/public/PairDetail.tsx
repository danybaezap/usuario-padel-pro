import { ArrowLeft, Flame, Swords } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { MatchDiffBars, RankLine } from '@/components/charts';
import { MatchLine, PairLabel, useCategoryMap } from '@/components/sport';
import { CategoryBadge, Empty, Medal, Stat, cx } from '@/components/ui';
import { CATEGORY_THEME } from '@/domain/defaults';
import { computeStandings, rankingEvolution } from '@/domain/standings';
import { headToHeadSummary, pairHistory, pairUpcoming, streaks } from '@/domain/stats';
import { PHASE_LABEL } from '@/domain/types';
import { useEstimates } from '@/hooks/useEstimates';
import { useNow, useTournament } from '@/hooks/useTournament';
import { hhmm, signed } from '@/lib/format';

export default function PairDetail() {
  const { pairId = '' } = useParams();
  const { snapshot: s, index } = useTournament();
  const now = useNow(60000);
  const est = useEstimates(s, now);
  const cats = useCategoryMap(s);
  const pair = index.pairById.get(pairId);
  if (!pair) return <Empty title="Pareja no encontrada" />;
  const cat = cats.get(pair.categoryId)!;
  const theme = CATEGORY_THEME[cat.code];
  const slug = s.tournament.slug;
  const st = computeStandings(s, cat.id);
  const row = st.find((r) => r.pairId === pairId)!;
  const history = pairHistory(s, pairId);
  const upcoming = pairUpcoming(s, pairId);
  const str = streaks(history);
  const h2h = headToHeadSummary(history);
  const evo = rankingEvolution(s, cat.id);
  const points = evo.map((e) => {
    const m = s.matches.find((x) => x.id === e.matchId)!;
    return { step: e.step, position: e.positions[pairId], label: `Tras ${index.pairName(m.pair1Id)} vs ${index.pairName(m.pair2Id)}` };
  });
  const [a, b] = index.pairPlayers(pairId);
  const rivals = s.pairs.filter((p) => p.categoryId === cat.id && p.id !== pairId);

  return (
    <div className="space-y-6">
      <Link to={`/t/${slug}/parejas`} className="btn-ghost btn-sm -ml-2">
        <ArrowLeft className="h-4 w-4" /> Parejas
      </Link>

      <div className="card relative overflow-hidden p-5 sm:p-7">
        <div className={cx('pointer-events-none absolute inset-0 bg-gradient-to-br', theme.gradient)} />
        <div className="relative flex flex-wrap items-center gap-5">
          <Medal position={row.played ? row.position : 99} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2 text-sm text-slate-300">
              <CategoryBadge code={cat.code} /> {cat.name} · Pareja #{pair.number}
            </div>
            <h1 className="display text-3xl leading-tight text-white sm:text-4xl">
              {a}
              <span className="text-slate-500"> / </span>
              {b}
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              {row.played ? `${row.position}º de ${st.length}` : 'Sin partidos todavía'}
              {cat.podium[0] === pairId && ' · 🏆 Campeona'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Jugados" value={row.played} sub={`${row.remaining} por jugar`} />
        <Stat label="Victorias" value={`${row.won}-${row.lost}`} sub={row.played ? `${Math.round(row.winPct)}%` : '–'} />
        <Stat label="Sets" value={`${row.setsWon}-${row.setsLost}`} />
        <Stat label="Juegos" value={signed(row.gameDiff)} sub={`${row.gamesWon} a favor · ${row.gamesLost} en contra`} />
        <Stat
          label="Racha"
          value={str.current ? `${str.current.type === 'W' ? 'V' : 'D'}${str.current.length}` : '–'}
          sub={<span className="inline-flex items-center gap-1"><Flame className="h-3 w-3" /> Mejor: {str.bestWin} V</span>}
        />
        <Stat label="Posición" value={row.played ? `${row.position}º` : '–'} sub={`de ${st.length} parejas`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="display mb-3 text-lg text-white">Próximos partidos</h2>
          {upcoming.length ? (
            <div className="space-y-2">
              {upcoming.map((m) => (
                <MatchLine
                  key={m.id}
                  s={s}
                  index={index}
                  match={m}
                  slug={slug}
                  categories={cats}
                  showCategory={false}
                  time={m.status === 'pending' ? est.get(m.id)?.start : m.startedAt ?? m.scheduledAt}
                  extra={m.status === 'pending' && est.get(m.id) ? <span className="text-[10px] text-slate-500">≈ {hhmm(est.get(m.id)!.start)} (estimado)</span> : null}
                />
              ))}
            </div>
          ) : (
            <Empty title="Sin partidos pendientes" />
          )}
        </section>
        <section className="card p-5">
          <h2 className="display mb-3 text-lg text-white">Evolución en el ranking</h2>
          <RankLine points={points} total={st.length} color={theme.hex} />
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="display mb-3 text-lg text-white">Resultados</h2>
          {history.length ? (
            <div className="space-y-2">
              {[...history].reverse().map((h) => (
                <div key={h.match.id} className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5">
                  <span className={cx('display flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-lg', h.won ? 'bg-lime-court/15 text-lime-court' : 'bg-rose-500/15 text-rose-300')}>{h.won ? 'V' : 'D'}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] text-slate-500">vs {h.match.phase !== 'round_robin' ? `· ${PHASE_LABEL[h.match.phase]}` : ''}</div>
                    <PairLabel index={index} pairId={h.opponentId} slug={slug} size="sm" />
                  </div>
                  <div className="text-right">
                    <div className="num text-sm font-bold text-white">{h.score}</div>
                    <div className="text-[11px] text-slate-500">{hhmm(h.match.finishedAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="Aún no ha disputado partidos" />
          )}
        </section>
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="display mb-3 text-lg text-white">Rendimiento por partido</h2>
            <p className="mb-3 text-xs text-slate-500">Diferencia de juegos en cada encuentro (W.O. y abandonos según marcador oficial).</p>
            <MatchDiffBars items={history.map((h) => ({ label: `vs #${index.pairById.get(h.opponentId)?.number ?? ''} ${index.pairPlayers(h.opponentId)[0].split(' ')[0]}`, diff: h.gamesFor - h.gamesAgainst, won: h.won }))} />
          </section>
          <section className="card p-5">
            <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold uppercase text-white">
              <Swords className="h-4 w-4" /> Enfrentamientos directos
            </h2>
            <div className="space-y-1.5">
              {rivals.map((r) => {
                const rec = h2h.get(r.id);
                return (
                  <div key={r.id} className="flex items-center gap-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <PairLabel index={index} pairId={r.id} slug={slug} size="sm" />
                    </div>
                    {rec ? (
                      <span className={cx('chip', rec.won > rec.lost ? 'bg-lime-court/15 text-lime-court' : rec.won < rec.lost ? 'bg-rose-500/15 text-rose-300' : 'bg-white/5 text-slate-300')}>
                        {rec.won}-{rec.lost} · {rec.matches.map((m) => m.score).join(' / ')}
                      </span>
                    ) : (
                      <span className="chip bg-white/5 text-slate-400">Pendiente</span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
