import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Crown, Info, Trophy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CATEGORY_THEME } from '@/domain/defaults';
import { categoryProgress, computeStandings, type StandingRow } from '@/domain/standings';
import type { Category, TournamentSnapshot } from '@/domain/types';
import { CRITERION_LABEL } from '@/domain/types';
import type { SnapshotIndex } from '@/domain/util';
import { signed } from '@/lib/format';
import { PairLabel } from './sport';
import { Medal, ProgressBar, cx } from './ui';

/** Detecta cambios de posición para resaltar filas que suben o bajan. */
function useMovement(rows: StandingRow[]) {
  const prev = useRef<Map<string, number>>(new Map());
  const [moves, setMoves] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const before = prev.current.get(r.pairId);
      if (before !== undefined && before !== r.position) m.set(r.pairId, before - r.position);
    }
    prev.current = new Map(rows.map((r) => [r.pairId, r.position]));
    if (m.size) {
      setMoves(m);
      const t = window.setTimeout(() => setMoves(new Map()), 4000);
      return () => window.clearTimeout(t);
    }
  }, [rows]);
  return moves;
}

export function StandingsTable({
  s,
  index,
  category,
  slug,
  compact,
  tv,
  highlightPairId,
}: {
  s: TournamentSnapshot;
  index: SnapshotIndex;
  category: Category;
  slug?: string;
  compact?: boolean;
  tv?: boolean;
  highlightPairId?: string;
}) {
  const rows = computeStandings(s, category.id);
  const progress = categoryProgress(s, category.id);
  const moves = useMovement(rows);
  const theme = CATEGORY_THEME[category.code];
  const hasTie = rows.some((r) => r.unresolvedTie && r.played > 0);
  const podium = category.podium;

  if (!rows.length)
    return <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-400">Sin parejas inscritas en {category.name}.</div>;

  const th = cx('px-2 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500', tv && 'text-sm py-3');
  const td = cx('px-2 py-2.5 text-center num', tv ? 'text-2xl py-4' : 'text-sm');

  return (
    <div>
      {!compact && (
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex min-w-[180px] flex-1 items-center gap-3">
            <ProgressBar value={progress.percent} color={theme.hex} className="max-w-xs" />
            <span className={cx('whitespace-nowrap text-xs text-slate-400', tv && 'text-lg')}>
              {progress.finished}/{progress.total - progress.cancelled} partidos
            </span>
          </div>
          {category.status === 'finished' && (
            <span className="chip bg-amber-400/15 text-amber-300">
              <Trophy className="h-3 w-3" /> Categoría finalizada
            </span>
          )}
          {category.status === 'playoffs' && <span className="chip bg-amber-400/15 text-amber-300">Fase final en juego</span>}
          {progress.unevenPlayed && !progress.complete && (
            <span className={cx('chip bg-sky-400/10 text-sky-300', tv && 'text-base')}>
              <Info className="h-3 w-3" /> Partidos jugados desiguales: compara la columna PJ
            </span>
          )}
          {progress.unevenAssigned && (
            <span className="chip bg-amber-500/10 text-amber-300" title="Con este calendario no todas las parejas juegan el mismo número de partidos.">
              <AlertTriangle className="h-3 w-3" /> Calendario con nº de partidos distinto por pareja
            </span>
          )}
          {hasTie && progress.complete && (
            <span className="chip bg-rose-500/10 text-rose-300">
              <AlertTriangle className="h-3 w-3" /> Empate pendiente de sorteo
            </span>
          )}
        </div>
      )}
      <div className="scrollbar-thin -mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[320px] border-separate border-spacing-y-1">
          <thead>
            <tr>
              <th className={cx(th, 'w-10 text-center')}>#</th>
              <th className={cx(th, 'text-left')}>Pareja</th>
              <th className={th} title="Partidos jugados">PJ</th>
              <th className={th} title="Ganados">G</th>
              <th className={th} title="Perdidos">P</th>
              {!compact && <th className={cx(th, 'hidden sm:table-cell')} title="Porcentaje de victorias">%</th>}
              {!compact && <th className={cx(th, 'hidden md:table-cell')} title="Sets ganados - perdidos">Sets</th>}
              {!compact && <th className={cx(th, 'hidden lg:table-cell')} title="Juegos a favor">JF</th>}
              {!compact && <th className={cx(th, 'hidden lg:table-cell')} title="Juegos en contra">JC</th>}
              <th className={th} title="Diferencia de juegos">Dif</th>
              {!compact && !tv && <th className={cx(th, 'hidden xl:table-cell')}>Forma</th>}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {rows.map((r) => {
                const move = moves.get(r.pairId);
                const top = r.position <= 3 && r.played > 0;
                const podiumPos = podium.indexOf(r.pairId);
                return (
                  <motion.tr
                    key={r.pairId}
                    layout
                    transition={{ type: 'spring', damping: 30, stiffness: 260 }}
                    className={cx(
                      'group',
                      move !== undefined && 'animate-flash',
                      highlightPairId === r.pairId && 'outline outline-1 outline-lime-court/60',
                    )}
                    style={{ background: top ? `linear-gradient(90deg, ${theme.hex}${r.position === 1 ? '26' : '14'}, transparent 70%)` : 'rgba(255,255,255,0.02)' }}
                  >
                    <td className={cx(td, 'rounded-l-xl')}>
                      <div className="flex items-center justify-center gap-1">
                        {r.played > 0 ? <Medal position={r.position} size={tv ? 'lg' : 'sm'} /> : <span className="text-slate-500">{r.position}</span>}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        <PairLabel index={index} pairId={r.pairId} slug={slug} size={tv ? 'lg' : 'sm'} />
                        {podiumPos === 0 && <Crown className="h-4 w-4 shrink-0 text-amber-300" aria-label="Campeona" />}
                        {move !== undefined && (
                          <motion.span initial={{ opacity: 0, y: move > 0 ? 6 : -6 }} animate={{ opacity: 1, y: 0 }} className={cx('chip', move > 0 ? 'bg-lime-court/15 text-lime-court' : 'bg-rose-500/15 text-rose-300')}>
                            {move > 0 ? '▲' : '▼'} {Math.abs(move)}
                          </motion.span>
                        )}
                        {r.unresolvedTie && <span className="chip bg-rose-500/10 text-rose-300" title="Empate absoluto: requiere sorteo">=</span>}
                        {!tv && r.decidedBy && r.decidedBy !== 'wins' && (
                          <span className="hidden text-[10px] text-slate-500 2xl:inline" title="Criterio que decidió esta posición">
                            {r.decidedBy === 'draw' ? 'sorteo' : CRITERION_LABEL[r.decidedBy].toLowerCase()}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={cx(td, 'text-slate-300')}>
                      {r.played}
                      {r.remaining > 0 && !tv && <span className="ml-0.5 text-[10px] text-slate-600">/{r.totalAssigned}</span>}
                    </td>
                    <td className={cx(td, 'font-bold text-white')}>{r.won}</td>
                    <td className={cx(td, 'text-slate-400')}>{r.lost}</td>
                    {!compact && <td className={cx(td, 'hidden text-slate-300 sm:table-cell')}>{r.played ? `${Math.round(r.winPct)}%` : '–'}</td>}
                    {!compact && (
                      <td className={cx(td, 'hidden text-slate-300 md:table-cell')}>
                        {r.setsWon}-{r.setsLost}
                      </td>
                    )}
                    {!compact && <td className={cx(td, 'hidden text-slate-300 lg:table-cell')}>{r.gamesWon}</td>}
                    {!compact && <td className={cx(td, 'hidden text-slate-300 lg:table-cell')}>{r.gamesLost}</td>}
                    <td className={cx(td, 'font-semibold', r.gameDiff > 0 ? 'text-lime-court' : r.gameDiff < 0 ? 'text-rose-300' : 'text-slate-400', (compact || tv) && 'rounded-r-xl')}>
                      {signed(r.gameDiff)}
                    </td>
                    {!compact && !tv && (
                      <td className="hidden rounded-r-xl px-2 xl:table-cell">
                        <div className="flex justify-center gap-1">
                          {r.form.map((f, i) => (
                            <span key={i} className={cx('h-2 w-2 rounded-full', f === 'W' ? 'bg-lime-court' : 'bg-rose-400/70')} title={f === 'W' ? 'Victoria' : 'Derrota'} />
                          ))}
                        </div>
                      </td>
                    )}
                  </motion.tr>
                );
              })}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
      {!compact && !tv && (
        <p className="mt-2 text-[11px] text-slate-500">
          Orden: victorias → {s.tournament.settings.tiebreakers.map((c) => CRITERION_LABEL[c].toLowerCase()).join(' → ')} → sorteo.
        </p>
      )}
    </div>
  );
}

export function Podium({ s, index, category, slug, big }: { s: TournamentSnapshot; index: SnapshotIndex; category: Category; slug?: string; big?: boolean }) {
  const rows = computeStandings(s, category.id);
  const ids = category.podium.length ? category.podium : rows.filter((r) => r.played > 0).slice(0, 3).map((r) => r.pairId);
  const official = category.podium.length > 0;
  const theme = CATEGORY_THEME[category.code];
  const order = [1, 0, 2]; // 2º, 1º, 3º
  const heights = big ? ['h-40', 'h-56', 'h-32'] : ['h-16', 'h-24', 'h-12'];
  if (!ids.length) return <div className="py-6 text-center text-sm text-slate-500">Aún sin resultados.</div>;
  return (
    <div>
      <div className="flex items-end justify-center gap-2 sm:gap-3">
        {order.map((i, col) => {
          const pairId = ids[i];
          if (!pairId) return <div key={i} className="flex-1" />;
          return (
            <motion.div
              key={pairId}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * col }}
              className="flex min-w-0 flex-1 flex-col items-center"
            >
              <div className="mb-2 flex w-full flex-col items-center text-center">
                <Medal position={i + 1} size={big ? 'lg' : 'md'} />
                <div className="mt-2 w-full">
                  <PairLabel index={index} pairId={pairId} slug={slug} size={big ? 'lg' : 'sm'} showNumber={false} align="left" />
                </div>
              </div>
              <div
                className={cx('w-full rounded-t-xl border-x border-t', heights[col])}
                style={{
                  background: `linear-gradient(180deg, ${theme.hex}${i === 0 ? '55' : '30'}, ${theme.hex}08)`,
                  borderColor: `${theme.hex}44`,
                }}
              >
                <div className={cx('display pt-2 text-center text-white/70', big ? 'text-5xl' : 'text-2xl')}>{i + 1}</div>
              </div>
            </motion.div>
          );
        })}
      </div>
      {!official && <p className="mt-2 text-center text-[11px] text-slate-500">Podio provisional según la clasificación actual</p>}
    </div>
  );
}
