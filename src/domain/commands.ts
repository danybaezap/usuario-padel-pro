import { CATEGORY_CODES, CATEGORY_THEME, mergeSettings } from './defaults';
import { completeRetiredScore, isSuperTiebreakSet, validateMatchScore, type SetInput } from './format';
import { generateRoundRobin } from './roundRobin';
import { busyPairIds, matchOnCourt } from './scheduler';
import { categoryProgress, computeStandings } from './standings';
import {
  DomainError,
  type Category,
  type Court,
  type CategoryCode,
  type Match,
  type MatchOutcome,
  type MatchPhase,
  type PlayoffConfig,
  type ScheduleConfig,
  type TournamentSettings,
  type TournamentSnapshot,
} from './types';
import { cleanName, isActiveOnCourt, normalizeName, nowIso, randomSuffix, shuffle, slugify, uid } from './util';

/* ------------------------------------------------------------------ */
/* Utilidades internas                                                 */
/* ------------------------------------------------------------------ */

function clone(s: TournamentSnapshot): TournamentSnapshot {
  return structuredClone(s);
}

function touch(s: TournamentSnapshot): TournamentSnapshot {
  s.tournament.updatedAt = nowIso();
  return s;
}

function getMatch(s: TournamentSnapshot, matchId: string): Match {
  const m = s.matches.find((x) => x.id === matchId);
  if (!m) throw new DomainError('Partido no encontrado.');
  return m;
}

function getCategory(s: TournamentSnapshot, categoryId: string): Category {
  const c = s.categories.find((x) => x.id === categoryId);
  if (!c) throw new DomainError('Categoría no encontrada.');
  return c;
}

function assertNotFinishedTournament(s: TournamentSnapshot) {
  if (s.tournament.status === 'finished') throw new DomainError('El torneo está finalizado. Reábrelo para hacer cambios.');
}

function categoryHasStarted(s: TournamentSnapshot, categoryId: string): boolean {
  return s.matches.some((m) => m.categoryId === categoryId && m.status !== 'pending');
}

/* ------------------------------------------------------------------ */
/* Torneo                                                              */
/* ------------------------------------------------------------------ */

export interface NewTournamentInput {
  name: string;
  venue?: string;
  date?: string;
  isDemo?: boolean;
  courts?: number;
  settings?: Partial<TournamentSettings>;
  ownerId?: string | null;
  localAdminHash?: string | null;
}

export function createTournamentSnapshot(input: NewTournamentInput): TournamentSnapshot {
  const name = cleanName(input.name);
  if (name.length < 3) throw new DomainError('El nombre del torneo debe tener al menos 3 caracteres.');
  const id = uid();
  const now = nowIso();
  const courtsCount = input.courts ?? 3;
  if (courtsCount < 1 || courtsCount > 12) throw new DomainError('Número de canchas entre 1 y 12.');
  return {
    tournament: {
      id,
      slug: `${input.isDemo ? 'demo-' : ''}${slugify(name)}-${randomSuffix()}`,
      name,
      venue: cleanName(input.venue ?? ''),
      date: input.date ?? now.slice(0, 10),
      isDemo: !!input.isDemo,
      status: 'registration',
      settings: mergeSettings(input.settings),
      localAdminHash: input.localAdminHash ?? null,
      ownerId: input.ownerId ?? null,
      revision: 0,
      createdAt: now,
      updatedAt: now,
    },
    categories: CATEGORY_CODES.map((code, i) => ({
      id: uid(),
      tournamentId: id,
      code,
      name: CATEGORY_THEME[code].label,
      status: 'registration',
      scheduleConfig: null,
      playoffConfig: null,
      drawOrder: [],
      podium: [],
      sortIndex: i,
    })),
    players: [],
    pairs: [],
    pairMembers: [],
    courts: Array.from({ length: courtsCount }, (_, i) => ({
      id: uid(),
      tournamentId: id,
      number: i + 1,
      name: `Cancha ${i + 1}`,
      active: true,
    })),
    matches: [],
    matchSets: [],
  };
}

export function updateTournamentInfo(s0: TournamentSnapshot, info: { name?: string; venue?: string; date?: string }) {
  const s = clone(s0);
  if (info.name !== undefined) {
    const n = cleanName(info.name);
    if (n.length < 3) throw new DomainError('El nombre del torneo debe tener al menos 3 caracteres.');
    s.tournament.name = n;
  }
  if (info.venue !== undefined) s.tournament.venue = cleanName(info.venue);
  if (info.date !== undefined) s.tournament.date = info.date;
  return touch(s);
}

