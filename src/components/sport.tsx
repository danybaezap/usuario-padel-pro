import { motion } from 'framer-motion';
import { Clock, Swords } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CATEGORY_THEME } from '@/domain/defaults';
import { matchScoreLabel } from '@/domain/stats';
import type { Category, Court, Match, TournamentSnapshot } from '@/domain/types';
import { PHASE_LABEL } from '@/domain/types';
import type { SnapshotIndex } from '@/domain/util';
import { elapsed, hhmm } from '@/lib/format';
import { CategoryBadge, LiveDot, StatusBadge, cx } from './ui';

export function PairLabel({
  index,
  pairId,
  slug,
  size = 'md',
  winner,
  align = 'left',
  showNumber = true,
}: {
  index: SnapshotIndex;
  pairId: string;
  slug?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  winner?: boolean;
  align?: 'left' | 'right';
  showNumber?: boolean;
}) {
  const [a, b] = index.pairPlayers(pairId);
  const num = index.pairById.get(pairId)?.number;
  const text =
    size === 'xl' ? 'text-3xl xl:text-4xl' : size === 'lg' ? 'text-xl' : size === 'sm' ? 'text-[13px]' : 'text-[15px]';
  const content = (
    <div className={cx('min-w-0 leading-tight', align === 'right' && 'text-right')}>
      <div className={cx('truncate font-semibold', text, winner === false ? 'text-slate-400' : 'text-white')}>{a}</div>
      <div className={cx('truncate font-semibold', text, winner === false ? 'text-slate-500' : 'text-slate-200')}>
        {b}
        {showNumber && num !== undefined && size !== 'xl' && <span className="ml-1.5 font-mono text-[10px] font-normal text-slate-500">#{num}</span>}
      </div>
    </div>
  );
  if (!slug) return content;
  return (
    <Link to={`/t/${slug}/pareja/${pairId}`} className="min-w-0 hover:opacity-80">
      {content}
    </Link>
  );
}

export function useCategoryMap(s: TournamentSnapshot) {
  return new Map(s.categories.map((c) => [c.id, c]));
}

/** Marcador por sets en columnas (perspectiva pareja 1 / pareja 2). */
export function SetColumns({ s, match, big }: { s: TournamentSnapshot; match: Match; big?: boolean }) {
  const sets = s.matchSets.filter((x) => x.matchId === match.id).sort((a, b) => a.setNumber - b.setNumber);
  if (!sets.length) return null;
  const cls = big ? 'w-10 text-3xl' : 'w-6 text-base';
  const row = (side: 1 | 2) => (
    <div className="flex justify-end">
      {sets.map((x) => {
        const mine = side === 1 ? x.games1 : x.games2;
        const theirs = side === 1 ? x.games2 : x.games1;
        const val = x.isSuperTiebreak ? (side === 1 ? x.tiebreak1 : x.tiebreak2) : mine;
        return (
          <span key={x.id} className={cx('num text-center font-bold', cls, mine > theirs ? 'text-white' : 'text-slate-500')}>
            {val}
          </span>
        );
      })}
    </div>
  );
  return (
    <div className="flex flex-col justify-center gap-1">
      {row(1)}
      {row(2)}
    </div>
  );
}

export function CourtCard({
  s,
  index,
  court,
  match,
  now,
  slug,
  big,
  next,
}: {
  s: TournamentSnapshot;
  index: SnapshotIndex;
  court: Court;
  match?: Match;
  now: Date;
  slug?: string;
  big?: boolean;
  next?: Match;
}) {
  const cat = match ? s.categories.find((c) => c.id === match.categoryId) : undefined;
  const theme = cat ? CATEGORY_THEME[cat.code] : null;
  return (
    <motion.div
      layout
      className={cx('card relative overflow-hidden', big ? 'p-6 xl:p-8' : 'p-4 sm:p-5')}
      style={theme ? { boxShadow: `inset 0 0 0 1px ${theme.hex}33, 0 30px 60px -40px ${theme.hex}55` } : undefined}
    >
      <div className="court-lines pointer-events-none absolute inset-0 opacity-60" />
      {theme && <div className={cx('pointer-events-none absolute inset-0 bg-gradient-to-br', theme.gradient)} />}
      <div className="relative">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={cx('display text-slate-300', big ? 'text-2xl' : 'text-sm')}>{court.name}</span>
            {cat && <CategoryBadge code={cat.code} size={big ? 'md' : 'sm'} />}
            {match && match.phase !== 'round_robin' && <span className="chip bg-amber-400/15 text-amber-300">{PHASE_LABEL[match.phase]}</span>}
          </div>
          {match?.status === 'in_progress' ? (
            <span className={cx('flex items-center gap-2 font-semibold text-accent', big ? 'text-lg' : 'text-xs')}>
              <LiveDot /> EN JUEGO · {elapsed(match.startedAt, now)}
            </span>
          ) : match?.status === 'scheduled' ? (
            <span className={cx('flex items-center gap-1.5 font-semibold text-sky-300', big ? 'text-lg' : 'text-xs')}>
              <Clock className="h-3.5 w-3.5" /> LLAMADOS A CANCHA
            </span>
          ) : (
            <span className={cx('font-semibold text-slate-500', big ? 'text-lg' : 'text-xs')}>LIBRE</span>
          )}
        </div>
        {match ? (
          <div className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-2.5">
              <PairLabel index={index} pairId={match.pair1Id} slug={slug} size={big ? 'xl' : 'md'} />
              <div className="flex items-center gap-2 text-slate-600">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-[10px] font-bold tracking-widest">VS</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>
              <PairLabel index={index} pairId={match.pair2Id} slug={slug} size={big ? 'xl' : 'md'} />
            </div>
          </div>
        ) : (
          <div className={cx('flex flex-col items-center justify-center text-center text-slate-500', big ? 'h-48' : 'h-[118px]')}>
            <Swords className={cx('mb-2 opacity-40', big ? 'h-10 w-10' : 'h-6 w-6')} />
            {next ? (
              <div className={cx(big ? 'text-xl' : 'text-xs')}>
                <div className="mb-1 uppercase tracking-wider text-slate-500">A continuación</div>
                <div className="font-semibold text-slate-300">{index.pairName(next.pair1Id)}</div>
                <div className="font-semibold text-slate-300">{index.pairName(next.pair2Id)}</div>
              </div>
            ) : (
              <span className={cx(big ? 'text-xl' : 'text-sm')}>Esperando asignación</span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function MatchLine({
  s,
  index,
  match,
  slug,
  categories,
  showCategory = true,
  extra,
  time,
  onClick,
}: {
  s: TournamentSnapshot;
  index: SnapshotIndex;
  match: Match;
  slug?: string;
  categories: Map<string, Category>;
  showCategory?: boolean;
  extra?: React.ReactNode;
  time?: Date | string | null;
  onClick?: () => void;
}) {
  const cat = categories.get(match.categoryId)!;
  const court = s.courts.find((c) => c.id === match.courtId);
  const w1 = match.status === 'finished' ? match.winnerPairId === match.pair1Id : undefined;
  const w2 = match.status === 'finished' ? match.winnerPairId === match.pair2Id : undefined;
  return (
    <div
      className={cx(
        'flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5',
        onClick && 'cursor-pointer transition hover:border-white/15 hover:bg-white/[0.05]',
      )}
      onClick={onClick}
      style={{ borderLeft: `3px solid ${CATEGORY_THEME[cat.code].hex}` }}
    >
      {showCategory && <CategoryBadge code={cat.code} />}
      <div className="grid min-w-0 flex-1 grid-cols-1 gap-1 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-3">
        <PairLabel index={index} pairId={match.pair1Id} slug={slug} size="sm" winner={w1} />
        <span className="hidden text-[10px] font-bold text-slate-600 sm:block">VS</span>
        <PairLabel index={index} pairId={match.pair2Id} slug={slug} size="sm" winner={w2} />
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-right">
        {match.status === 'finished' ? (
          <span className="num text-sm font-bold text-white">{matchScoreLabel(s, match)}</span>
        ) : (
          <StatusBadge status={match.status} postponed={match.postponedCount} />
        )}
        <span className="text-[11px] text-slate-500">
          {match.phase !== 'round_robin' ? PHASE_LABEL[match.phase] : `V${match.leg} · J${match.round}`}
          {court ? ` · ${court.name}` : ''}
          {time ? ` · ${hhmm(time)}` : ''}
        </span>
        {extra}
      </div>
    </div>
  );
}
