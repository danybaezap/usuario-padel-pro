import { officialSets, type OfficialSet } from './format';
import type { Match, MatchSet, TiebreakCriterion, TournamentSnapshot } from './types';

export interface StandingRow {
  pairId: string;
  pairNumber: number;
  position: number;
  played: number;
  won: number;
  lost: number;
  winPct: number;
  setsWon: number;
  setsLost: number;
  setDiff: number;
  gamesWon: number;
  gamesLost: number;
  gameDiff: number;
  /** Partidos de round robin asignados a la pareja (sin cancelados). */
  totalAssigned: number;
  remaining: number;
  /** Últimos resultados, del más antiguo al más reciente. */
  form: Array<'W' | 'L'>;
  /** Empate sin resolver por ningún criterio (requiere sorteo). */
  unresolvedTie: boolean;
  /** Identificador del grupo de empate sin resolver (comparten posición). */
  tieGroup: string | null;
  /** Criterio que decidió su posición respecto a la pareja anterior. */
  decidedBy: TiebreakCriterion | 'wins' | 'draw' | null;
}

export interface MatchResultRecord {
  match: Match;
  sets: OfficialSet[];
  winnerPairId: string;
}

/** Partidos de round robin finalizados de una categoría con sus sets oficiales. */
export function finishedRecords(
  s: TournamentSnapshot,
  categoryId: string,
  opts: { phase?: 'round_robin' | 'all'; upToMatchIds?: Set<string> } = {},
): MatchResultRecord[] {
  const setsByMatch = groupSets(s.matchSets);
  return s.matches
    .filter(
      (m) =>
        m.categoryId === categoryId &&
        (opts.phase === 'all' || m.phase === 'round_robin') &&
        m.status === 'finished' &&
        m.winnerPairId &&
        (!opts.upToMatchIds || opts.upToMatchIds.has(m.id)),
    )
    .map((m) => ({ match: m, sets: officialSets(m, setsByMatch.get(m.id) ?? [], s.tournament.settings.format), winnerPairId: m.winnerPairId! }));
}

export function groupSets(sets: MatchSet[]): Map<string, MatchSet[]> {
  const map = new Map<string, MatchSet[]>();
  for (const set of sets) {
    const l = map.get(set.matchId) ?? [];
    l.push(set);
    map.set(set.matchId, l);
  }
  for (const l of map.values()) l.sort((a, b) => a.setNumber - b.setNumber);
  return map;
}

/**
 * Clasificación de una categoría calculada SIEMPRE desde el historial oficial
 * de partidos. Corregir un marcador simplemente cambia el historial y la
 * clasificación se recalcula: nunca se duplican victorias.
 */
