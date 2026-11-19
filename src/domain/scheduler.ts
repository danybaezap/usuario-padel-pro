import type { Court, Match, TournamentSnapshot } from './types';
import { isActiveOnCourt, minutesBetween } from './util';

export interface Candidate {
  match: Match;
  restOk: boolean;
  /** Minutos que faltan para cumplir el descanso mínimo (0 si cumple). */
  restDeficit: number;
  score: number;
  reasons: string[];
}

export interface Proposal {
  courtId: string;
  match: Match;
  warnings: string[];
  reasons: string[];
}

/** Parejas ocupadas: con un partido programado o en curso. */
export function busyPairIds(s: TournamentSnapshot): Set<string> {
  const busy = new Set<string>();
  for (const m of s.matches) if (isActiveOnCourt(m)) {
    busy.add(m.pair1Id);
    busy.add(m.pair2Id);
  }
  return busy;
}

export function freeCourts(s: TournamentSnapshot): Court[] {
  const occupied = new Set(s.matches.filter(isActiveOnCourt).map((m) => m.courtId));
  return [...s.courts].filter((c) => c.active && !occupied.has(c.id)).sort((a, b) => a.number - b.number);
}

export function matchOnCourt(s: TournamentSnapshot, courtId: string): Match | undefined {
  return s.matches.find((m) => m.courtId === courtId && isActiveOnCourt(m));
}

function lastFinishedByPair(s: TournamentSnapshot): Map<string, string> {
  const last = new Map<string, string>();
  for (const m of s.matches) {
    if (m.status !== 'finished' || !m.finishedAt) continue;
    for (const p of [m.pair1Id, m.pair2Id]) {
      const prev = last.get(p);
      if (!prev || prev < m.finishedAt) last.set(p, m.finishedAt);
    }
  }
  return last;
}

/**
 * Ordena los partidos elegibles (pendientes y sin parejas ocupadas) por prioridad:
 * 1. Descanso mínimo cumplido.
 * 2. Vuelta más temprana (todas las parejas se enfrentan antes de repetir).
 * 3. Menos aplazamientos.
 * 4. Puntuación: categoría más retrasada, parejas con menos partidos,
 *    mayor tiempo de espera y jornada más temprana.
 */
export function rankCandidates(s: TournamentSnapshot, now: Date, extraBusy: Set<string> = new Set()): Candidate[] {
  const busy = busyPairIds(s);
  extraBusy.forEach((p) => busy.add(p));
  const minRest = s.tournament.settings.scheduling.minRestMinutes;
  const last = lastFinishedByPair(s);

  // Progreso por categoría y partidos (jugados + en juego) por pareja.
  const catTotals = new Map<string, { total: number; done: number }>();
  const pairLoad = new Map<string, number>();
  for (const m of s.matches) {
    if (m.status === 'cancelled') continue;
    const t = catTotals.get(m.categoryId) ?? { total: 0, done: 0 };
    t.total++;
    if (m.status === 'finished' || isActiveOnCourt(m)) {
      t.done++;
      for (const p of [m.pair1Id, m.pair2Id]) pairLoad.set(p, (pairLoad.get(p) ?? 0) + 1);
    }
    catTotals.set(m.categoryId, t);
  }
  const catAvgLoad = new Map<string, number>();
  for (const cat of s.categories) {
    const pairs = s.pairs.filter((p) => p.categoryId === cat.id);
    const sum = pairs.reduce((acc, p) => acc + (pairLoad.get(p.id) ?? 0), 0);
    catAvgLoad.set(cat.id, pairs.length ? sum / pairs.length : 0);
  }

  const out: Candidate[] = [];
  for (const m of s.matches) {
    if (m.status !== 'pending') continue;
    if (busy.has(m.pair1Id) || busy.has(m.pair2Id)) continue;
    const reasons: string[] = [];
    let restDeficit = 0;
    let waited = 180;
    for (const p of [m.pair1Id, m.pair2Id]) {
      const lf = last.get(p);
      if (lf) {
        const since = minutesBetween(lf, now);
        restDeficit = Math.max(restDeficit, minRest - since);
        waited = Math.min(waited, since);
      }
    }
    restDeficit = Math.max(0, Math.ceil(restDeficit));
    const t = catTotals.get(m.categoryId) ?? { total: 1, done: 0 };
    const progress = t.total ? t.done / t.total : 1;
    const avg = catAvgLoad.get(m.categoryId) ?? 0;
    const load = ((pairLoad.get(m.pair1Id) ?? 0) + (pairLoad.get(m.pair2Id) ?? 0)) / 2;
    const deficit = avg - load;
    const score = (1 - progress) * 300 + deficit * 30 + Math.max(0, Math.min(waited, 180)) * 0.3 - m.round * 8 - m.orderIndex * 0.01;
    if (progress < 0.999) reasons.push(`Categoría al ${Math.round(progress * 100)}%`);
    if (deficit > 0.4) reasons.push('Parejas con menos partidos');
    if (waited >= 180) reasons.push('Parejas descansadas');
    else reasons.push(`Descanso ${Math.floor(waited)} min`);
    out.push({ match: m, restOk: restDeficit === 0, restDeficit, score, reasons });
  }
  const phaseRank = (m: Match) => (m.phase === 'round_robin' ? 0 : m.phase === 'final' ? 2 : 1);
  out.sort(
    (a, b) =>
      Number(!a.restOk) - Number(!b.restOk) ||
      (a.restOk ? 0 : a.restDeficit - b.restDeficit) ||
      phaseRank(a.match) - phaseRank(b.match) ||
      a.match.leg - b.match.leg ||
      a.match.postponedCount - b.match.postponedCount ||
      b.score - a.score,
  );
  return out;
}

