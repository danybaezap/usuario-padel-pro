import { describe, expect, it } from 'vitest';
import { assignMatch, recordResult, startMatch } from '../commands';
import { createDemoTournament, randomResult, simulateWave } from '../demo';
import { busyPairIds, proposeForFreeCourts, simulateSchedule } from '../scheduler';
import { categoryProgress, computeStandings } from '../standings';
import type { TournamentSnapshot } from '../types';
import { seededRandom } from '../util';
import { buildTournament, minutes } from './helpers';

function overlaps(a: { start: Date; end: Date }, b: { start: Date; end: Date }) {
  return a.start < b.end && b.start < a.end;
}

describe('Propuestas de cancha', () => {
  it('propone un partido por cancha libre sin parejas repetidas', () => {
    const s = buildTournament({ A: 4, B: 4, C: 4 });
    const props = proposeForFreeCourts(s, new Date());
    expect(props.length).toBe(3);
    const pairs = props.flatMap((p) => [p.match.pair1Id, p.match.pair2Id]);
    expect(new Set(pairs).size).toBe(pairs.length);
    expect(new Set(props.map((p) => p.courtId)).size).toBe(3);
  });

  it('reparte las primeras canchas entre las tres categorías', () => {
    const s = buildTournament({ A: 6, B: 6, C: 6 });
    const props = proposeForFreeCourts(s, new Date());
    expect(new Set(props.map((p) => p.match.categoryId)).size).toBe(3);
  });

  it('prioriza parejas que cumplen el descanso mínimo', () => {
    let s = buildTournament({ A: 4, B: 2 }, { settings: { scheduling: { minRestMinutes: 30, estimatedMatchMinutes: 60, changeoverMinutes: 0 } } });
    const t0 = new Date('2026-01-01T10:00:00Z');
    const aFirst = s.matches.find((m) => m.categoryId === s.categories[0].id)!;
    s = assignMatch(s, aFirst.id, s.courts[0].id, t0);
    s = startMatch(s, aFirst.id, t0);
    s = recordResult(s, aFirst.id, { outcome: 'normal', sets: [{ games1: 6, games2: 0 }, { games1: 6, games2: 0 }] }, minutes(t0, 50));
    const props = proposeForFreeCourts(s, minutes(t0, 55));
    const first = props[0];
    expect([first.match.pair1Id, first.match.pair2Id]).not.toContain(aFirst.pair1Id);
    expect(first.warnings).toEqual([]);
  });
});

describe('Calendario estimado (simulación)', () => {
  it('sin solapes por pareja ni por cancha y con descanso mínimo', () => {
    const s = buildTournament({ A: 7, B: 5, C: 8 }, { settings: { scheduling: { minRestMinutes: 15, estimatedMatchMinutes: 60, changeoverMinutes: 5 } } });
    const t0 = new Date('2026-01-01T09:00:00Z');
    const slots = simulateSchedule(s, t0);
    expect(slots.length).toBe(s.matches.length);
    const byMatch = new Map(s.matches.map((m) => [m.id, m]));
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const a = slots[i];
        const b = slots[j];
        if (a.courtId === b.courtId) expect(overlaps(a, b)).toBe(false);
        const ma = byMatch.get(a.matchId)!;
        const mb = byMatch.get(b.matchId)!;
        const shared = [ma.pair1Id, ma.pair2Id].some((p) => p === mb.pair1Id || p === mb.pair2Id);
        if (shared) {
          expect(overlaps(a, b)).toBe(false);
          const gap = Math.abs((a.start < b.start ? b.start.getTime() - a.end.getTime() : a.start.getTime() - b.end.getTime()) / 60000);
          expect(gap).toBeGreaterThanOrEqual(15);
        }
      }
    }
  });

  it('las categorías avanzan de forma equilibrada', () => {
    const s = buildTournament({ A: 6, B: 6, C: 6 });
    const slots = simulateSchedule(s, new Date('2026-01-01T09:00:00Z'));
    const half = slots.slice(0, Math.floor(slots.length / 2));
    const perCat = new Map<string, number>();
    for (const sl of half) {
      const m = s.matches.find((x) => x.id === sl.matchId)!;
      perCat.set(m.categoryId, (perCat.get(m.categoryId) ?? 0) + 1);
    }
    const values = [...perCat.values()];
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(2);
  });

  it('respeta la primera vuelta antes de repetir enfrentamientos', () => {
    const s = buildTournament({ A: 4 }, { config: { mode: 'legs', legs: 2, matchesPerPair: 0 } });
    const slots = simulateSchedule(s, new Date());
    const legs = slots.map((sl) => s.matches.find((m) => m.id === sl.matchId)!.leg);
    const firstLeg2 = legs.indexOf(2);
    expect(legs.slice(firstLeg2).includes(1)).toBe(false);
  });
});

describe('Simulación integral del modo demostración', () => {
  it('juega el torneo completo en 3 canchas sin conflictos', () => {
    let s: TournamentSnapshot = createDemoTournament();
    expect(s.tournament.isDemo).toBe(true);
    expect(s.players.length).toBe(24);
    expect(s.pairs.length).toBe(12);
    let clock = new Date('2026-03-01T09:00:00Z');
    let guard = 0;
    while (s.matches.some((m) => m.status !== 'finished') && guard++ < 200) {
      const r = simulateWave(s, clock, guard);
      s = r.snapshot;
      // Invariantes tras cada oleada
      const active = s.matches.filter((m) => m.status === 'in_progress' || m.status === 'scheduled');
      expect(active.length).toBeLessThanOrEqual(3);
      expect(new Set(active.map((m) => m.courtId)).size).toBe(active.length);
      const pairs = active.flatMap((m) => [m.pair1Id, m.pair2Id]);
      expect(new Set(pairs).size).toBe(pairs.length);
      expect(busyPairIds(s).size).toBe(pairs.length);
      clock = minutes(clock, 60);
    }
    for (const c of s.categories) {
      expect(categoryProgress(s, c.id).complete).toBe(true);
      const st = computeStandings(s, c.id);
      const n = st.length;
      expect(st.every((r) => r.played === n - 1)).toBe(true);
      expect(st.reduce((a, r) => a + r.won, 0)).toBe((n * (n - 1)) / 2);
    }
  });

  it('marcadores aleatorios siempre válidos para varios formatos', () => {
    const rand = seededRandom(5);
    const s = buildTournament({ A: 2 });
    for (let i = 0; i < 200; i++) {
      expect(() => recordResult(s, s.matches[0].id, randomResult(s.tournament.settings.format, rand))).not.toThrow();
    }
  });
});