export function updateSettings(s0: TournamentSnapshot, settings: TournamentSettings) {
  const s = clone(s0);
  const prev = s.tournament.settings.format;
  const next = settings.format;
  const formatChanged = JSON.stringify(prev) !== JSON.stringify(next);
  const hasResults = s.matches.some((m) => m.status === 'finished' && m.outcome !== 'walkover');
  if (formatChanged && hasResults) {
    const onlyGoldenPoint = JSON.stringify({ ...prev, goldenPoint: next.goldenPoint }) === JSON.stringify(next);
    if (!onlyGoldenPoint)
      throw new DomainError('No se puede cambiar el formato de sets cuando ya hay resultados registrados (solo el punto de oro).');
  }
  if (![1, 3, 5].includes(next.bestOf)) throw new DomainError('Sets: 1, 3 o 5.');
  if (next.gamesPerSet < 1 || next.gamesPerSet > 12) throw new DomainError('Juegos por set entre 1 y 12.');
  if (next.tiebreakAt !== null && (next.tiebreakAt < next.gamesPerSet - 1 || next.tiebreakAt > next.gamesPerSet))
    throw new DomainError(`El tie-break debe jugarse en ${next.gamesPerSet - 1}-${next.gamesPerSet - 1} o ${next.gamesPerSet}-${next.gamesPerSet}.`);
  if (!settings.tiebreakers.length) throw new DomainError('Define al menos un criterio de desempate.');
  if (new Set(settings.tiebreakers).size !== settings.tiebreakers.length) throw new DomainError('Criterios de desempate repetidos.');
  const sch = settings.scheduling;
  if (sch.minRestMinutes < 0 || sch.estimatedMatchMinutes < 10) throw new DomainError('Valores de programación inválidos.');
  if (settings.display.tvIntervalSeconds < 5) throw new DomainError('El intervalo de TV debe ser de al menos 5 segundos.');
  s.tournament.settings = mergeSettings(settings);
  return touch(s);
}

export function setCourtCount(s0: TournamentSnapshot, count: number) {
  const s = clone(s0);
  if (count < 1 || count > 12) throw new DomainError('Número de canchas entre 1 y 12.');
  const sorted = [...s.courts].sort((a, b) => a.number - b.number);
  if (count < sorted.length) {
    const removed = sorted.slice(count);
    for (const c of removed) {
      if (s.matches.some((m) => m.courtId === c.id && isActiveOnCourt(m)))
        throw new DomainError(`${c.name} tiene un partido asignado. Libérala antes de eliminarla.`);
    }
    const used = new Set(s.matches.map((m) => m.courtId));
    // Las canchas con historial se desactivan; las que nunca se usaron se eliminan.
    s.courts = s.courts.flatMap((c): Court[] => {
      if (!removed.includes(c)) return [{ ...c, active: true }];
      return used.has(c.id) ? [{ ...c, active: false }] : [];
    });
  } else {
    sorted.forEach((c) => (c.active = true));
    for (let i = sorted.length + 1; i <= count; i++)
      s.courts.push({ id: uid(), tournamentId: s.tournament.id, number: i, name: `Cancha ${i}`, active: true });
  }
  return touch(s);
}

export function renameCourt(s0: TournamentSnapshot, courtId: string, name: string) {
  const s = clone(s0);
  const c = s.courts.find((x) => x.id === courtId);
  if (!c) throw new DomainError('Cancha no encontrada.');
  const n = cleanName(name);
  if (!n) throw new DomainError('El nombre de la cancha no puede estar vacío.');
  c.name = n;
  return touch(s);
}

/* ------------------------------------------------------------------ */
/* Parejas                                                             */
/* ------------------------------------------------------------------ */

export interface PairInput {
  categoryId: string;
  player1: string;
  player2: string;
}

function validatePlayers(s: TournamentSnapshot, p1: string, p2: string, excludePairId?: string) {
  const a = cleanName(p1);
  const b = cleanName(p2);
  if (a.length < 2 || b.length < 2) throw new DomainError('Introduce el nombre de ambos jugadores (pareja incompleta).');
  if (a.length > 60 || b.length > 60) throw new DomainError('Nombre demasiado largo (máx. 60 caracteres).');
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) throw new DomainError('Los dos integrantes de la pareja no pueden ser el mismo jugador.');
  const excludedPlayers = new Set(
    s.pairMembers.filter((m) => m.pairId === excludePairId).map((m) => m.playerId),
  );
  for (const n of [na, nb]) {
    const existing = s.players.find((p) => p.normalizedName === n && !excludedPlayers.has(p.id));
    if (existing) {
      const pairId = s.pairMembers.find((m) => m.playerId === existing.id)?.pairId;
      const pair = s.pairs.find((p) => p.id === pairId);
      const cat = s.categories.find((c) => c.id === pair?.categoryId);
      throw new DomainError(
        `${existing.fullName} ya está inscrito en otra pareja${pair ? ` (#${pair.number}, ${cat?.name ?? ''})` : ''}.`,
      );
    }
  }
  return { a, b, na, nb };
}

