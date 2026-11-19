/**
 * Modelo de dominio del torneo. Todas las entidades se guardan "planas"
 * (una fila por entidad) para que puedan persistirse tal cual en Supabase
 * o en almacenamiento local. Los nombres en camelCase se traducen a
 * snake_case en la capa de datos.
 */

export type CategoryCode = 'A' | 'B' | 'C';

export type TournamentStatus = 'registration' | 'in_progress' | 'finished';
export type CategoryStatus = 'registration' | 'round_robin' | 'playoffs' | 'finished';

export type MatchStatus =
  | 'pending' // pendiente de asignar
  | 'scheduled' // asignado a cancha, esperando inicio
  | 'in_progress' // en juego
  | 'finished' // finalizado con resultado oficial
  | 'suspended' // interrumpido; volverá a jugarse
  | 'cancelled'; // anulado; no cuenta para la clasificación

export type MatchPhase = 'round_robin' | 'semifinal' | 'final' | 'third_place';
export type MatchOutcome = 'normal' | 'walkover' | 'retired';

export type TiebreakCriterion =
  | 'game_diff'
  | 'games_won'
  | 'set_diff'
  | 'sets_won'
  | 'games_lost_asc'
  | 'head_to_head';

export interface MatchFormat {
  /** Sets máximos (1, 3 o 5). Gana quien llega a ceil(bestOf/2). */
  bestOf: 1 | 3 | 5;
  /** Juegos necesarios para ganar un set (6 normalmente, 9 en set largo). */
  gamesPerSet: number;
  /** Con cuántos juegos iguales se juega tie-break (6 → 6-6). null = sin tie-break (diferencia de 2). */
  tiebreakAt: number | null;
  /** Puntos del tie-break normal. */
  tiebreakPoints: number;
  /** Set decisivo: completo o super tie-break. */
  decidingSet: 'full' | 'super_tiebreak';
  superTiebreakPoints: number;
  /** Cómo cuenta el super tie-break en juegos. */
  superTiebreakCountsAs: 'one_game' | 'set_only';
  /** Punto de oro (informativo: se muestra en pantallas y actas). */
  goldenPoint: boolean;
}

export interface SchedulingSettings {
  /** Descanso mínimo de una pareja entre partidos (minutos). */
  minRestMinutes: number;
  /** Duración estimada de un partido (para calendario estimado). */
  estimatedMatchMinutes: number;
  /** Margen entre partidos en la misma cancha (minutos). */
  changeoverMinutes: number;
}

export interface DisplaySettings {
  tvIntervalSeconds: number;
  tvShowCourts: boolean;
  tvShowLeaders: boolean;
}

export interface TournamentSettings {
  format: MatchFormat;
  scheduling: SchedulingSettings;
  /** Criterios de desempate tras "partidos ganados". */
  tiebreakers: TiebreakCriterion[];
  display: DisplaySettings;
}

export interface Tournament {
  id: string;
  slug: string;
  name: string;
  venue: string;
  date: string; // YYYY-MM-DD
  isDemo: boolean;
  status: TournamentStatus;
  settings: TournamentSettings;
  /** Hash SHA-256 del PIN de administración (solo modo local). */
  localAdminHash: string | null;
  ownerId: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleConfig {
  /** 'legs' = vueltas completas; 'matches_per_pair' = número reducido. */
  mode: 'legs' | 'matches_per_pair';
  legs: number;
  matchesPerPair: number;
}

export interface PlayoffConfig {
  /** 4 = semifinales + final; 2 = final directa. */
  size: 2 | 4;
  thirdPlaceMatch: boolean;
}

export interface Category {
  id: string;
  tournamentId: string;
  code: CategoryCode;
  name: string;
  status: CategoryStatus;
  scheduleConfig: ScheduleConfig | null;
  playoffConfig: PlayoffConfig | null;
  /** Orden resultante de un sorteo (desempate final). */
  drawOrder: string[];
  /** IDs de pareja: [campeona, subcampeona, tercera]. */
  podium: string[];
  sortIndex: number;
}

export interface Player {
  id: string;
  tournamentId: string;
  fullName: string;
  normalizedName: string;
}

export interface Pair {
  id: string;
  tournamentId: string;
  categoryId: string;
  /** Número visible (#1, #2...) único por torneo. */
  number: number;
  createdAt: string;
}

export interface PairMember {
  id: string;
  tournamentId: string;
  pairId: string;
  playerId: string;
  slot: 1 | 2;
}

export interface Court {
  id: string;
  tournamentId: string;
  number: number;
  name: string;
  active: boolean;
}

export interface Match {
  id: string;
  tournamentId: string;
  categoryId: string;
  phase: MatchPhase;
  /** Vuelta (1..n) dentro del round robin. */
  leg: number;
  /** Jornada dentro de la vuelta (método del círculo). */
  round: number;
  /** Orden canónico dentro de la categoría. */
  orderIndex: number;
  pair1Id: string;
  pair2Id: string;
  courtId: string | null;
  status: MatchStatus;
  postponedCount: number;
  scheduledAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  winnerPairId: string | null;
  outcome: MatchOutcome | null;
  /** En abandono: pareja que se retira. En W.O.: pareja ausente. */
  forfeitPairId: string | null;
  notes: string;
}

export interface MatchSet {
  id: string;
  tournamentId: string;
  matchId: string;
  setNumber: number;
  games1: number;
  games2: number;
  /** Puntos de tie-break (o del super tie-break) si se jugó. */
  tiebreak1: number | null;
  tiebreak2: number | null;
  isSuperTiebreak: boolean;
}

/** Estado completo de un torneo: la unidad que se sincroniza. */
export interface TournamentSnapshot {
  tournament: Tournament;
  categories: Category[];
  players: Player[];
  pairs: Pair[];
  pairMembers: PairMember[];
  courts: Court[];
  matches: Match[];
  matchSets: MatchSet[];
}

export type TableName = Exclude<keyof TournamentSnapshot, 'tournament'>;

export const TABLES: TableName[] = [
  'categories',
  'players',
  'pairs',
  'pairMembers',
  'courts',
  'matches',
  'matchSets',
];

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainError';
  }
}

export const STATUS_LABEL: Record<MatchStatus, string> = {
  pending: 'Pendiente',
  scheduled: 'Programado',
  in_progress: 'En curso',
  finished: 'Finalizado',
  suspended: 'Suspendido',
  cancelled: 'Cancelado',
};

export const PHASE_LABEL: Record<MatchPhase, string> = {
  round_robin: 'Round Robin',
  semifinal: 'Semifinal',
  final: 'Final',
  third_place: '3er puesto',
};

export const CRITERION_LABEL: Record<TiebreakCriterion, string> = {
  game_diff: 'Diferencia de juegos',
  games_won: 'Juegos ganados',
  set_diff: 'Diferencia de sets',
  sets_won: 'Sets ganados',
  games_lost_asc: 'Menos juegos en contra',
  head_to_head: 'Enfrentamiento directo',
};
