import { describe, expect, it } from 'vitest';
import {
  addPair,
  assignMatch,
  cancelPlayoffs,
  clearSchedule,
  createTournamentSnapshot,
  declareChampions,
  finishTournament,
  generateSchedule,
  importPairs,
  moveMatch,
  postponeMatch,
  recordResult,
  removePair,
  reopenCategory,
  resumeMatch,
  startMatch,
  startPlayoffs,
  suspendMatch,
  updatePair,
  updateSettings,
} from '../commands';
import { randomResult } from '../demo';
import { rankCandidates } from '../scheduler';
import { categoryProgress } from '../standings';
import type { TournamentSnapshot } from '../types';
import { seededRandom } from '../util';
import { buildTournament, cat, pairsOf } from './helpers';

function finishCategory(s: TournamentSnapshot, code: 'A' | 'B' | 'C', seed = 1) {
  const rand = seededRandom(seed);
  const c = cat(s, code);
  for (const m of s.matches.filter((x) => x.categoryId === c.id && x.phase === 'round_robin' && x.status === 'pending')) {
    s = recordResult(s, m.id, randomResult(s.tournament.settings.format, rand));
  }
  return s;
}

describe('Registro de parejas', () => {
  it('registra una pareja con dos jugadores e identificador único', () => {
    let s = createTournamentSnapshot({ name: 'Copa' });
    s = addPair(s, { categoryId: cat(s, 'A').id, player1: 'Ana López', player2: 'Eva Gómez' });
    s = addPair(s, { categoryId: cat(s, 'A').id, player1: 'Ana Pérez', player2: 'Eva Ruiz' });
    expect(s.pairs.map((p) => p.number)).toEqual([1, 2]);
    expect(s.pairMembers.length).toBe(4);
    expect(new Set(s.pairs.map((p) => p.id)).size).toBe(2);
  });

  it('impide un jugador en dos parejas (aunque cambien mayúsculas o acentos)', () => {
    let s = createTournamentSnapshot({ name: 'Copa' });
    s = addPair(s, { categoryId: cat(s, 'A').id, player1: 'José Martín', player2: 'Eva Gómez' });
    expect(() => addPair(s, { categoryId: cat(s, 'C').id, player1: 'jose  martin', player2: 'Otro' })).toThrow(/ya está inscrito/);
  });

  it('rechaza parejas incompletas o con el mismo jugador dos veces', () => {
    const s = createTournamentSnapshot({ name: 'Copa' });
    expect(() => addPair(s, { categoryId: cat(s, 'A').id, player1: 'Ana', player2: ' ' })).toThrow(/incompleta/);
    expect(() => addPair(s, { categoryId: cat(s, 'A').id, player1: 'Ana', player2: 'ana' })).toThrow(/mismo jugador/);
  });

  it('importa CSV/Excel informando errores fila a fila', () => {
    const s = createTournamentSnapshot({ name: 'Copa' });
    const r = importPairs(s, [
      { player1: 'A1', player2: 'A2', category: 'A' },
      { player1: 'B1', player2: 'B2', category: 'Categoría B' },
      { player1: 'A1', player2: 'X', category: 'C' },
      { player1: 'Z1', player2: 'Z2', category: 'D' },
    ]);
    expect(r.added).toBe(2);
    expect(r.errors.map((e) => e.row)).toEqual([3, 4]);
  });

  it('las parejas quedan fijas: no se pueden cambiar de categoría ni borrar con calendario', () => {
    const s = buildTournament({ A: 4, B: 4 });
    const p = pairsOf(s, 'A')[0];
    expect(() => updatePair(s, p.id, { categoryId: cat(s, 'B').id, player1: 'x', player2: 'y' })).toThrow();
    expect(() => removePair(s, p.id)).toThrow();
    expect(() => addPair(s, { categoryId: cat(s, 'A').id, player1: 'Nuevo 1', player2: 'Nuevo 2' })).toThrow();
    // Corregir una errata de nombre sí está permitido y no cambia la composición.
    const s2 = updatePair(s, p.id, { categoryId: p.categoryId, player1: 'A Jugador 1a corregido', player2: 'A Jugador 1b' });
    expect(s2.pairMembers.filter((m) => m.pairId === p.id).map((m) => m.playerId)).toEqual(
      s.pairMembers.filter((m) => m.pairId === p.id).map((m) => m.playerId),
    );
  });
});