function assertCategoryOpen(s: TournamentSnapshot, categoryId: string) {
  const cat = getCategory(s, categoryId);
  if (cat.status !== 'registration' || s.matches.some((m) => m.categoryId === categoryId))
    throw new DomainError(`${cat.name} ya tiene calendario generado. Elimina el calendario para modificar inscripciones.`);
}

export function addPair(s0: TournamentSnapshot, input: PairInput) {
  const s = clone(s0);
  assertNotFinishedTournament(s);
  assertCategoryOpen(s, input.categoryId);
  const { a, b, na, nb } = validatePlayers(s, input.player1, input.player2);
  const pairId = uid();
  const tid = s.tournament.id;
  const p1 = { id: uid(), tournamentId: tid, fullName: a, normalizedName: na };
  const p2 = { id: uid(), tournamentId: tid, fullName: b, normalizedName: nb };
  s.players.push(p1, p2);
  s.pairs.push({
    id: pairId,
    tournamentId: tid,
    categoryId: input.categoryId,
    number: Math.max(0, ...s.pairs.map((p) => p.number)) + 1,
    createdAt: nowIso(),
  });
  s.pairMembers.push(
    { id: uid(), tournamentId: tid, pairId, playerId: p1.id, slot: 1 },
    { id: uid(), tournamentId: tid, pairId, playerId: p2.id, slot: 2 },
  );
  return touch(s);
}

/** Editar nombres siempre está permitido (corregir erratas); cambiar de categoría solo antes del calendario. */
export function updatePair(s0: TournamentSnapshot, pairId: string, input: PairInput) {
  const s = clone(s0);
  const pair = s.pairs.find((p) => p.id === pairId);
  if (!pair) throw new DomainError('Pareja no encontrada.');
  if (input.categoryId !== pair.categoryId) {
    assertCategoryOpen(s, pair.categoryId);
    assertCategoryOpen(s, input.categoryId);
    pair.categoryId = input.categoryId;
  }
  const { a, b, na, nb } = validatePlayers(s, input.player1, input.player2, pairId);
  const members = s.pairMembers.filter((m) => m.pairId === pairId).sort((x, y) => x.slot - y.slot);
  const [m1, m2] = members;
  const pl1 = s.players.find((p) => p.id === m1.playerId)!;
  const pl2 = s.players.find((p) => p.id === m2.playerId)!;
  pl1.fullName = a;
  pl1.normalizedName = na;
  pl2.fullName = b;
  pl2.normalizedName = nb;
  return touch(s);
}

export function removePair(s0: TournamentSnapshot, pairId: string) {
  const s = clone(s0);
  const pair = s.pairs.find((p) => p.id === pairId);
  if (!pair) throw new DomainError('Pareja no encontrada.');
  if (s.matches.some((m) => m.pair1Id === pairId || m.pair2Id === pairId))
    throw new DomainError('La pareja ya tiene partidos en el calendario. Elimina el calendario de la categoría antes de borrarla.');
  const playerIds = new Set(s.pairMembers.filter((m) => m.pairId === pairId).map((m) => m.playerId));
  s.pairMembers = s.pairMembers.filter((m) => m.pairId !== pairId);
  s.players = s.players.filter((p) => !playerIds.has(p.id));
  s.pairs = s.pairs.filter((p) => p.id !== pairId);
  return touch(s);
}

export interface ImportRow {
  player1: string;
  player2: string;
  category: string;
}

export function parseCategoryCode(raw: string): CategoryCode | null {
  const t = normalizeName(raw).replace('categoria', '').trim().toUpperCase();
  return (CATEGORY_CODES as string[]).includes(t) ? (t as CategoryCode) : null;
}

export function importPairs(s0: TournamentSnapshot, rows: ImportRow[]) {
  let s = s0;
  const errors: Array<{ row: number; message: string }> = [];
  let added = 0;
  rows.forEach((r, i) => {
    const code = parseCategoryCode(r.category ?? '');
    if (!code) {
      errors.push({ row: i + 1, message: `Categoría "${r.category}" no válida (usa A, B o C).` });
      return;
    }
    const cat = s.categories.find((c) => c.code === code)!;
    try {
      s = addPair(s, { categoryId: cat.id, player1: r.player1 ?? '', player2: r.player2 ?? '' });
      added++;
    } catch (e) {
      errors.push({ row: i + 1, message: (e as Error).message });
    }
  });
  return { snapshot: s, added, errors };
}

