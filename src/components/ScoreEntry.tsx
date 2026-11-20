import { Trophy } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ResultInput } from '@/domain/commands';
import { completeRetiredScore, isSuperTiebreakSet, scoreText, setsToWin, validateMatchScore, walkoverScore, type SetInput } from '@/domain/format';
import type { Match, MatchOutcome, TournamentSnapshot } from '@/domain/types';
import type { SnapshotIndex } from '@/domain/util';
import { Modal, Tabs, cx } from './ui';

interface Row {
  g1: string;
  g2: string;
  t1: string;
  t2: string;
}

const emptyRow = (): Row => ({ g1: '', g2: '', t1: '', t2: '' });

export function ScoreEntryModal({
  open,
  onClose,
  s,
  index,
  match,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  s: TournamentSnapshot;
  index: SnapshotIndex;
  match: Match | null;
  onSubmit: (input: ResultInput) => Promise<boolean>;
}) {
  const f = s.tournament.settings.format;
  const [outcome, setOutcome] = useState<MatchOutcome>('normal');
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [forfeit, setForfeit] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !match) return;
    const existing = s.matchSets.filter((x) => x.matchId === match.id).sort((a, b) => a.setNumber - b.setNumber);
    setOutcome(match.outcome ?? 'normal');
    setForfeit(match.forfeitPairId ?? '');
    const r: Row[] = existing.map((x) =>
      x.isSuperTiebreak
        ? { g1: String(x.tiebreak1 ?? ''), g2: String(x.tiebreak2 ?? ''), t1: '', t2: '' }
        : { g1: String(x.games1), g2: String(x.games2), t1: x.tiebreak1 != null ? String(x.tiebreak1) : '', t2: x.tiebreak2 != null ? String(x.tiebreak2) : '' },
    );
    setRows(r.length ? r : Array.from({ length: setsToWin(f) }, emptyRow));
  }, [open, match, s.matchSets, f]);

  const toInputs = (rs: Row[]): SetInput[] =>
    rs
      .filter((r) => r.g1 !== '' && r.g2 !== '')
      .map((r, i) => {
        if (isSuperTiebreakSet(f, i + 1)) {
          const p1 = Number(r.g1);
          const p2 = Number(r.g2);
          return { games1: p1 > p2 ? 1 : 0, games2: p2 > p1 ? 1 : 0, tiebreak1: p1, tiebreak2: p2, isSuperTiebreak: true };
        }
        return {
          games1: Number(r.g1),
          games2: Number(r.g2),
          tiebreak1: r.t1 !== '' && r.t2 !== '' ? Number(r.t1) : null,
          tiebreak2: r.t1 !== '' && r.t2 !== '' ? Number(r.t2) : null,
        };
      });

  const preview = useMemo(() => {
    if (!match) return null;
    try {
      if (outcome === 'normal') {
        const w = validateMatchScore(toInputs(rows), f);
        return { ok: true as const, winner: w === 1 ? match.pair1Id : match.pair2Id, text: scoreText(toInputs(rows)) };
      }
      if (!forfeit) return { ok: false as const, error: outcome === 'walkover' ? 'Indica la pareja ausente.' : 'Indica la pareja que abandona.' };
      const w: 1 | 2 = forfeit === match.pair1Id ? 2 : 1;
      const full = outcome === 'walkover' ? walkoverScore(w, f) : completeRetiredScore(toInputs(rows), w, f);
      return { ok: true as const, winner: w === 1 ? match.pair1Id : match.pair2Id, text: `${scoreText(full)} (oficial)` };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, outcome, forfeit, match, f]);

  if (!match) return null;

  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  // Mostrar filas necesarias: si tras los sets rellenados nadie ha ganado, añadir otra fila.
  const filled = toInputs(rows);
  let w1 = 0;
  let w2 = 0;
  filled.forEach((x, i) => {
    const sup = isSuperTiebreakSet(f, i + 1);
    const a = sup ? x.tiebreak1 ?? 0 : x.games1;
    const b = sup ? x.tiebreak2 ?? 0 : x.games2;
    if (a > b) w1++;
    else if (b > a) w2++;
  });
  const need = setsToWin(f);
  const visibleRows = Math.min(f.bestOf, Math.max(rows.length, need, w1 < need && w2 < need ? filled.length + 1 : filled.length));

  const quick = [
    [f.gamesPerSet, 0],
    [f.gamesPerSet, 1],
    [f.gamesPerSet, 2],
    [f.gamesPerSet, 3],
    [f.gamesPerSet, 4],
    [f.gamesPerSet + 1, f.gamesPerSet - 1],
    ...(f.tiebreakAt !== null ? [[f.tiebreakAt + 1, f.tiebreakAt]] : []),
  ];

  const submit = async () => {
    setSaving(true);
    const ok = await onSubmit({ outcome, sets: outcome === 'walkover' ? [] : toInputs(rows), forfeitPairId: outcome === 'normal' ? null : forfeit });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={match.status === 'finished' ? 'Corregir resultado' : 'Registrar resultado'} wide>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={outcome}
          onChange={setOutcome}
          items={[
            { value: 'normal', label: 'Resultado' },
            { value: 'walkover', label: 'W.O.' },
            { value: 'retired', label: 'Abandono' },
          ]}
        />
        <span className="text-xs text-slate-400">
          Mejor de {f.bestOf} · sets a {f.gamesPerSet}
          {f.tiebreakAt !== null ? ` · TB ${f.tiebreakAt}-${f.tiebreakAt}` : ''}
          {f.decidingSet === 'super_tiebreak' ? ` · STB a ${f.superTiebreakPoints}` : ''}
          {f.goldenPoint ? ' · punto de oro' : ''}
        </span>
      </div>

      {outcome !== 'normal' && (
        <div className="mb-4">
          <div className="label">{outcome === 'walkover' ? 'Pareja que NO se presentó' : 'Pareja que abandona'}</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {[match.pair1Id, match.pair2Id].map((p) => (
              <button
                key={p}
                className={cx('rounded-xl border px-3 py-2 text-left text-sm transition', forfeit === p ? 'border-rose-400/60 bg-rose-500/10 text-white' : 'border-white/10 hover:bg-white/5')}
                onClick={() => setForfeit(p)}
              >
                {index.pairName(p)}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {outcome === 'walkover'
              ? 'El ganador recibe el marcador máximo del formato.'
              : 'Introduce los juegos realmente disputados (el último set puede estar incompleto). Se completan a favor del ganador.'}
          </p>
        </div>
      )}

      {outcome !== 'walkover' && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-separate border-spacing-y-1.5">
            <thead>
              <tr>
                <th className="label text-left">Pareja</th>
                {Array.from({ length: visibleRows }, (_, i) => (
                  <th key={i} className="label text-center">
                    {isSuperTiebreakSet(f, i + 1) ? 'STB' : `Set ${i + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {([1, 2] as const).map((side) => (
                <tr key={side}>
                  <td className="pr-2 text-sm font-semibold text-white">{index.pairName(side === 1 ? match.pair1Id : match.pair2Id)}</td>
                  {Array.from({ length: visibleRows }, (_, i) => {
                    const r = rows[i] ?? emptyRow();
                    const key = side === 1 ? 'g1' : 'g2';
                    return (
                      <td key={i} className="px-1 text-center">
                        <input
                          aria-label={`Set ${i + 1} pareja ${side}`}
                          inputMode="numeric"
                          className="input num h-12 w-14 px-0 text-center text-xl font-bold"
                          value={r[key]}
                          onChange={(e) => {
                            const v = e.target.value.replace(/\D/g, '').slice(0, 2);
                            setRows((rs) => {
                              const copy = [...rs];
                              while (copy.length <= i) copy.push(emptyRow());
                              copy[i] = { ...copy[i], [key]: v };
                              return copy;
                            });
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
              {/* Tie-break */}
              <tr>
                <td className="text-xs text-slate-500">Puntos tie-break (opcional)</td>
                {Array.from({ length: visibleRows }, (_, i) => {
                  const r = rows[i] ?? emptyRow();
                  const isTb = f.tiebreakAt !== null && !isSuperTiebreakSet(f, i + 1) && Math.max(+r.g1, +r.g2) === f.tiebreakAt + 1 && Math.min(+r.g1, +r.g2) === f.tiebreakAt && r.g1 !== '' && r.g2 !== '';
                  return (
                    <td key={i} className="px-1 text-center">
                      {isTb && (
                        <div className="flex justify-center gap-1">
                          <input aria-label="TB 1" inputMode="numeric" className="input num h-8 w-10 px-0 text-center text-xs" value={r.t1} onChange={(e) => setRow(i, { t1: e.target.value.replace(/\D/g, '').slice(0, 2) })} />
                          <input aria-label="TB 2" inputMode="numeric" className="input num h-8 w-10 px-0 text-center text-xs" value={r.t2} onChange={(e) => setRow(i, { t2: e.target.value.replace(/\D/g, '').slice(0, 2) })} />
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
          <div className="mt-3 space-y-2">
            {Array.from({ length: visibleRows }, (_, i) =>
              isSuperTiebreakSet(f, i + 1) ? null : (
                <div key={i} className="flex flex-wrap items-center gap-1.5">
                  <span className="w-12 text-[11px] font-semibold text-slate-500">Set {i + 1}</span>
                  {quick.map(([a, b]) => (
                    <span key={`${a}-${b}`} className="flex gap-1">
                      <button className="btn-secondary btn-sm num px-2" onClick={() => setRows((rs) => withRow(rs, i, { g1: String(a), g2: String(b), t1: '', t2: '' }))}>
                        {a}-{b}
                      </button>
                      <button className="btn-secondary btn-sm num px-2 opacity-70" onClick={() => setRows((rs) => withRow(rs, i, { g1: String(b), g2: String(a), t1: '', t2: '' }))}>
                        {b}-{a}
                      </button>
                    </span>
                  ))}
                  <button className="btn-ghost btn-sm" onClick={() => setRows((rs) => withRow(rs, i, emptyRow()))}>
                    Borrar
                  </button>
                </div>
              ),
            )}
          </div>
        </div>
      )}

      <div className={cx('mt-5 rounded-xl border px-4 py-3 text-sm', preview?.ok ? 'border-accent/30 bg-accent/5' : 'border-white/10 bg-white/[0.02]')}>
        {preview?.ok ? (
          <div className="flex items-center gap-3">
            <Trophy className="h-5 w-5 text-accent" />
            <div>
              <div className="font-semibold text-white">Gana {index.pairName(preview.winner)}</div>
              <div className="num text-slate-300">{preview.text}</div>
            </div>
          </div>
        ) : (
          <span className="text-slate-400">{preview?.error}</span>
        )}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn-primary" disabled={!preview?.ok || saving} onClick={submit}>
          {saving ? 'Guardando…' : match.status === 'finished' ? 'Guardar corrección' : 'Confirmar resultado'}
        </button>
      </div>
    </Modal>
  );
}

function withRow(rs: Row[], i: number, row: Row): Row[] {
  const copy = [...rs];
  while (copy.length <= i) copy.push(emptyRow());
  copy[i] = row;
  return copy;
}
