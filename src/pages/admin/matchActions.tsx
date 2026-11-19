import { useState } from 'react';
import { ScoreEntryModal } from '@/components/ScoreEntry';
import { useConfirm } from '@/components/ui';
import {
  assignMatch,
  cancelMatch,
  clearResult,
  moveMatch,
  postponeMatch,
  recordResult,
  resumeMatch,
  startMatch,
  suspendMatch,
  unassignMatch,
} from '@/domain/commands';
import type { Match } from '@/domain/types';
import { useTournament } from '@/hooks/useTournament';

/** Acciones de partido compartidas por el panel de control y la lista de partidos. */
export function useMatchActions() {
  const { run, snapshot: s, index } = useTournament();
  const { ask, dialog } = useConfirm();
  const [scoring, setScoring] = useState<Match | null>(null);
  const name = (m: Match) => `${index.pairName(m.pair1Id)} vs ${index.pairName(m.pair2Id)}`;

  const actions = {
    assign: (m: Match, courtId: string) => run((x) => assignMatch(x, m.id, courtId, new Date()), `Partido asignado a ${s.courts.find((c) => c.id === courtId)?.name}`),
    start: (m: Match) => run((x) => startMatch(x, m.id, new Date()), 'Partido iniciado'),
    move: (m: Match, courtId: string) => run((x) => moveMatch(x, m.id, courtId), 'Cancha actualizada'),
    unassign: (m: Match) => run((x) => unassignMatch(x, m.id), 'Partido devuelto a pendientes'),
    postpone: (m: Match) => run((x) => postponeMatch(x, m.id), 'Partido pospuesto (menor prioridad)'),
    suspend: async (m: Match) => {
      const ok = await ask('Suspender partido', <>¿Suspender <b>{name(m)}</b>? La cancha quedará libre y el partido no se propondrá hasta que lo reanudes.</>, { confirm: 'Suspender', danger: true });
      if (ok) await run((x) => suspendMatch(x, m.id), 'Partido suspendido');
    },
    resume: (m: Match) => run((x) => resumeMatch(x, m.id), 'Partido reactivado en pendientes'),
    cancel: async (m: Match) => {
      const ok = await ask(
        'Cancelar partido',
        <>¿Cancelar definitivamente <b>{name(m)}</b>? No contará para la clasificación (las parejas quedarán con distinto número de partidos jugados). Puedes reactivarlo después.</>,
        { confirm: 'Cancelar partido', danger: true },
      );
      if (ok) await run((x) => cancelMatch(x, m.id), 'Partido cancelado');
    },
    clear: async (m: Match) => {
      const ok = await ask('Anular resultado', <>Se eliminará el resultado de <b>{name(m)}</b> y el partido volverá a pendientes. La clasificación se recalculará.</>, { confirm: 'Anular resultado', danger: true });
      if (ok) await run((x) => clearResult(x, m.id), 'Resultado anulado');
    },
    score: (m: Match) => setScoring(m),
  };

  const ui = (
    <>
      {dialog}
      <ScoreEntryModal
        open={!!scoring}
        onClose={() => setScoring(null)}
        s={s}
        index={index}
        match={scoring ? s.matches.find((m) => m.id === scoring.id) ?? scoring : null}
        onSubmit={(input) => run((x) => recordResult(x, scoring!.id, input, new Date()), scoring?.status === 'finished' ? 'Resultado corregido y clasificación recalculada' : 'Resultado registrado · cancha libre')}
      />
    </>
  );
  return { actions, ui };
}