/* ------------------------------------------------------------------ */
/* Calendario                                                          */
/* ------------------------------------------------------------------ */

export function generateSchedule(s0: TournamentSnapshot, categoryId: string, config: ScheduleConfig) {
  const s = clone(s0);
  assertNotFinishedTournament(s);
  const cat = getCategory(s, categoryId);
  if (categoryHasStarted(s, categoryId))
    throw new DomainError(`${cat.name} ya tiene partidos en marcha o disputados; no se puede regenerar el calendario.`);
  const pairs = s.pairs.filter((p) => p.categoryId === categoryId).sort((a, b) => a.number - b.number);
  const pairings = generateRoundRobin(
    pairs.map((p) => p.id),
    config,
  );
  s.matches = s.matches.filter((m) => m.categoryId !== categoryId);
  pairings.forEach((p, i) =>
    s.matches.push({
      id: uid(),
      tournamentId: s.tournament.id,
      categoryId,
      phase: 'round_robin',
      leg: p.leg,
      round: p.round,
      orderIndex: i + 1,
      pair1Id: p.pair1Id,
      pair2Id: p.pair2Id,
      courtId: null,
      status: 'pending',
      postponedCount: 0,
      scheduledAt: null,
      startedAt: null,
      finishedAt: null,
      winnerPairId: null,
      outcome: null,
      forfeitPairId: null,
      notes: '',
    }),
  );
  cat.status = 'round_robin';
  cat.scheduleConfig = config;
  cat.podium = [];
  cat.drawOrder = [];
  if (s.tournament.status === 'registration') s.tournament.status = 'in_progress';
  return touch(s);
}

export function clearSchedule(s0: TournamentSnapshot, categoryId: string) {
  const s = clone(s0);
  const cat = getCategory(s, categoryId);
  if (categoryHasStarted(s, categoryId))
    throw new DomainError(`${cat.name} ya tiene partidos en marcha o disputados; no se puede eliminar el calendario.`);
  s.matches = s.matches.filter((m) => m.categoryId !== categoryId);
  cat.status = 'registration';
  cat.scheduleConfig = null;
  if (!s.matches.length) s.tournament.status = 'registration';
  return touch(s);
}

/* ------------------------------------------------------------------ */
/* Canchas y estados de partido                                        */
/* ------------------------------------------------------------------ */

function assertPairsAvailable(s: TournamentSnapshot, m: Match) {
  const busy = busyPairIds({ ...s, matches: s.matches.filter((x) => x.id !== m.id) });
  if (busy.has(m.pair1Id) || busy.has(m.pair2Id))
    throw new DomainError('Una de las parejas ya está programada o jugando en otra cancha.');
}

function assertCourtFree(s: TournamentSnapshot, courtId: string, exceptMatchId?: string) {
  const court = s.courts.find((c) => c.id === courtId);
  if (!court) throw new DomainError('Cancha no encontrada.');
  if (!court.active) throw new DomainError(`${court.name} está desactivada.`);
  const occupant = matchOnCourt(s, courtId);
  if (occupant && occupant.id !== exceptMatchId) throw new DomainError(`${court.name} está ocupada.`);
}

/** Asigna (llama a cancha) un partido pendiente. */
export function assignMatch(s0: TournamentSnapshot, matchId: string, courtId: string, now = new Date()) {
  const s = clone(s0);
  assertNotFinishedTournament(s);
  const m = getMatch(s, matchId);
  if (m.status !== 'pending') throw new DomainError('Solo se pueden asignar partidos pendientes.');
  assertCourtFree(s, courtId);
  assertPairsAvailable(s, m);
  m.courtId = courtId;
  m.status = 'scheduled';
  m.scheduledAt = now.toISOString();
  return touch(s);
}

export function startMatch(s0: TournamentSnapshot, matchId: string, now = new Date()) {
  const s = clone(s0);
  const m = getMatch(s, matchId);
  if (m.status !== 'scheduled') throw new DomainError('El partido debe estar programado en una cancha para iniciarse.');
  m.status = 'in_progress';
  m.startedAt = now.toISOString();
  return touch(s);
}

