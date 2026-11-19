import { addPair, createTournamentSnapshot, generateSchedule } from '../commands';
import type { CategoryCode, ScheduleConfig, TournamentSettings, TournamentSnapshot } from '../types';

export function buildTournament(
  counts: Partial<Record<CategoryCode, number>>,
  opts: { config?: ScheduleConfig; settings?: Partial<TournamentSettings>; schedule?: boolean } = {},
): TournamentSnapshot {
  let s = createTournamentSnapshot({ name: 'Torneo de prueba', settings: opts.settings });
  for (const code of ['A', 'B', 'C'] as CategoryCode[]) {
    const cat = s.categories.find((c) => c.code === code)!;
    for (let i = 1; i <= (counts[code] ?? 0); i++) {
      s = addPair(s, { categoryId: cat.id, player1: `${code} Jugador ${i}a`, player2: `${code} Jugador ${i}b` });
    }
  }
  if (opts.schedule !== false) {
    for (const c of s.categories) {
      if (s.pairs.filter((p) => p.categoryId === c.id).length >= 2)
        s = generateSchedule(s, c.id, opts.config ?? { mode: 'legs', legs: 1, matchesPerPair: 0 });
    }
  }
  return s;
}

export function cat(s: TournamentSnapshot, code: CategoryCode) {
  return s.categories.find((c) => c.code === code)!;
}

export function pairsOf(s: TournamentSnapshot, code: CategoryCode) {
  const c = cat(s, code);
  return s.pairs.filter((p) => p.categoryId === c.id).sort((a, b) => a.number - b.number);
}

export function minutes(base: Date, m: number) {
  return new Date(base.getTime() + m * 60000);
}
