import { FastForward, FlaskConical, StepForward } from 'lucide-react';
import { useState } from 'react';
import { simulateWave } from '@/domain/demo';
import { useTournament } from '@/hooks/useTournament';

/** Controles exclusivos de torneos de demostración: simulan partidos con el motor real. */
export function DemoControls() {
  const { run, snapshot: s } = useTournament();
  const [running, setRunning] = useState(false);
  const pending = s.matches.filter((m) => m.status !== 'finished' && m.status !== 'cancelled').length;

  const wave = () =>
    run((snap) => simulateWave(snap, new Date(), Date.now()).snapshot, 'Oleada simulada: resultados registrados y nuevos partidos en cancha');

  const all = async () => {
    setRunning(true);
    await run((snap) => {
      let cur = snap;
      for (let g = 0; g < 200 && cur.matches.some((m) => m.phase === 'round_robin' && !['finished', 'cancelled'].includes(m.status)); g++) {
        cur = simulateWave(cur, new Date(), Date.now() + g).snapshot;
      }
      return cur;
    }, 'Round robin simulado por completo');
    setRunning(false);
  };

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-fuchsia-400/20 bg-fuchsia-500/[0.06] px-4 py-3">
      <FlaskConical className="h-5 w-5 text-fuchsia-300" />
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-semibold text-fuchsia-200">Modo demostración</div>
        <div className="text-xs text-fuchsia-200/70">Datos ficticios separados de los torneos reales. {pending} partidos por terminar.</div>
      </div>
      <button className="btn-secondary btn-sm" onClick={wave} disabled={!pending}>
        <StepForward className="h-4 w-4" /> Simular oleada
      </button>
      <button className="btn-secondary btn-sm" onClick={all} disabled={!pending || running}>
        <FastForward className="h-4 w-4" /> Simular todo el round robin
      </button>
    </div>
  );
}