export function moveMatch(s0: TournamentSnapshot, matchId: string, courtId: string) {
  const s = clone(s0);
  const m = getMatch(s, matchId);
  if (!isActiveOnCourt(m)) throw new DomainError('Solo se pueden mover partidos programados o en curso.');
  if (m.courtId === courtId) return s0;
  const other = matchOnCourt(s, courtId);
  const target = s.courts.find((c) => c.id === courtId);
  if (!target?.active) throw new DomainError('Cancha no disponible.');
  if (other) {
    // Intercambio de canchas.
    other.courtId = m.courtId;
  }
  m.courtId = courtId;
  return touch(s);
}

/** Devuelve un partido programado a la lista de pendientes (sin penalización). */
export function unassignMatch(s0: TournamentSnapshot, matchId: string) {
  const s = clone(s0);
  const m = getMatch(s, matchId);
  if (m.status !== 'scheduled' && m.status !== 'in_progress' && m.status !== 'suspended')
    throw new DomainError('El partido no está asignado.');
  m.status = 'pending';
  m.courtId = null;
  m.scheduledAt = null;
  m.startedAt = null;
  return touch(s);
}

/** Pospone: vuelve a pendientes con menor prioridad. */
export function postponeMatch(s0: TournamentSnapshot, matchId: string) {
  const s = clone(s0);
  const m = getMatch(s, matchId);
  if (!['pending', 'scheduled'].includes(m.status)) throw new DomainError('Solo se pueden posponer partidos pendientes o programados.');
  m.status = 'pending';
  m.courtId = null;
  m.scheduledAt = null;
  m.postponedCount++;
  return touch(s);
}

export function suspendMatch(s0: TournamentSnapshot, matchId: string, note = '') {
  const s = clone(s0);
  const m = getMatch(s, matchId);
  if (!['scheduled', 'in_progress'].includes(m.status)) throw new DomainError('Solo se pueden suspender partidos programados o en curso.');
  m.status = 'suspended';
  m.courtId = null;
  m.notes = note || m.notes;
  return touch(s);
}

export function resumeMatch(s0: TournamentSnapshot, matchId: string) {
  const s = clone(s0);
  const m = getMatch(s, matchId);
  if (m.status !== 'suspended' && m.status !== 'cancelled') throw new DomainError('El partido no está suspendido ni cancelado.');
  if (m.status === 'cancelled') assertCategoryEditable(s, m);
  m.status = 'pending';
  m.courtId = null;
  m.startedAt = null;
  m.scheduledAt = null;
  return touch(s);
}

export function cancelMatch(s0: TournamentSnapshot, matchId: string, note = '') {
  const s = clone(s0);
  const m = getMatch(s, matchId);
  if (m.status === 'finished') throw new DomainError('Un partido finalizado no se puede cancelar. Corrige o anula su resultado primero.');
  if (m.phase !== 'round_robin') throw new DomainError('Los partidos de fase final no se pueden cancelar.');
  assertCategoryEditable(s, m);
  m.status = 'cancelled';
  m.courtId = null;
  m.notes = note || m.notes;
  return touch(s);
}

function assertCategoryEditable(s: TournamentSnapshot, m: Match) {
  const cat = getCategory(s, m.categoryId);
  if (m.phase === 'round_robin' && cat.status !== 'round_robin')
    throw new DomainError(
      `${cat.name} ya cerró su round robin (${cat.status === 'playoffs' ? 'fase final en curso' : 'campeones declarados'}). Reabre la categoría para modificar resultados.`,
    );
}

/* ------------------------------------------------------------------ */
/* Resultados                                                          */
/* ------------------------------------------------------------------ */

export interface ResultInput {
  outcome: MatchOutcome;
  sets: SetInput[];
  /** Para W.O. y abandono: pareja que no se presenta o se retira. */
  forfeitPairId?: string | null;
}

/**
 * Registra (o corrige) el resultado de un partido. La operación sustituye
 * completamente los sets anteriores: las estadísticas se derivan del
 * historial, así que corregir nunca duplica victorias.
 */