export function computeStandings(
  s: TournamentSnapshot,
  categoryId: string,
  opts: { upToMatchIds?: Set<string> } = {},
): StandingRow[] {
  const pairs = s.pairs.filter((p) => p.categoryId === categoryId);
  const category = s.categories.find((c) => c.id === categoryId);
  const records = finishedRecords(s, categoryId, { upToMatchIds: opts.upToMatchIds });
  const rows = new Map<string, StandingRow>();
  for (const p of pairs) {
    rows.set(p.id, {
      pairId: p.id,
      pairNumber: p.number,
      position: 0,
      played: 0,
      won: 0,
      lost: 0,
      winPct: 0,
      setsWon: 0,
      setsLost: 0,
      setDiff: 0,
      gamesWon: 0,
      gamesLost: 0,
      gameDiff: 0,
      totalAssigned: 0,
      remaining: 0,
      form: [],
      unresolvedTie: false,
      tieGroup: null,
      decidedBy: null,
    });
  }
  for (const m of s.matches) {
    if (m.categoryId !== categoryId || m.phase !== 'round_robin' || m.status === 'cancelled') continue;
    for (const id of [m.pair1Id, m.pair2Id]) {
      const r = rows.get(id);
      if (r) r.totalAssigned++;
    }
  }
  const chronological = [...records].sort(
    (a, b) => (a.match.finishedAt ?? '').localeCompare(b.match.finishedAt ?? '') || a.match.orderIndex - b.match.orderIndex,
  );
  for (const rec of chronological) {
    const { match: m, sets } = rec;
    const r1 = rows.get(m.pair1Id);
    const r2 = rows.get(m.pair2Id);
    if (!r1 || !r2) continue;
    for (const set of sets) {
      r1.gamesWon += set.g1;
      r1.gamesLost += set.g2;
      r2.gamesWon += set.g2;
      r2.gamesLost += set.g1;
      if (set.winner === 1) {
        r1.setsWon++;
        r2.setsLost++;
      } else {
        r2.setsWon++;
        r1.setsLost++;
      }
    }
    r1.played++;
    r2.played++;
    const w = rec.winnerPairId === m.pair1Id ? r1 : r2;
    const l = w === r1 ? r2 : r1;
    w.won++;
    l.lost++;
    w.form.push('W');
    l.form.push('L');
  }
  for (const r of rows.values()) {
    r.setDiff = r.setsWon - r.setsLost;
    r.gameDiff = r.gamesWon - r.gamesLost;
    r.winPct = r.played ? Math.round((r.won / r.played) * 1000) / 10 : 0;
    r.remaining = Math.max(0, r.totalAssigned - r.played);
    r.form = r.form.slice(-5);
  }

  const criteria = s.tournament.settings.tiebreakers;
  const drawOrder = category?.drawOrder ?? [];
  const ordered = rankGroup([...rows.values()], ['wins', ...criteria], records, drawOrder);

  // Posiciones (empates sin resolver comparten posición).
  const allCrit: Crit[] = ['wins', ...criteria];
  ordered.forEach((row, i) => {
    const prev = ordered[i - 1];
    if (!prev) {
      row.position = 1;
      return;
    }
    row.decidedBy = decidingCriterion(ordered, i, allCrit, records, drawOrder);
    row.position = row.tieGroup && row.tieGroup === prev.tieGroup ? prev.position : i + 1;
  });
  return ordered;
}

type Crit = TiebreakCriterion | 'wins';

function value(row: StandingRow, c: Exclude<Crit, 'head_to_head'>): number {
  switch (c) {
    case 'wins':
      return row.won;
    case 'game_diff':
      return row.gameDiff;
    case 'games_won':
      return row.gamesWon;
    case 'set_diff':
      return row.setDiff;
    case 'sets_won':
      return row.setsWon;
    case 'games_lost_asc':
      return -row.gamesLost;
  }
}

/** Victorias en partidos disputados exclusivamente entre las parejas del grupo empatado. */
function headToHead(group: StandingRow[], records: MatchResultRecord[]): Map<string, number> {
  const ids = new Set(group.map((r) => r.pairId));
  const wins = new Map<string, number>(group.map((r) => [r.pairId, 0]));
  for (const rec of records) {
    if (ids.has(rec.match.pair1Id) && ids.has(rec.match.pair2Id)) {
      wins.set(rec.winnerPairId, (wins.get(rec.winnerPairId) ?? 0) + 1);
    }
  }
  return wins;
}

function rankGroup(group: StandingRow[], criteria: Crit[], records: MatchResultRecord[], drawOrder: string[]): StandingRow[] {
  if (group.length <= 1) return group;
  if (!criteria.length) {
    // Último recurso: sorteo registrado por la organización.
    if (group.every((r) => drawOrder.includes(r.pairId))) {
      return [...group].sort((a, b) => drawOrder.indexOf(a.pairId) - drawOrder.indexOf(b.pairId));
    }
    const nobodyPlayed = group.every((r) => r.played === 0);
    const tieKey = group.map((r) => r.pairId).sort().join('|');
    group.forEach((r) => {
      r.unresolvedTie = !nobodyPlayed;
      r.tieGroup = nobodyPlayed ? null : tieKey;
    });
    return [...group].sort((a, b) => a.pairNumber - b.pairNumber);
  }
  const [c, ...rest] = criteria;
  const scores: Map<string, number> =
    c === 'head_to_head' ? headToHead(group, records) : new Map(group.map((r) => [r.pairId, value(r, c)]));
  const buckets = new Map<number, StandingRow[]>();
  for (const r of group) {
    const v = scores.get(r.pairId)!;
    buckets.set(v, [...(buckets.get(v) ?? []), r]);
  }
  return [...buckets.keys()]
    .sort((a, b) => b - a)
    // Los subgrupos continúan con los criterios restantes (el directo se recalcula dentro del subgrupo).
    .flatMap((k) => rankGroup(buckets.get(k)!, rest, records, drawOrder));
}

