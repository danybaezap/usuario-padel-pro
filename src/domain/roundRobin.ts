import { DomainError, type ScheduleConfig } from './types';

export interface Pairing {
  leg: number;
  round: number;
  pair1Id: string;
  pair2Id: string;
}

/**
 * Método del círculo (Berger). Con n impar se añade un "descanso" (bye):
 * en cada jornada una pareja descansa. Devuelve n-1 jornadas (n par) o n
 * jornadas (n impar) donde cada pareja juega como máximo una vez por jornada
 * y todas se enfrentan exactamente una vez.
 */
export function circleRounds(ids: string[]): Array<Array<[string, string]>> {
  if (ids.length < 2) return [];
  const list: (string | null)[] = [...ids];
  if (list.length % 2 === 1) list.push(null);
  const n = list.length;
  const rounds: Array<Array<[string, string]>> = [];
  const firstCount = new Map<string, number>();
  for (let r = 0; r < n - 1; r++) {
    const round: Array<[string, string]> = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a && b) {
        // Equilibrar el lado del marcador: figura primero quien menos veces lo ha hecho.
        const fa = firstCount.get(a) ?? 0;
        const fb = firstCount.get(b) ?? 0;
        const pairing: [string, string] = fa < fb || (fa === fb && (r + i) % 2 === 0) ? [a, b] : [b, a];
        firstCount.set(pairing[0], (firstCount.get(pairing[0]) ?? 0) + 1);
        round.push(pairing);
      }
    }
    rounds.push(round);
    // Rotación: el primero fijo, el último pasa a la segunda posición.
    const last = list.pop()!;
    list.splice(1, 0, last);
  }
  return rounds;
}

export function maxMatchesPerPairPerLeg(n: number): number {
  return Math.max(0, n - 1);
}

/**
 * Genera los enfrentamientos de una categoría.
 * - legs: vueltas completas (todas contra todas, repetido L veces; en vueltas pares se invierte el orden).
 * - matches_per_pair: número reducido de partidos por pareja. Se toman jornadas
 *   completas en orden, de modo que nadie repite rival antes de enfrentar a todos.
 *   Con número impar de parejas se compensan los descansos emparejando entre sí
 *   a las parejas con déficit cuando es posible.
 */
export function generateRoundRobin(pairIds: string[], config: ScheduleConfig): Pairing[] {
  const n = pairIds.length;
  if (n < 2) throw new DomainError('Se necesitan al menos 2 parejas en la categoría para generar partidos.');
  if (new Set(pairIds).size !== n) throw new DomainError('Hay parejas duplicadas en la categoría.');
  const base = circleRounds(pairIds);

  if (config.mode === 'legs') {
    const legs = Math.max(1, Math.floor(config.legs));
    if (legs > 6) throw new DomainError('Máximo 6 vueltas.');
    const out: Pairing[] = [];
    for (let leg = 1; leg <= legs; leg++) {
      base.forEach((round, r) =>
        round.forEach(([a, b]) => {
          const swap = leg % 2 === 0;
          out.push({ leg, round: r + 1, pair1Id: swap ? b : a, pair2Id: swap ? a : b });
        }),
      );
    }
    return out;
  }

  const k = Math.floor(config.matchesPerPair);
  if (k < 1) throw new DomainError('El número de partidos por pareja debe ser al menos 1.');
  const perLeg = n - 1;
  if (k > perLeg * 6) throw new DomainError('Demasiados partidos por pareja.');

  const out: Pairing[] = [];
  const count = new Map<string, number>(pairIds.map((id) => [id, 0]));
  const roundsPerLeg = base.length;
  let leg = 1;
  let r = 0;
  // Añadir jornadas completas mientras ninguna pareja supere k.
  for (;;) {
    const round = base[r];
    const wouldExceed = round.some(([a, b]) => count.get(a)! + 1 > k || count.get(b)! + 1 > k);
    if (wouldExceed) break;
    const allDone = pairIds.every((id) => count.get(id)! >= k);
    if (allDone) break;
    round.forEach(([a, b]) => {
      const swap = leg % 2 === 0;
      out.push({ leg, round: r + 1, pair1Id: swap ? b : a, pair2Id: swap ? a : b });
      count.set(a, count.get(a)! + 1);
      count.set(b, count.get(b)! + 1);
    });
    r++;
    if (r >= roundsPerLeg) {
      r = 0;
      leg++;
    }
  }

  // Compensación: emparejar parejas con déficit que aún no se hayan enfrentado (en esta vuelta).
  const played = new Set(out.filter((p) => p.leg === leg).map((p) => key(p.pair1Id, p.pair2Id)));
  const deficit = pairIds.filter((id) => count.get(id)! < k);
  const extraRound = (out.length ? Math.max(...out.filter((p) => p.leg === leg).map((p) => p.round), 0) : 0) + 1;
  const matched = matchDeficit(deficit, played);
  for (const [a, b] of matched) {
    out.push({ leg, round: extraRound, pair1Id: a, pair2Id: b });
    count.set(a, count.get(a)! + 1);
    count.set(b, count.get(b)! + 1);
  }
  return out;
}

function key(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Emparejamiento máximo (búsqueda exhaustiva acotada; las listas son pequeñas). */
function matchDeficit(ids: string[], played: Set<string>): Array<[string, string]> {
  let best: Array<[string, string]> = [];
  const rec = (rest: string[], acc: Array<[string, string]>) => {
    if (acc.length > best.length) best = [...acc];
    if (rest.length < 2 || best.length * 2 >= ids.length - (ids.length % 2)) return;
    const [first, ...others] = rest;
    for (let i = 0; i < others.length; i++) {
      const b = others[i];
      if (played.has(key(first, b))) continue;
      rec(others.filter((_, j) => j !== i), [...acc, [first, b]]);
    }
    rec(others, acc); // dejar a `first` sin pareja
  };
  rec(ids, []);
  return best;
}

/** Resumen de partidos que jugará cada pareja con una configuración dada. */
export function previewSchedule(pairIds: string[], config: ScheduleConfig) {
  const pairings = generateRoundRobin(pairIds, config);
  const perPair = new Map<string, number>(pairIds.map((id) => [id, 0]));
  for (const p of pairings) {
    perPair.set(p.pair1Id, perPair.get(p.pair1Id)! + 1);
    perPair.set(p.pair2Id, perPair.get(p.pair2Id)! + 1);
  }
  const values = [...perPair.values()];
  return {
    totalMatches: pairings.length,
    minPerPair: Math.min(...values),
    maxPerPair: Math.max(...values),
    balanced: Math.min(...values) === Math.max(...values),
  };
}
