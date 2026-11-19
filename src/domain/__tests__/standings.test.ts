import { describe, expect, it } from 'vitest';
import { cancelMatch, performDraw, recordResult } from '../commands';
import { categoryProgress, computeStandings } from '../standings';
import type { TournamentSnapshot } from '../types';
import { seededRandom } from '../util';
import { buildTournament, cat, pairsOf } from './helpers';

function findMatch(s: TournamentSnapshot, a: string, b: string) {
  return s.matches.find((m) => (m.pair1Id === a && m.pair2Id === b) || (m.pair1Id === b && m.pair2Id === a))!;
}

/** Registra que `winner` gana a `loser` con los juegos indicados (perspectiva del ganador). */
function win(s: TournamentSnapshot, winner: string, loser: string, sets: Array<[number, number]>, at = new Date()) {
  const m = findMatch(s, winner, loser);
  const asP1 = m.pair1Id === winner;
  return recordResult(
    s,
    m.id,
    { outcome: 'normal', sets: sets.map(([w, l]) => (asP1 ? { games1: w, games2: l } : { games1: l, games2: w })) },
    at,
  );
}

describe('Clasificación', () => {
  it('ordena por victorias y calcula todas las columnas', () => {
    let s = buildTournament({ A: 3 });
    const [p1, p2, p3] = pairsOf(s, 'A').map((p) => p.id);
    s = win(s, p1, p2, [[6, 2], [6, 3]]);
    s = win(s, p1, p3, [[6, 4], [3, 6], [6, 1]]);
    s = win(s, p2, p3, [[7, 6], [6, 4]]);
    const st = computeStandings(s, cat(s, 'A').id);
    expect(st.map((r) => r.pairId)).toEqual([p1, p2, p3]);
    const r1 = st[0];
    expect(r1).toMatchObject({ played: 2, won: 2, lost: 0, setsWon: 4, setsLost: 1, gamesWon: 27, gamesLost: 16, gameDiff: 11, winPct: 100 });
    expect(st[2]).toMatchObject({ played: 2, won: 0, lost: 2, setsWon: 1, setsLost: 4 });
  });

  it('desempata por diferencia de juegos cuando hay igualdad de victorias', () => {
    let s = buildTournament({ B: 3 });
    const [a, b, c] = pairsOf(s, 'B').map((p) => p.id);
    // Triple empate a 1 victoria: decide la diferencia de juegos.
    s = win(s, a, b, [[6, 0], [6, 0]]); // a +12
    s = win(s, b, c, [[6, 4], [6, 4]]); // b +4
    s = win(s, c, a, [[6, 4], [6, 4]]); // c +4 , a -4
    const st = computeStandings(s, cat(s, 'B').id);
    expect(st[0].pairId).toBe(a); // +8
    expect(st[0].decidedBy).toBe(null);
    expect(st.every((r) => r.won === 1)).toBe(true);
  });

  it('usa el enfrentamiento directo cuando todo lo anterior está igualado', () => {
    let s = buildTournament({ A: 4 });
    const [a, b, c, d] = pairsOf(s, 'A').map((p) => p.id);
    // a y b: mismas victorias, juegos, sets; a ganó el directo.
    s = win(s, a, b, [[6, 4], [6, 4]]);
    s = win(s, b, c, [[6, 4], [6, 4]]);
    s = win(s, c, a, [[6, 4], [6, 4]]);
    s = win(s, a, d, [[6, 4], [6, 4]]);
    s = win(s, b, d, [[6, 4], [6, 4]]);
    s = win(s, d, c, [[6, 4], [6, 4]]);
    const st = computeStandings(s, cat(s, 'A').id);
    const ia = st.findIndex((r) => r.pairId === a);
    const ib = st.findIndex((r) => r.pairId === b);
    expect(ia).toBeLessThan(ib);
    expect(st[ib].decidedBy).toBe('head_to_head');
  });

  it('corregir un marcador recalcula sin duplicar victorias', () => {
    let s = buildTournament({ A: 2 });
    const [a, b] = pairsOf(s, 'A').map((p) => p.id);
    s = win(s, a, b, [[6, 1], [6, 1]]);
    s = win(s, b, a, [[6, 3], [6, 3]]); // corrección: en realidad ganó b
    const st = computeStandings(s, cat(s, 'A').id);
    expect(st[0]).toMatchObject({ pairId: b, won: 1, played: 1, gamesWon: 12, gamesLost: 6 });
    expect(st[1]).toMatchObject({ pairId: a, won: 0, lost: 1, played: 1 });
    expect(s.matchSets.length).toBe(2);
  });

  it('W.O. cuenta como 6-0 6-0 para el ganador', () => {
    let s = buildTournament({ C: 2 });
    const [a, b] = pairsOf(s, 'C').map((p) => p.id);
    const m = findMatch(s, a, b);
    s = recordResult(s, m.id, { outcome: 'walkover', sets: [], forfeitPairId: b });
    const st = computeStandings(s, cat(s, 'C').id);
    expect(st[0]).toMatchObject({ pairId: a, won: 1, setsWon: 2, gamesWon: 12, gamesLost: 0 });
  });

  it('abandono: se completan juegos y sets a favor del ganador', () => {
    let s = buildTournament({ C: 2 });
    const [a, b] = pairsOf(s, 'C').map((p) => p.id);
    const m = findMatch(s, a, b);
    const aIs1 = m.pair1Id === a;
    s = recordResult(s, m.id, {
      outcome: 'retired',
      forfeitPairId: b,
      sets: [aIs1 ? { games1: 4, games2: 6 } : { games1: 6, games2: 4 }, aIs1 ? { games1: 3, games2: 1 } : { games1: 1, games2: 3 }],
    });
    const st = computeStandings(s, cat(s, 'C').id);
    expect(st[0]).toMatchObject({ pairId: a, won: 1, setsWon: 2, setsLost: 1, gamesWon: 4 + 6 + 6, gamesLost: 6 + 1 + 0 });
  });

  it('los partidos cancelados no cuentan y la categoría puede completarse', () => {
    let s = buildTournament({ A: 3 });
    const [a, b, c] = pairsOf(s, 'A').map((p) => p.id);
    s = win(s, a, b, [[6, 1], [6, 1]]);
    s = win(s, a, c, [[6, 1], [6, 1]]);
    expect(categoryProgress(s, cat(s, 'A').id).complete).toBe(false);
    expect(categoryProgress(s, cat(s, 'A').id).unevenPlayed).toBe(true);
    s = cancelMatch(s, findMatch(s, b, c).id, 'lluvia');
    const p = categoryProgress(s, cat(s, 'A').id);
    expect(p.complete).toBe(true);
    const st = computeStandings(s, cat(s, 'A').id);
    expect(st.find((r) => r.pairId === b)!.totalAssigned).toBe(1);
  });

  it('empate absoluto: queda marcado y se resuelve por sorteo registrado', () => {
    let s = buildTournament({ A: 3 });
    const [a, b, c] = pairsOf(s, 'A').map((p) => p.id);
    s = win(s, a, b, [[6, 4], [6, 4]]);
    s = win(s, b, c, [[6, 4], [6, 4]]);
    s = win(s, c, a, [[6, 4], [6, 4]]);
    let st = computeStandings(s, cat(s, 'A').id);
    expect(st.every((r) => r.unresolvedTie)).toBe(true);
    expect(st.every((r) => r.position === 1)).toBe(true);
    s = performDraw(s, cat(s, 'A').id, seededRandom(42));
    st = computeStandings(s, cat(s, 'A').id);
    expect(st.some((r) => r.unresolvedTie)).toBe(false);
    expect(st.map((r) => r.position)).toEqual([1, 2, 3]);
    expect(st.slice(1).every((r) => r.decidedBy === 'draw')).toBe(true);
  });

  it('respeta un criterio de desempate configurado distinto', () => {
    let s = buildTournament({ A: 3 }, { settings: { tiebreakers: ['games_lost_asc', 'head_to_head'] } });
    const [a, b, c] = pairsOf(s, 'A').map((p) => p.id);
    s = win(s, a, b, [[6, 0], [6, 0]]);
    s = win(s, b, c, [[6, 0], [6, 0]]);
    s = win(s, c, a, [[7, 6], [7, 6]]);
    const st = computeStandings(s, cat(s, 'A').id);
    // juegos en contra: a=14, b=12, c=24 → b, a, c (la diferencia de juegos no se usa).
    expect(st.map((r) => r.pairId)).toEqual([b, a, c]);
    expect(st[1].decidedBy).toBe('games_lost_asc');
  });
});