/**
 * Primer criterio que distingue a una pareja de la anterior en la tabla.
 * El enfrentamiento directo se evalúa dentro del grupo que seguía empatado.
 */
function decidingCriterion(
  ordered: StandingRow[],
  i: number,
  criteria: Crit[],
  records: MatchResultRecord[],
  drawOrder: string[],
): StandingRow['decidedBy'] {
  const prev = ordered[i - 1];
  const row = ordered[i];
  let group = ordered;
  for (const c of criteria) {
    if (c === 'head_to_head') {
      const h = headToHead(group, records);
      if (h.get(prev.pairId) !== h.get(row.pairId)) return c;
    } else {
      if (value(prev, c) !== value(row, c)) return c;
      group = group.filter((r) => value(r, c) === value(prev, c));
    }
  }
  if (drawOrder.includes(prev.pairId) && drawOrder.includes(row.pairId)) return 'draw';
  return null;
}

export interface CategoryProgress {
  total: number;
  finished: number;
  cancelled: number;
  inProgress: number;
  scheduled: number;
  pending: number;
  suspended: number;
  percent: number;
  complete: boolean;
  /** Parejas con distinto número de partidos jugados en este momento. */
  unevenPlayed: boolean;
  /** Parejas con distinto número de partidos asignados (calendario desigual). */
  unevenAssigned: boolean;
}

export function categoryProgress(s: TournamentSnapshot, categoryId: string, phase: 'round_robin' | 'playoffs' = 'round_robin'): CategoryProgress {
  const ms = s.matches.filter(
    (m) => m.categoryId === categoryId && (phase === 'round_robin' ? m.phase === 'round_robin' : m.phase !== 'round_robin'),
  );
  const c = (st: Match['status']) => ms.filter((m) => m.status === st).length;
  const total = ms.length;
  const finished = c('finished');
  const cancelled = c('cancelled');
  const effective = total - cancelled;
  const standings = phase === 'round_robin' ? computeStandings(s, categoryId) : [];
  const played = new Set(standings.map((r) => r.played));
  const assigned = new Set(standings.map((r) => r.totalAssigned));
  return {
    total,
    finished,
    cancelled,
    inProgress: c('in_progress'),
    scheduled: c('scheduled'),
    pending: c('pending'),
    suspended: c('suspended'),
    percent: effective ? Math.round((finished / effective) * 100) : 0,
    complete: total > 0 && finished + cancelled === total,
    unevenPlayed: played.size > 1,
    unevenAssigned: assigned.size > 1,
  };
}

/** Evolución de la posición de cada pareja tras cada partido finalizado. */
export function rankingEvolution(s: TournamentSnapshot, categoryId: string) {
  const records = finishedRecords(s, categoryId).sort((a, b) =>
    (a.match.finishedAt ?? '').localeCompare(b.match.finishedAt ?? ''),
  );
  const included = new Set<string>();
  const points: Array<{ step: number; matchId: string; positions: Record<string, number> }> = [];
  records.forEach((rec, i) => {
    included.add(rec.match.id);
    const st = computeStandings(s, categoryId, { upToMatchIds: new Set(included) });
    points.push({ step: i + 1, matchId: rec.match.id, positions: Object.fromEntries(st.map((r) => [r.pairId, r.position])) });
  });
  return points;
}