describe('Separación de categorías', () => {
  it('cada partido enfrenta parejas de la misma categoría', () => {
    const s = buildTournament({ A: 5, B: 4, C: 6 });
    const catOf = new Map(s.pairs.map((p) => [p.id, p.categoryId]));
    for (const m of s.matches) {
      expect(catOf.get(m.pair1Id)).toBe(m.categoryId);
      expect(catOf.get(m.pair2Id)).toBe(m.categoryId);
    }
    expect(s.matches.length).toBe(10 + 6 + 15);
  });

  it('una categoría puede regenerar su calendario sin afectar a otras', () => {
    let s = buildTournament({ A: 4, B: 4 });
    const bMatches = s.matches.filter((m) => m.categoryId === cat(s, 'B').id).map((m) => m.id);
    s = clearSchedule(s, cat(s, 'A').id);
    s = generateSchedule(s, cat(s, 'A').id, { mode: 'legs', legs: 2, matchesPerPair: 0 });
    expect(s.matches.filter((m) => m.categoryId === cat(s, 'B').id).map((m) => m.id)).toEqual(bMatches);
    expect(s.matches.filter((m) => m.categoryId === cat(s, 'A').id).length).toBe(12);
  });
});

describe('Canchas y estados', () => {
  it('no permite la misma pareja en dos canchas ni dos partidos en una cancha', () => {
    let s = buildTournament({ A: 4 });
    const [c1, c2] = s.courts;
    const [p1] = pairsOf(s, 'A');
    const withP1 = s.matches.filter((m) => m.pair1Id === p1.id || m.pair2Id === p1.id);
    s = assignMatch(s, withP1[0].id, c1.id);
    expect(() => assignMatch(s, withP1[1].id, c2.id)).toThrow(/otra cancha/);
    const other = s.matches.find((m) => m.status === 'pending' && m.pair1Id !== p1.id && m.pair2Id !== p1.id)!;
    expect(() => assignMatch(s, other.id, c1.id)).toThrow(/ocupada/);
  });

  it('mover a una cancha ocupada intercambia las canchas', () => {
    let s = buildTournament({ A: 4 });
    const [c1, c2] = s.courts;
    const [m1, m2] = rankCandidates(s, new Date())
      .map((c) => c.match)
      .filter((m, _i, arr) => arr.indexOf(m) < 6);
    s = assignMatch(s, m1.id, c1.id);
    const m2b = s.matches.find((m) => m.status === 'pending' && ![m1.pair1Id, m1.pair2Id].includes(m.pair1Id) && ![m1.pair1Id, m1.pair2Id].includes(m.pair2Id))!;
    void m2;
    s = assignMatch(s, m2b.id, c2.id);
    s = moveMatch(s, m1.id, c2.id);
    expect(s.matches.find((m) => m.id === m1.id)!.courtId).toBe(c2.id);
    expect(s.matches.find((m) => m.id === m2b.id)!.courtId).toBe(c1.id);
  });

  it('suspender libera la cancha; reanudar lo devuelve a pendientes', () => {
    let s = buildTournament({ A: 4 });
    const m = s.matches[0];
    s = assignMatch(s, m.id, s.courts[0].id);
    s = startMatch(s, m.id);
    s = suspendMatch(s, m.id, 'lluvia');
    expect(s.matches[0]).toMatchObject({ status: 'suspended', courtId: null });
    expect(() => recordResult(s, m.id, { outcome: 'normal', sets: [{ games1: 6, games2: 0 }, { games1: 6, games2: 0 }] })).not.toThrow();
    s = resumeMatch(s, m.id);
    expect(s.matches[0].status).toBe('pending');
  });

  it('posponer reduce la prioridad del partido', () => {
    let s = buildTournament({ A: 4 });
    const first = rankCandidates(s, new Date())[0].match;
    s = postponeMatch(s, first.id);
    expect(rankCandidates(s, new Date())[0].match.id).not.toBe(first.id);
  });

  it('el resultado libera la cancha y se puede proponer el siguiente', () => {
    let s = buildTournament({ A: 4 });
    const m = s.matches[0];
    s = assignMatch(s, m.id, s.courts[0].id);
    s = startMatch(s, m.id);
    s = recordResult(s, m.id, { outcome: 'normal', sets: [{ games1: 6, games2: 2 }, { games1: 6, games2: 2 }] });
    expect(s.matches[0].status).toBe('finished');
    expect(s.matches.some((x) => x.courtId === s.courts[0].id && (x.status === 'scheduled' || x.status === 'in_progress'))).toBe(false);
  });
});

