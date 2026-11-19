import type { CategoryCode, MatchFormat, TournamentSettings } from './types';

/** Formato acordado por la organización: al mejor de 3 sets completos a 6 juegos, tie-break en 6-6. */
export const DEFAULT_FORMAT: MatchFormat = {
  bestOf: 3,
  gamesPerSet: 6,
  tiebreakAt: 6,
  tiebreakPoints: 7,
  decidingSet: 'full',
  superTiebreakPoints: 10,
  superTiebreakCountsAs: 'one_game',
  goldenPoint: false,
};

export const DEFAULT_SETTINGS: TournamentSettings = {
  format: DEFAULT_FORMAT,
  scheduling: { minRestMinutes: 20, estimatedMatchMinutes: 75, changeoverMinutes: 5 },
  // Orden acordado: victorias → dif. juegos → juegos ganados → dif. sets → directo → sorteo.
  tiebreakers: ['game_diff', 'games_won', 'set_diff', 'head_to_head'],
  display: { tvIntervalSeconds: 15, tvShowCourts: true, tvShowLeaders: true },
};

export const CATEGORY_CODES: CategoryCode[] = ['A', 'B', 'C'];

export const CATEGORY_THEME: Record<
  CategoryCode,
  { label: string; hex: string; text: string; bg: string; soft: string; border: string; ring: string; gradient: string }
> = {
  A: {
    label: 'Categoría A',
    hex: '#f5b021',
    text: 'text-catA',
    bg: 'bg-catA',
    soft: 'bg-catA-soft',
    border: 'border-catA',
    ring: 'ring-catA-ring',
    gradient: 'from-catA/25 via-catA/5 to-transparent',
  },
  B: {
    label: 'Categoría B',
    hex: '#22d3ee',
    text: 'text-catB',
    bg: 'bg-catB',
    soft: 'bg-catB-soft',
    border: 'border-catB',
    ring: 'ring-catB-ring',
    gradient: 'from-catB/25 via-catB/5 to-transparent',
  },
  C: {
    label: 'Categoría C',
    hex: '#e879f9',
    text: 'text-catC',
    bg: 'bg-catC',
    soft: 'bg-catC-soft',
    border: 'border-catC',
    ring: 'ring-catC-ring',
    gradient: 'from-catC/25 via-catC/5 to-transparent',
  },
};

export function mergeSettings(partial: Partial<TournamentSettings> | null | undefined): TournamentSettings {
  const p = partial ?? {};
  return {
    format: { ...DEFAULT_SETTINGS.format, ...(p.format ?? {}) },
    scheduling: { ...DEFAULT_SETTINGS.scheduling, ...(p.scheduling ?? {}) },
    tiebreakers: p.tiebreakers?.length ? p.tiebreakers : DEFAULT_SETTINGS.tiebreakers,
    display: { ...DEFAULT_SETTINGS.display, ...(p.display ?? {}) },
  };
}
