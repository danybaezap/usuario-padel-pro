import { officialSets, scoreText } from './format';
import { groupSets } from './standings';
import type { Match, TournamentSnapshot } from './types';

export interface PairMatchView {
  match: Match;
  opponentId: string;
  won: boolean;
  setsFor: number;
  setsAgainst: number;
  gamesFor: number;
  gamesAgainst: number;
  /** Marcador desde la perspectiva de la pareja. */
  score: string;
}

function perspectiveScore(match: Match, sets: ReturnType<typeof groupSets> extends Map<string, infer V> ? V : never, asPair1: boolean) {
  const text = scoreText(sets);
  if (asPair1 || !text) return text;
  return [...sets]
    .sort((a, b) => a.setNumber - b.setNumber)
    .map((x) =>
      x.isSuperTiebreak
        ? `[${x.tiebreak2 ?? x.games2}-${x.tiebreak1 ?? x.games1}]`
        : `${x.games2}-${x.games1}${x.tiebreak1 != null && x.tiebreak2 != null && (x.tiebreak1 || x.tiebreak2) ? `(${Math.min(x.tiebreak1, x.tiebreak2)})` : ''}`,
    )
    .join(' ');
  void match;
}

export function matchScoreLabel(s: TournamentSnapshot, m: Match, perspectivePairId?: string): string {
  const sets = s.matchSets.filter((x) => x.matchId === m.id);
  const asPair1 = !perspectivePairId || perspectivePairId === m.pair1Id;
  const base = perspectiveScore(m, sets, asPair1);
  if (m.outcome === 'walkover') return 'W.O.';
  if (m.outcome === 'retired') return `${base} ret.`;
  return base;
}

/** Historial cronológico de partidos finalizados de una pareja (todas las fases). */
export function pairHistory(s: TournamentSnapshot, pairId: string): PairMatchView[] {
  const byMatch = groupSets(s.matchSets);
  const f = s.tournament.settings.format;
  return s.matches
    .filter((m) => m.status === 'finished' && (m.pair1Id === pairId || m.pair2Id === pairId))
    .sort((a, b) => (a.finishedAt ?? '').localeCompare(b.finishedAt ?? ''))
    .map((m) => {
      const asP1 = m.pair1Id === pairId;
      const off = officialSets(m, byMatch.get(m.id) ?? [], f);
      let setsFor = 0;
      let setsAgainst = 0;
      let gamesFor = 0;
      let gamesAgainst = 0;
      for (const x of off) {
        const mine = asP1 ? x.g1 : x.g2;
        const theirs = asP1 ? x.g2 : x.g1;
        gamesFor += mine;
        gamesAgainst += theirs;
        if ((x.winner === 1) === asP1) setsFor++;
        else setsAgainst++;
      }
      return {
        match: m,
        opponentId: asP1 ? m.pair2Id : m.pair1Id,
        won: m.winnerPairId === pairId,
        setsFor,
        setsAgainst,
        gamesFor,
        gamesAgainst,
        score: matchScoreLabel(s, m, pairId),
      };
    });
}

export function pairUpcoming(s: TournamentSnapshot, pairId: string): Match[] {
  const rank = { in_progress: 0, scheduled: 1, pending: 2, suspended: 3 } as Record<string, number>;
  return s.matches
    .filter((m) => (m.pair1Id === pairId || m.pair2Id === pairId) && m.status in rank)
    .sort((a, b) => rank[a.status] - rank[b.status] || a.leg - b.leg || a.round - b.round || a.orderIndex - b.orderIndex);
}

export interface Streaks {
  current: { type: 'W' | 'L'; length: number } | null;
  bestWin: number;
}

export function streaks(history: PairMatchView[]): Streaks {
  let bestWin = 0;
  let run = 0;
  for (const h of history) {
    run = h.won ? run + 1 : 0;
    bestWin = Math.max(bestWin, run);
  }
  if (!history.length) return { current: null, bestWin };
  const last = history[history.length - 1].won ? 'W' : 'L';
  let len = 0;
  for (let i = history.length - 1; i >= 0 && (history[i].won ? 'W' : 'L') === last; i--) len++;
  return { current: { type: last, length: len }, bestWin };
}

export function headToHeadSummary(history: PairMatchView[]) {
  const map = new Map<string, { won: number; lost: number; matches: PairMatchView[] }>();
  for (const h of history) {
    const e = map.get(h.opponentId) ?? { won: 0, lost: 0, matches: [] };
    if (h.won) e.won++;
    else e.lost++;
    e.matches.push(h);
    map.set(h.opponentId, e);
  }
  return map;
}

export interface CategoryHighlight {
  label: string;
  value: string;
  pairId: string | null;
}

/** Datos destacados de una categoría para la premiación. */
export function categoryHighlights(s: TournamentSnapshot, categoryId: string): CategoryHighlight[] {
  const pairs = s.pairs.filter((p) => p.categoryId === categoryId);
  if (!pairs.length) return [];
  const histories = pairs.map((p) => ({ pairId: p.id, h: pairHistory(s, p.id) }));
  const out: CategoryHighlight[] = [];
  const bestStreak = histories
    .map((x) => ({ pairId: x.pairId, v: streaks(x.h).bestWin }))
    .sort((a, b) => b.v - a.v)[0];
  if (bestStreak && bestStreak.v > 0) out.push({ label: 'Mejor racha', value: `${bestStreak.v} victorias seguidas`, pairId: bestStreak.pairId });
  const gd = histories
    .map((x) => ({ pairId: x.pairId, v: x.h.reduce((a, m) => a + m.gamesFor - m.gamesAgainst, 0) }))
    .sort((a, b) => b.v - a.v)[0];
  if (gd) out.push({ label: 'Mejor diferencia de juegos', value: `${gd.v > 0 ? '+' : ''}${gd.v}`, pairId: gd.pairId });
  const unbeaten = histories.filter((x) => x.h.length > 0 && x.h.every((m) => m.won));
  if (unbeaten.length) out.push({ label: 'Invicta', value: `${unbeaten[0].h.length} de ${unbeaten[0].h.length}`, pairId: unbeaten[0].pairId });
  const longest = s.matches
    .filter((m) => m.categoryId === categoryId && m.status === 'finished' && m.outcome === 'normal')
    .map((m) => ({ m, games: s.matchSets.filter((x) => x.matchId === m.id).reduce((a, x) => a + x.games1 + x.games2, 0) }))
    .sort((a, b) => b.games - a.games)[0];
  if (longest) out.push({ label: 'Partido más largo', value: `${longest.games} juegos · ${matchScoreLabel(s, longest.m)}`, pairId: null });
  const finished = s.matches.filter((m) => m.categoryId === categoryId && m.status === 'finished').length;
  out.push({ label: 'Partidos disputados', value: String(finished), pairId: null });
  return out;
}