export function recordResult(s0: TournamentSnapshot, matchId: string, input: ResultInput, now = new Date()) {
  let s = clone(s0);
  assertNotFinishedTournament(s);
  const m = getMatch(s, matchId);
  if (m.status === 'cancelled') throw new DomainError('El partido está cancelado. Reactívalo antes de registrar el resultado.');
  assertCategoryEditable(s, m);
  if (m.status === 'pending' || m.status === 'suspended') assertPairsAvailable(s, m);
  const isCorrection = m.status === 'finished';
  if (isCorrection && m.phase !== 'round_robin') assertPlayoffCorrectable(s, m);
  const f = s.tournament.settings.format;

  let winner: 1 | 2;
  let sets: SetInput[] = [];
  if (input.outcome === 'normal') {
    sets = input.sets.map((x, i) => normalizeSet(x, i + 1, f));
    winner = validateMatchScore(sets, f);
  } else {
    if (input.forfeitPairId !== m.pair1Id && input.forfeitPairId !== m.pair2Id)
      throw new DomainError(input.outcome === 'walkover' ? 'Indica qué pareja no se presentó.' : 'Indica qué pareja abandonó.');
    winner = input.forfeitPairId === m.pair1Id ? 2 : 1;
    if (input.outcome === 'retired') {
      sets = input.sets
        .filter((x) => x.games1 > 0 || x.games2 > 0 || (x.tiebreak1 ?? 0) > 0 || (x.tiebreak2 ?? 0) > 0)
        .map((x, i) => normalizeSet(x, i + 1, f, true));
      completeRetiredScore(sets, winner, f); // valida coherencia
    }
  }

  s.matchSets = s.matchSets.filter((x) => x.matchId !== matchId);
  sets.forEach((x, i) =>
    s.matchSets.push({
      id: uid(),
      tournamentId: s.tournament.id,
      matchId,
      setNumber: i + 1,
      games1: x.games1,
      games2: x.games2,
      tiebreak1: x.tiebreak1 ?? null,
      tiebreak2: x.tiebreak2 ?? null,
      isSuperTiebreak: !!x.isSuperTiebreak,
    }),
  );
  m.status = 'finished';
  m.outcome = input.outcome;
  m.forfeitPairId = input.outcome === 'normal' ? null : input.forfeitPairId ?? null;
  m.winnerPairId = winner === 1 ? m.pair1Id : m.pair2Id;
  if (!isCorrection) {
    m.finishedAt = now.toISOString();
    m.startedAt = m.startedAt ?? now.toISOString();
  }
  if (m.phase !== 'round_robin') s = advancePlayoffs(s, m.categoryId);
  return touch(s);
}

function normalizeSet(x: SetInput, n: number, f: TournamentSnapshot['tournament']['settings']['format'], partial = false): SetInput {
  if (isSuperTiebreakSet(f, n)) {
    const p1 = x.tiebreak1 ?? x.games1;
    const p2 = x.tiebreak2 ?? x.games2;
    return { games1: p1 > p2 ? 1 : 0, games2: p2 > p1 ? 1 : 0, tiebreak1: p1, tiebreak2: p2, isSuperTiebreak: true };
  }
  const tbRelevant = f.tiebreakAt !== null && Math.max(x.games1, x.games2) === f.tiebreakAt + 1 && Math.min(x.games1, x.games2) === f.tiebreakAt;
  void partial;
  return {
    games1: Number(x.games1),
    games2: Number(x.games2),
    tiebreak1: tbRelevant && x.tiebreak1 != null && x.tiebreak2 != null ? Number(x.tiebreak1) : null,
    tiebreak2: tbRelevant && x.tiebreak1 != null && x.tiebreak2 != null ? Number(x.tiebreak2) : null,
    isSuperTiebreak: false,
  };
}

/** Anula el resultado de un partido (vuelve a pendiente). */
export function clearResult(s0: TournamentSnapshot, matchId: string) {
  let s = clone(s0);
  const m = getMatch(s, matchId);
  if (m.status !== 'finished') throw new DomainError('El partido no tiene resultado.');
  assertCategoryEditable(s, m);
  if (m.phase !== 'round_robin') assertPlayoffCorrectable(s, m);
  s.matchSets = s.matchSets.filter((x) => x.matchId !== matchId);
  Object.assign(m, { status: 'pending', winnerPairId: null, outcome: null, forfeitPairId: null, finishedAt: null, startedAt: null, scheduledAt: null, courtId: null });
  if (m.phase === 'semifinal') {
    // Eliminar final/3er puesto aún no jugados que dependían de esta semifinal.
    s.matches = s.matches.filter((x) => !(x.categoryId === m.categoryId && (x.phase === 'final' || x.phase === 'third_place')));
  }
  if (m.phase !== 'round_robin') {
    const cat = getCategory(s, m.categoryId);
    cat.status = 'playoffs';
    cat.podium = [];
    s = touch(s);
  }
  return touch(s);
}

/* ------------------------------------------------------------------ */
/* Fase final, campeones y premiación                                  */
/* ------------------------------------------------------------------ */

/** Posiciones del top-N sin empates pendientes de sorteo. */
function assertTopResolved(s: TournamentSnapshot, categoryId: string, n: number) {
  const st = computeStandings(s, categoryId);
  if (st.slice(0, n).some((r) => r.unresolvedTie))
    throw new DomainError('Hay un empate sin resolver en las primeras posiciones. Realiza el sorteo de desempate antes de continuar.');
  return st;
}

