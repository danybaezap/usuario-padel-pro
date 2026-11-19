import {
  addPair,
  assignMatch,
  createTournamentSnapshot,
  generateSchedule,
  recordResult,
  startMatch,
  type ResultInput,
} from './commands';
import { setsToWin } from './format';
import { proposeForFreeCourts } from './scheduler';
import type { MatchFormat, TournamentSnapshot } from './types';
import { seededRandom } from './util';

/** 24 jugadores ficticios en 12 parejas: 5 en A, 4 en B y 3 en C (incluye categorías impares). */
export const DEMO_PAIRS: Array<{ category: 'A' | 'B' | 'C'; p1: string; p2: string }> = [
  { category: 'A', p1: 'Martín Vidal', p2: 'Lucas Ferrer' },
  { category: 'A', p1: 'Sofía Herrera', p2: 'Valeria Ruiz' },
  { category: 'A', p1: 'Diego Navarro', p2: 'Andrés Molina' },
  { category: 'A', p1: 'Camila Ortega', p2: 'Paula Castro' },
  { category: 'A', p1: 'Javier Romero', p2: 'Tomás Delgado' },
  { category: 'B', p1: 'Elena Santos', p2: 'Lucía Prieto' },
  { category: 'B', p1: 'Pablo Gil', p2: 'Hugo Marín' },
  { category: 'B', p1: 'Irene Campos', p2: 'Nora Vega' },
  { category: 'B', p1: 'Raúl Ibáñez', p2: 'Sergio León' },
  { category: 'C', p1: 'Marta Cano', p2: 'Clara Rivas' },
  { category: 'C', p1: 'Álvaro Peña', p2: 'Iván Soler' },
  { category: 'C', p1: 'Julia Mora', p2: 'Ana Fuentes' },
];

export function createDemoTournament(opts: { ownerId?: string | null; localAdminHash?: string | null } = {}): TournamentSnapshot {
  let s = createTournamentSnapshot({
    name: 'Open Demo Pádel Pro',
    venue: 'Club de demostración',
    isDemo: true,
    ownerId: opts.ownerId ?? null,
    localAdminHash: opts.localAdminHash ?? null,
    settings: { scheduling: { minRestMinutes: 0, estimatedMatchMinutes: 60, changeoverMinutes: 5 } },
  });
  for (const p of DEMO_PAIRS) {
    const cat = s.categories.find((c) => c.code === p.category)!;
    s = addPair(s, { categoryId: cat.id, player1: p.p1, player2: p.p2 });
  }
  for (const c of s.categories) s = generateSchedule(s, c.id, { mode: 'legs', legs: 1, matchesPerPair: 0 });
  return s;
}

/** Genera un marcador aleatorio válido para el formato. */
export function randomResult(f: MatchFormat, rand: () => number): ResultInput {
  const need = setsToWin(f);
  const sets: ResultInput['sets'] = [];
  let w1 = 0;
  let w2 = 0;
  const bias = rand() < 0.5 ? 0.62 : 0.38;
  while (w1 < need && w2 < need) {
    const n = sets.length + 1;
    const winner: 1 | 2 = rand() < bias ? 1 : 2;
    if (f.decidingSet === 'super_tiebreak' && f.bestOf > 1 && n === f.bestOf) {
      const l = Math.floor(rand() * (f.superTiebreakPoints - 1));
      sets.push(winner === 1 ? { games1: 1, games2: 0, tiebreak1: f.superTiebreakPoints, tiebreak2: l } : { games1: 0, games2: 1, tiebreak1: l, tiebreak2: f.superTiebreakPoints });
    } else {
      const G = f.gamesPerSet;
      const r = rand();
      let wg = G;
      let lg = Math.floor(rand() * (G - 1));
      let tb: [number, number] | null = null;
      if (r > 0.85 && f.tiebreakAt !== null) {
        wg = f.tiebreakAt + 1;
        lg = f.tiebreakAt;
        tb = [f.tiebreakPoints, Math.floor(rand() * (f.tiebreakPoints - 1))];
      } else if (r > 0.7) {
        wg = G + 1;
        lg = G - 1;
      }
      sets.push(
        winner === 1
          ? { games1: wg, games2: lg, tiebreak1: tb?.[0] ?? null, tiebreak2: tb?.[1] ?? null }
          : { games1: lg, games2: wg, tiebreak1: tb?.[1] ?? null, tiebreak2: tb?.[0] ?? null },
      );
    }
    if (winner === 1) w1++;
    else w2++;
  }
  return { outcome: 'normal', sets };
}

/**
 * Simula una "oleada": termina los partidos en curso con marcadores aleatorios
 * y asigna/inicia los siguientes en las canchas libres usando el motor real.
 * `clock` es el instante en que terminan los partidos en curso.
 */
export function simulateWave(s0: TournamentSnapshot, clock: Date, seed = Date.now()): { snapshot: TournamentSnapshot; clock: Date; finished: number } {
  const rand = seededRandom(seed);
  let s = s0;
  let finished = 0;
  const f = s.tournament.settings.format;
  const now = new Date(clock);
  const live = s.matches.filter((m) => m.status === 'in_progress' || m.status === 'scheduled');
  if (live.length) {
    for (const m of live) {
      if (m.status === 'scheduled') s = startMatch(s, m.id, now);
      s = recordResult(s, m.id, randomResult(f, rand), now);
      finished++;
    }
  }
  for (const p of proposeForFreeCourts(s, now)) {
    s = assignMatch(s, p.match.id, p.courtId, now);
    s = startMatch(s, p.match.id, now);
  }
  return { snapshot: s, clock: now, finished };
}
