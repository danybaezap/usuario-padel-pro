import { describe, expect, it } from 'vitest';
import { circleRounds, generateRoundRobin, previewSchedule } from '../roundRobin';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const key = (a: string, b: string) => [a, b].sort().join('|');

describe('Round Robin – método del círculo', () => {
  for (let n = 2; n <= 16; n++) {
    it(`${n} parejas: todas contra todas exactamente una vez`, () => {
      const pairings = generateRoundRobin(ids(n), { mode: 'legs', legs: 1, matchesPerPair: 0 });
      expect(pairings.length).toBe((n * (n - 1)) / 2);
      const seen = new Set<string>();
      for (const p of pairings) {
        expect(p.pair1Id).not.toBe(p.pair2Id);
        const k = key(p.pair1Id, p.pair2Id);
        expect(seen.has(k)).toBe(false);
        seen.add(k);
      }
      // Nadie juega dos veces en la misma jornada.
      const byRound = new Map<number, string[]>();
      for (const p of pairings) byRound.set(p.round, [...(byRound.get(p.round) ?? []), p.pair1Id, p.pair2Id]);
      for (const list of byRound.values()) expect(new Set(list).size).toBe(list.length);
      expect(byRound.size).toBe(n % 2 === 0 ? n - 1 : n);
    });
  }

  it('con número impar cada pareja descansa exactamente una jornada', () => {
    const n = 7;
    const rounds = circleRounds(ids(n));
    const rests = new Map<string, number>(ids(n).map((id) => [id, 0]));
    for (const r of rounds) {
      const playing = new Set(r.flat());
      for (const id of ids(n)) if (!playing.has(id)) rests.set(id, rests.get(id)! + 1);
    }
    expect([...rests.values()].every((v) => v === 1)).toBe(true);
  });

  it('equilibra el lado del marcador (local/visitante)', () => {
    const pairings = generateRoundRobin(ids(8), { mode: 'legs', legs: 1, matchesPerPair: 0 });
    const first = new Map<string, number>();
    for (const p of pairings) first.set(p.pair1Id, (first.get(p.pair1Id) ?? 0) + 1);
    for (const id of ids(8)) expect(Math.abs((first.get(id) ?? 0) - 3.5)).toBeLessThanOrEqual(2.5);
  });
});

describe('Round Robin – varias vueltas', () => {
  it('2 vueltas: cada cruce dos veces y la vuelta 2 no empieza antes de terminar la 1', () => {
    const pairings = generateRoundRobin(ids(5), { mode: 'legs', legs: 2, matchesPerPair: 0 });
    expect(pairings.length).toBe(20);
    const count = new Map<string, number>();
    for (const p of pairings) count.set(key(p.pair1Id, p.pair2Id), (count.get(key(p.pair1Id, p.pair2Id)) ?? 0) + 1);
    expect([...count.values()].every((v) => v === 2)).toBe(true);
    const legs = pairings.map((p) => p.leg);
    expect(legs).toEqual([...legs].sort());
  });
});

describe('Round Robin – número reducido de partidos', () => {
  it('8 parejas, 3 partidos cada una, sin rivales repetidos', () => {
    const pairings = generateRoundRobin(ids(8), { mode: 'matches_per_pair', legs: 1, matchesPerPair: 3 });
    const count = new Map<string, number>();
    for (const p of pairings) {
      count.set(p.pair1Id, (count.get(p.pair1Id) ?? 0) + 1);
      count.set(p.pair2Id, (count.get(p.pair2Id) ?? 0) + 1);
    }
    expect([...count.values()].every((v) => v === 3)).toBe(true);
    expect(new Set(pairings.map((p) => key(p.pair1Id, p.pair2Id))).size).toBe(pairings.length);
  });

  it('impar (5 parejas, 2 partidos): compensa descansos y todas juegan 2', () => {
    const r = previewSchedule(ids(5), { mode: 'matches_per_pair', legs: 1, matchesPerPair: 2 });
    expect(r.balanced).toBe(true);
    expect(r.minPerPair).toBe(2);
    expect(r.totalMatches).toBe(5);
  });

  it('impar con n·k impar (5 parejas, 3 partidos): diferencia máxima de 1 y avisa del desequilibrio', () => {
    const r = previewSchedule(ids(5), { mode: 'matches_per_pair', legs: 1, matchesPerPair: 3 });
    expect(r.maxPerPair - r.minPerPair).toBeLessThanOrEqual(1);
    expect(r.maxPerPair).toBe(3);
    expect(r.balanced).toBe(false);
  });

  it('más partidos que una vuelta pasa a la segunda vuelta sin repetir antes de tiempo', () => {
    const pairings = generateRoundRobin(ids(4), { mode: 'matches_per_pair', legs: 1, matchesPerPair: 4 });
    const leg1 = pairings.filter((p) => p.leg === 1);
    expect(new Set(leg1.map((p) => key(p.pair1Id, p.pair2Id))).size).toBe(6);
  });

  it('rechaza categorías con menos de 2 parejas', () => {
    expect(() => generateRoundRobin(['solo'], { mode: 'legs', legs: 1, matchesPerPair: 0 })).toThrow();
  });
});