function assertRoundRobinComplete(s: TournamentSnapshot, categoryId: string) {
  const cat = getCategory(s, categoryId);
  if (cat.status !== 'round_robin') throw new DomainError(`${cat.name} no está en fase de round robin.`);
  const p = categoryProgress(s, categoryId);
  if (!p.complete)
    throw new DomainError(
      `${cat.name}: faltan ${p.total - p.finished - p.cancelled} partidos por disputar o cancelar. No se pueden declarar campeones todavía.`,
    );
}

/** Declara el podio directamente desde la clasificación del round robin. */
export function declareChampions(s0: TournamentSnapshot, categoryId: string) {
  const s = clone(s0);
  assertRoundRobinComplete(s, categoryId);
  const st = assertTopResolved(s, categoryId, 3);
  const cat = getCategory(s, categoryId);
  cat.podium = st.slice(0, 3).map((r) => r.pairId);
  cat.status = 'finished';
  return touch(s);
}

/** Realiza el sorteo de desempate para todos los grupos empatados (aleatorio y registrado). */
export function performDraw(s0: TournamentSnapshot, categoryId: string, rand: () => number = Math.random) {
  const s = clone(s0);
  const cat = getCategory(s, categoryId);
  const st = computeStandings(s, categoryId);
  const groups = new Map<string, string[]>();
  for (const r of st) if (r.tieGroup) groups.set(r.tieGroup, [...(groups.get(r.tieGroup) ?? []), r.pairId]);
  if (!groups.size) throw new DomainError('No hay empates que requieran sorteo.');
  const order = [...cat.drawOrder];
  for (const ids of groups.values()) {
    for (const id of ids) {
      const idx = order.indexOf(id);
      if (idx >= 0) order.splice(idx, 1);
    }
    order.push(...shuffle(ids, rand));
  }
  cat.drawOrder = order;
  return touch(s);
}

function newPlayoffMatch(s: TournamentSnapshot, categoryId: string, phase: MatchPhase, p1: string, p2: string, order: number): Match {
  return {
    id: uid(),
    tournamentId: s.tournament.id,
    categoryId,
    phase,
    leg: 99,
    round: phase === 'semifinal' ? 1 : 2,
    orderIndex: 1000 + order,
    pair1Id: p1,
    pair2Id: p2,
    courtId: null,
    status: 'pending',
    postponedCount: 0,
    scheduledAt: null,
    startedAt: null,
    finishedAt: null,
    winnerPairId: null,
    outcome: null,
    forfeitPairId: null,
    notes: '',
  };
}

/** Activa la fase eliminatoria. Solo se ejecuta por decisión expresa del organizador. */
export function startPlayoffs(s0: TournamentSnapshot, categoryId: string, config: PlayoffConfig) {
  const s = clone(s0);
  assertRoundRobinComplete(s, categoryId);
  const cat = getCategory(s, categoryId);
  const pairsCount = s.pairs.filter((p) => p.categoryId === categoryId).length;
  if (config.size === 4 && pairsCount < 4) throw new DomainError('Se necesitan al menos 4 parejas para jugar semifinales.');
  if (pairsCount < 2) throw new DomainError('Se necesitan al menos 2 parejas.');
  const st = assertTopResolved(s, categoryId, config.size);
  const [p1, p2, p3, p4] = st.map((r) => r.pairId);
  if (config.size === 4) {
    s.matches.push(newPlayoffMatch(s, categoryId, 'semifinal', p1, p4, 1));
    s.matches.push(newPlayoffMatch(s, categoryId, 'semifinal', p2, p3, 2));
  } else {
    s.matches.push(newPlayoffMatch(s, categoryId, 'final', p1, p2, 3));
  }
  cat.playoffConfig = config;
  cat.status = 'playoffs';
  return touch(s);
}

export function cancelPlayoffs(s0: TournamentSnapshot, categoryId: string) {
  const s = clone(s0);
  const cat = getCategory(s, categoryId);
  if (cat.status !== 'playoffs' && !(cat.status === 'finished' && cat.playoffConfig))
    throw new DomainError('La categoría no tiene fase eliminatoria activa.');
  const po = s.matches.filter((m) => m.categoryId === categoryId && m.phase !== 'round_robin');
  if (po.some((m) => m.status !== 'pending'))
    throw new DomainError('La fase eliminatoria ya comenzó; no se puede desactivar.');
  s.matches = s.matches.filter((m) => !po.includes(m));
  cat.status = 'round_robin';
  cat.playoffConfig = null;
  cat.podium = [];
  return touch(s);
}

