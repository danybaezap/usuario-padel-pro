import { useMemo } from 'react';
import { simulateSchedule, type EstimatedSlot } from '@/domain/scheduler';
import type { TournamentSnapshot } from '@/domain/types';

/** Horarios estimados de los partidos pendientes (simulación con el motor real de asignación). */
export function useEstimates(s: TournamentSnapshot, now: Date): Map<string, EstimatedSlot> {
  // Recalcular solo cuando cambia el torneo o cada pocos minutos.
  const bucket = Math.floor(now.getTime() / 120000);
  return useMemo(() => {
    const slots = simulateSchedule(s, new Date());
    return new Map(slots.map((sl) => [sl.matchId, sl]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, bucket]);
}

export function upcomingOrdered(s: TournamentSnapshot, est: Map<string, EstimatedSlot>) {
  return s.matches
    .filter((m) => m.status === 'pending' || m.status === 'scheduled')
    .map((m) => ({ match: m, slot: est.get(m.id) }))
    .sort((a, b) => {
      if (a.match.status !== b.match.status) return a.match.status === 'scheduled' ? -1 : 1;
      return (a.slot?.start.getTime() ?? Infinity) - (b.slot?.start.getTime() ?? Infinity);
    });
}