/** Propone un partido para cada cancha libre (sin conflictos de parejas entre propuestas). */
export function proposeForFreeCourts(s: TournamentSnapshot, now: Date): Proposal[] {
  const proposals: Proposal[] = [];
  const reserved = new Set<string>();
  for (const court of freeCourts(s)) {
    const best = rankCandidates(s, now, reserved)[0];
    if (!best) break;
    reserved.add(best.match.pair1Id);
    reserved.add(best.match.pair2Id);
    proposals.push({
      courtId: court.id,
      match: best.match,
      reasons: best.reasons,
      warnings: best.restOk ? [] : [`Descanso insuficiente: faltan ${best.restDeficit} min`],
    });
  }
  return proposals;
}

export interface EstimatedSlot {
  matchId: string;
  courtId: string;
  start: Date;
  end: Date;
  /** true si ya está en cancha (programado o en curso). */
  live: boolean;
}

/**
 * Simula el resto del torneo con el mismo motor de propuestas para estimar
 * horarios y orden de los próximos partidos. No modifica el snapshot.
 */
export function simulateSchedule(s: TournamentSnapshot, now: Date, opts: { maxMatches?: number } = {}): EstimatedSlot[] {
  const { estimatedMatchMinutes: dur, changeoverMinutes: gap } = s.tournament.settings.scheduling;
  const sim: TournamentSnapshot = { ...s, matches: s.matches.map((m) => ({ ...m })) };
  const courts = s.courts.filter((c) => c.active).sort((a, b) => a.number - b.number);
  if (!courts.length) return [];
  const courtFree = new Map<string, number>(courts.map((c) => [c.id, now.getTime()]));
  const running: Array<{ match: Match; end: number }> = [];
  const slots: EstimatedSlot[] = [];

  for (const m of sim.matches) {
    if (!isActiveOnCourt(m) || !m.courtId || !courtFree.has(m.courtId)) continue;
    const start = m.status === 'in_progress' && m.startedAt ? new Date(m.startedAt).getTime() : now.getTime();
    const end = Math.max(start + dur * 60000, now.getTime() + 5 * 60000);
    running.push({ match: m, end });
    courtFree.set(m.courtId, end + gap * 60000);
    slots.push({ matchId: m.id, courtId: m.courtId, start: new Date(start), end: new Date(end), live: true });
  }

  const max = opts.maxMatches ?? Infinity;
  let guard = 0;
  while (guard++ < 5000 && slots.length < max + running.length) {
    // Cancha que antes se libera.
    let courtId = courts[0].id;
    for (const c of courts) if (courtFree.get(c.id)! < courtFree.get(courtId)!) courtId = c.id;
    const t = courtFree.get(courtId)!;
    // Finalizar partidos simulados terminados antes de t.
    for (let i = running.length - 1; i >= 0; i--) {
      if (running[i].end <= t) {
        const m = running[i].match;
        m.status = 'finished';
        m.finishedAt = new Date(running[i].end).toISOString();
        m.winnerPairId = m.pair1Id;
        m.courtId = null;
        running.splice(i, 1);
      }
    }
    const candidates = rankCandidates(sim, new Date(t));
    if (!candidates.length) {
      if (!running.length) break; // nada más que programar
      const nextEnd = Math.min(...running.map((r) => r.end));
      courtFree.set(courtId, Math.max(nextEnd, t + 60000));
      continue;
    }
    const best = candidates[0];
    if (!best.restOk) {
      // Esperar a que se cumpla el descanso (o a que termine otro partido).
      const nextEnd = running.length ? Math.min(...running.map((r) => r.end)) : Infinity;
      const wait = Math.min(t + best.restDeficit * 60000, nextEnd);
      courtFree.set(courtId, Math.max(wait, t + 60000));
      continue;
    }
    const m = best.match;
    m.status = 'in_progress';
    m.courtId = courtId;
    m.startedAt = new Date(t).toISOString();
    const end = t + dur * 60000;
    running.push({ match: m, end });
    courtFree.set(courtId, end + gap * 60000);
    slots.push({ matchId: m.id, courtId, start: new Date(t), end: new Date(end), live: false });
  }
  return slots;
}