describe('Campeones y fase final', () => {
  it('no declara campeones antes de completar los partidos', () => {
    let s = buildTournament({ A: 4 });
    expect(() => declareChampions(s, cat(s, 'A').id)).toThrow(/faltan/);
    s = finishCategory(s, 'A');
    s = declareChampions(s, cat(s, 'A').id);
    expect(cat(s, 'A').podium.length).toBe(3);
    expect(cat(s, 'A').status).toBe('finished');
  });

  it('categorías que terminan antes que otras: el torneo solo cierra cuando todas acaban', () => {
    let s = buildTournament({ A: 3, B: 5 });
    s = finishCategory(s, 'A');
    s = declareChampions(s, cat(s, 'A').id);
    expect(categoryProgress(s, cat(s, 'B').id).complete).toBe(false);
    expect(() => finishTournament(s)).toThrow(/Categoría B/);
    // La categoría cerrada no admite cambios hasta reabrirse.
    const aMatch = s.matches.find((m) => m.categoryId === cat(s, 'A').id)!;
    expect(() => recordResult(s, aMatch.id, { outcome: 'walkover', sets: [], forfeitPairId: aMatch.pair1Id })).toThrow(/Reabre/);
    s = reopenCategory(s, cat(s, 'A').id);
    s = recordResult(s, aMatch.id, { outcome: 'walkover', sets: [], forfeitPairId: aMatch.pair1Id });
    s = declareChampions(s, cat(s, 'A').id);
    s = finishCategory(s, 'B', 7);
    s = declareChampions(s, cat(s, 'B').id);
    s = finishTournament(s);
    expect(s.tournament.status).toBe('finished');
  });

  it('fase eliminatoria opcional: semifinales 1-4 y 2-3, final y podio', () => {
    let s = buildTournament({ B: 5 });
    s = finishCategory(s, 'B', 3);
    const c = cat(s, 'B');
    expect(s.matches.some((m) => m.phase !== 'round_robin')).toBe(false); // nunca automática
    s = startPlayoffs(s, c.id, { size: 4, thirdPlaceMatch: true });
    const semis = s.matches.filter((m) => m.phase === 'semifinal');
    expect(semis.length).toBe(2);
    s = cancelPlayoffs(s, c.id);
    expect(s.matches.some((m) => m.phase !== 'round_robin')).toBe(false);
    s = startPlayoffs(s, c.id, { size: 4, thirdPlaceMatch: true });
    const rand = seededRandom(9);
    for (const m of s.matches.filter((x) => x.phase === 'semifinal')) s = recordResult(s, m.id, randomResult(s.tournament.settings.format, rand));
    const final = s.matches.find((m) => m.phase === 'final')!;
    const third = s.matches.find((m) => m.phase === 'third_place')!;
    expect(final).toBeTruthy();
    expect(third).toBeTruthy();
    s = recordResult(s, final.id, randomResult(s.tournament.settings.format, rand));
    expect(cat(s, 'B').status).toBe('playoffs');
    s = recordResult(s, third.id, randomResult(s.tournament.settings.format, rand));
    const done = cat(s, 'B');
    expect(done.status).toBe('finished');
    const f2 = s.matches.find((m) => m.id === final.id)!;
    expect(done.podium[0]).toBe(f2.winnerPairId);
    expect(new Set(done.podium).size).toBe(3);
  });

  it('no permite cambiar el formato de sets con resultados registrados', () => {
    let s = buildTournament({ A: 2 });
    s = recordResult(s, s.matches[0].id, { outcome: 'normal', sets: [{ games1: 6, games2: 2 }, { games1: 6, games2: 2 }] });
    const settings = { ...s.tournament.settings, format: { ...s.tournament.settings.format, gamesPerSet: 9, tiebreakAt: 8 } };
    expect(() => updateSettings(s, settings)).toThrow();
    const golden = { ...s.tournament.settings, format: { ...s.tournament.settings.format, goldenPoint: true } };
    expect(() => updateSettings(s, golden)).not.toThrow();
  });
});
