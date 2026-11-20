import { useState } from 'react';
import { PairLabel } from '@/components/sport';
import { CategoryBadge, Modal, SectionTitle, StatusBadge } from '@/components/ui';
import { freeCourts } from '@/domain/scheduler';
import { matchScoreLabel } from '@/domain/stats';
import type { Match } from '@/domain/types';
import { PHASE_LABEL } from '@/domain/types';
import { useTournament } from '@/hooks/useTournament';
import { CalendarBoard } from '../public/CalendarView';
import { useMatchActions } from './matchActions';

export default function MatchesAdmin() {
  const [selected, setSelected] = useState<Match | null>(null);
  const { actions, ui } = useMatchActions();
  return (
    <div>
      {ui}
      <SectionTitle eyebrow="Gestión">Partidos</SectionTitle>
      <p className="mb-4 text-sm text-slate-400">Pulsa un partido para asignarlo, cambiarlo de cancha, posponerlo, suspenderlo, cancelarlo o registrar/corregir su resultado.</p>
      <CalendarBoard admin onMatchClick={setSelected} />
      <MatchActionsModal matchId={selected?.id ?? null} onClose={() => setSelected(null)} actions={actions} />
    </div>
  );
}

function MatchActionsModal({ matchId, onClose, actions }: { matchId: string | null; onClose: () => void; actions: ReturnType<typeof useMatchActions>['actions'] }) {
  const { snapshot: s, index } = useTournament();
  const m = s.matches.find((x) => x.id === matchId) ?? null;
  const cat = m ? s.categories.find((c) => c.id === m.categoryId) : null;
  const free = freeCourts(s);
  const act = (fn: () => unknown) => {
    onClose();
    void fn();
  };
  return (
    <Modal open={!!m} onClose={onClose} title="Partido">
      {m && cat && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <CategoryBadge code={cat.code} /> {cat.name} · {m.phase === 'round_robin' ? `Vuelta ${m.leg} · Jornada ${m.round}` : PHASE_LABEL[m.phase]}
            <span className="ml-auto">
              <StatusBadge status={m.status} postponed={m.postponedCount} />
            </span>
          </div>
          <div className="space-y-2 rounded-xl border border-white/10 p-3">
            <PairLabel index={index} pairId={m.pair1Id} />
            <div className="h-px bg-white/10" />
            <PairLabel index={index} pairId={m.pair2Id} />
            {m.status === 'finished' && <div className="num pt-1 text-lg font-bold text-accent">{matchScoreLabel(s, m)}</div>}
            {m.notes && <div className="text-xs text-slate-400">Nota: {m.notes}</div>}
          </div>

          {m.status === 'pending' && (
            <div>
              <div className="label">Asignar a cancha</div>
              <div className="flex flex-wrap gap-2">
                {free.length ? (
                  free.map((c) => (
                    <button key={c.id} className="btn-primary btn-sm" onClick={() => act(() => actions.assign(m, c.id))}>
                      {c.name}
                    </button>
                  ))
                ) : (
                  <span className="text-sm text-slate-500">No hay canchas libres.</span>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {m.status === 'scheduled' && (
              <button className="btn-primary btn-sm" onClick={() => act(() => actions.start(m))}>
                Iniciar
              </button>
            )}
            {m.status !== 'cancelled' && (
              <button className="btn-secondary btn-sm" onClick={() => act(() => actions.score(m))}>
                {m.status === 'finished' ? 'Corregir resultado' : 'Registrar resultado'}
              </button>
            )}
            {(m.status === 'scheduled' || m.status === 'in_progress') &&
              s.courts
                .filter((c) => c.active && c.id !== m.courtId)
                .map((c) => (
                  <button key={c.id} className="btn-secondary btn-sm" onClick={() => act(() => actions.move(m, c.id))}>
                    Mover a {c.name}
                  </button>
                ))}
            {(m.status === 'pending' || m.status === 'scheduled') && (
              <button className="btn-secondary btn-sm" onClick={() => act(() => actions.postpone(m))}>
                Posponer
              </button>
            )}
            {(m.status === 'scheduled' || m.status === 'in_progress') && (
              <button className="btn-secondary btn-sm" onClick={() => act(() => actions.unassign(m))}>
                Marcar pendiente
              </button>
            )}
            {(m.status === 'scheduled' || m.status === 'in_progress') && (
              <button className="btn-danger btn-sm" onClick={() => act(() => actions.suspend(m))}>
                Suspender
              </button>
            )}
            {(m.status === 'suspended' || m.status === 'cancelled') && (
              <button className="btn-secondary btn-sm" onClick={() => act(() => actions.resume(m))}>
                Reactivar
              </button>
            )}
            {m.status === 'finished' && (
              <button className="btn-danger btn-sm" onClick={() => act(() => actions.clear(m))}>
                Anular resultado
              </button>
            )}
            {m.phase === 'round_robin' && ['pending', 'suspended', 'scheduled'].includes(m.status) && (
              <button className="btn-danger btn-sm" onClick={() => act(() => actions.cancel(m))}>
                Cancelar partido
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