function assertPlayoffCorrectable(s: TournamentSnapshot, m: Match) {
  if (m.phase === 'semifinal') {
    const later = s.matches.filter((x) => x.categoryId === m.categoryId && (x.phase === 'final' || x.phase === 'third_place'));
    if (later.some((x) => x.status !== 'pending'))
      throw new DomainError('La final ya se está jugando o terminó; no se puede corregir la semifinal.');
  }
  if (s.tournament.status === 'finished') throw new DomainError('El torneo está finalizado.');
}

/** Crea final / 3er puesto cuando terminan las semifinales y fija el podio al terminar. */
function advancePlayoffs(s: TournamentSnapshot, categoryId: string): TournamentSnapshot {
  const cat = getCategory(s, categoryId);
  const cfg = cat.playoffConfig;
  if (!cfg) return s;
  const ms = s.matches.filter((m) => m.categoryId === categoryId);
  const semis = ms.filter((m) => m.phase === 'semifinal').sort((a, b) => a.orderIndex - b.orderIndex);
  let final = ms.find((m) => m.phase === 'final');
  let third = ms.find((m) => m.phase === 'third_place');
  if (semis.length === 2 && semis.every((m) => m.status === 'finished')) {
    const winners = semis.map((m) => m.winnerPairId!);
    const losers = semis.map((m) => (m.winnerPairId === m.pair1Id ? m.pair2Id : m.pair1Id));
    if (!final) {
      final = newPlayoffMatch(s, categoryId, 'final', winners[0], winners[1], 3);
      s.matches.push(final);
    } else if (final.status === 'pending') {
      final.pair1Id = winners[0];
      final.pair2Id = winners[1];
    }
    if (cfg.thirdPlaceMatch) {
      if (!third) {
        third = newPlayoffMatch(s, categoryId, 'third_place', losers[0], losers[1], 4);
        s.matches.push(third);
      } else if (third.status === 'pending') {
        third.pair1Id = losers[0];
        third.pair2Id = losers[1];
      }
    }
  }
  const finalDone = final?.status === 'finished';
  const thirdDone = !cfg.thirdPlaceMatch || cfg.size === 2 || third?.status === 'finished';
  if (final && finalDone && thirdDone) {
    const champion = final.winnerPairId!;
    const runnerUp = final.winnerPairId === final.pair1Id ? final.pair2Id : final.pair1Id;
    let thirdPlace: string | undefined;
    if (cfg.size === 4) {
      if (cfg.thirdPlaceMatch && third) thirdPlace = third.winnerPairId!;
      else {
        // Sin partido por el 3er puesto: el semifinalista perdedor mejor clasificado en el round robin.
        const st = computeStandings(s, categoryId);
        const losers = semis.map((m) => (m.winnerPairId === m.pair1Id ? m.pair2Id : m.pair1Id));
        thirdPlace = st.find((r) => losers.includes(r.pairId))?.pairId;
      }
    } else {
      const st = computeStandings(s, categoryId);
      thirdPlace = st.find((r) => r.pairId !== champion && r.pairId !== runnerUp)?.pairId;
    }
    cat.podium = [champion, runnerUp, ...(thirdPlace ? [thirdPlace] : [])];
    cat.status = 'finished';
  }
  return s;
}

/** Reabre una categoría con campeones declarados (sin fase final) para corregir resultados. */
export function reopenCategory(s0: TournamentSnapshot, categoryId: string) {
  const s = clone(s0);
  assertNotFinishedTournament(s);
  const cat = getCategory(s, categoryId);
  if (cat.status !== 'finished') throw new DomainError('La categoría no está finalizada.');
  if (cat.playoffConfig) {
    cat.status = 'playoffs';
  } else {
    cat.status = 'round_robin';
  }
  cat.podium = [];
  return touch(s);
}

export function finishTournament(s0: TournamentSnapshot) {
  const s = clone(s0);
  const pending = s.categories.filter((c) => s.pairs.some((p) => p.categoryId === c.id) && c.status !== 'finished');
  if (pending.length)
    throw new DomainError(`Faltan categorías por cerrar: ${pending.map((c) => c.name).join(', ')}.`);
  if (!s.pairs.length) throw new DomainError('No hay parejas inscritas.');
  s.tournament.status = 'finished';
  return touch(s);
}

export function reopenTournament(s0: TournamentSnapshot) {
  const s = clone(s0);
  if (s.tournament.status !== 'finished') throw new DomainError('El torneo no está finalizado.');
  s.tournament.status = 'in_progress';
  return touch(s);
}
