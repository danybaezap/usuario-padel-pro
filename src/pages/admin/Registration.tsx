import { Download, FileUp, Lock, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useRef, useState } from 'react';
import { CategoryBadge, Empty, Modal, SectionTitle, cx, useConfirm } from '@/components/ui';
import { addPair, importPairs, removePair, updatePair, type ImportRow } from '@/domain/commands';
import { CATEGORY_THEME } from '@/domain/defaults';
import type { Pair } from '@/domain/types';
import { useToast } from '@/hooks/useToast';
import { useTournament } from '@/hooks/useTournament';
import { exportPairsCsv } from '@/lib/export';
import { TEMPLATE_CSV, parsePairsFile } from '@/lib/import';

export default function Registration() {
  const { snapshot: s, index, run } = useTournament();
  const toast = useToast();
  const { ask, dialog } = useConfirm();
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [catId, setCatId] = useState(s.categories[0].id);
  const [editing, setEditing] = useState<Pair | null>(null);
  const [importRows, setImportRows] = useState<ImportRow[] | null>(null);
  const first = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const totalPlayers = s.pairs.length * 2;
  const locked = (categoryId: string) => s.matches.some((m) => m.categoryId === categoryId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await run((x) => addPair(x, { categoryId: catId, player1: p1, player2: p2 }), 'Pareja agregada');
    if (ok) {
      setP1('');
      setP2('');
      first.current?.focus();
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const rows = await parsePairsFile(f);
      setImportRows(rows);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const doImport = async () => {
    if (!importRows) return;
    let report: ReturnType<typeof importPairs> | null = null;
    const ok = await run((x) => {
      report = importPairs(x, importRows);
      return report.snapshot;
    });
    const r = report as ReturnType<typeof importPairs> | null;
    if (ok && r) {
      if (r.errors.length) toast.error(`${r.added} parejas importadas. ${r.errors.length} filas con errores: ${r.errors.slice(0, 3).map((e) => `fila ${e.row}: ${e.message}`).join(' · ')}`);
      else toast.success(`${r.added} parejas importadas`);
      setImportRows(null);
    }
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla-parejas.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      {dialog}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <form onSubmit={submit} className="card p-5 sm:p-6">
          <SectionTitle eyebrow="Registro rápido">Agregar pareja</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="p1">
                Jugador 1
              </label>
              <input ref={first} id="p1" className="input" value={p1} onChange={(e) => setP1(e.target.value)} placeholder="Nombre y apellido" autoComplete="off" autoFocus />
            </div>
            <div>
              <label className="label" htmlFor="p2">
                Jugador 2
              </label>
              <input id="p2" className="input" value={p2} onChange={(e) => setP2(e.target.value)} placeholder="Nombre y apellido" autoComplete="off" />
            </div>
          </div>
          <div className="mt-4">
            <div className="label">Categoría</div>
            <div className="grid grid-cols-3 gap-2">
              {s.categories.map((c) => {
                const active = c.id === catId;
                const isLocked = locked(c.id);
                return (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => setCatId(c.id)}
                    className={cx('flex items-center justify-center gap-2 rounded-xl border px-3 py-3 font-semibold transition', active ? 'text-white' : 'border-white/10 text-slate-400 hover:bg-white/5')}
                    style={active ? { borderColor: CATEGORY_THEME[c.code].hex, background: `${CATEGORY_THEME[c.code].hex}1f` } : undefined}
                  >
                    <CategoryBadge code={c.code} size="md" /> {c.code}
                    {isLocked && <Lock className="h-3.5 w-3.5 opacity-60" />}
                  </button>
                );
              })}
            </div>
          </div>
          <button className="btn-primary mt-5 w-full sm:w-auto" disabled={locked(catId)}>
            <Plus className="h-4 w-4" /> Agregar pareja
          </button>
          {locked(catId) && <p className="mt-2 text-xs text-amber-300">Esta categoría ya tiene calendario: las inscripciones están cerradas para mantener las parejas fijas.</p>}
        </form>

        <div className="space-y-4">
          <div className="card p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300">
              <Users className="h-4 w-4" /> Inscritos
            </div>
            <div className="display text-5xl text-white">{totalPlayers}</div>
            <div className="text-xs text-slate-400">jugadores · {s.pairs.length} parejas</div>
            {(totalPlayers < 16 || totalPlayers > 32) && totalPlayers > 0 && (
              <p className="mt-2 text-[11px] text-slate-500">Formato previsto para 16–32 jugadores; el sistema admite más o menos sin cambios.</p>
            )}
            <div className="mt-4 grid grid-cols-3 gap-2">
              {s.categories.map((c) => (
                <div key={c.id} className="rounded-xl border border-white/[0.06] p-2 text-center" style={{ borderTop: `3px solid ${CATEGORY_THEME[c.code].hex}` }}>
                  <div className="display text-2xl text-white">{s.pairs.filter((p) => p.categoryId === c.id).length}</div>
                  <div className="text-[11px] text-slate-400">parejas {c.code}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="card space-y-2 p-5">
            <div className="text-sm font-semibold text-slate-300">Importar desde Excel o CSV</div>
            <p className="text-xs text-slate-400">Columnas: Jugador 1, Jugador 2, Categoría (A, B o C).</p>
            <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
                <FileUp className="h-4 w-4" /> Elegir archivo
              </button>
              <button className="btn-ghost btn-sm" onClick={downloadTemplate}>
                <Download className="h-4 w-4" /> Plantilla
              </button>
              {s.pairs.length > 0 && (
                <button className="btn-ghost btn-sm" onClick={() => exportPairsCsv(s)}>
                  <Download className="h-4 w-4" /> Exportar parejas
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {s.categories.map((c) => {
          const pairs = s.pairs.filter((p) => p.categoryId === c.id).sort((a, b) => a.number - b.number);
          return (
            <section key={c.id}>
              <h3 className="mb-2 flex items-center gap-2 font-semibold text-white">
                <CategoryBadge code={c.code} size="md" /> {c.name}
                <span className="text-sm font-normal text-slate-500">· {pairs.length} parejas</span>
                {locked(c.id) && <span className="chip ml-auto bg-white/5 text-slate-400"><Lock className="h-3 w-3" /> Fijas</span>}
              </h3>
              {!pairs.length ? (
                <Empty title="Sin parejas" />
              ) : (
                <div className="space-y-1.5">
                  {pairs.map((p) => {
                    const [a, b] = index.pairPlayers(p.id);
                    return (
                      <div key={p.id} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                        <span className="w-8 font-mono text-[11px] text-slate-500">#{p.number}</span>
                        <div className="min-w-0 flex-1 text-sm leading-tight">
                          <div className="truncate font-semibold text-white">{a}</div>
                          <div className="truncate text-slate-300">{b}</div>
                        </div>
                        <button className="btn-ghost btn-sm px-2" onClick={() => setEditing(p)} aria-label="Editar pareja">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          className="btn-ghost btn-sm px-2 disabled:opacity-20"
                          disabled={locked(c.id)}
                          aria-label="Eliminar pareja"
                          onClick={async () => {
                            if (await ask('Eliminar pareja', <>¿Eliminar a <b>{a} / {b}</b>?</>, { confirm: 'Eliminar', danger: true }))
                              await run((x) => removePair(x, p.id), 'Pareja eliminada');
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <EditPairModal pair={editing} onClose={() => setEditing(null)} />

      <Modal open={!!importRows} onClose={() => setImportRows(null)} title="Revisar importación" wide>
        {importRows && (
          <>
            <p className="mb-3 text-sm text-slate-400">{importRows.length} filas detectadas. Las filas con errores (jugadores repetidos, categoría inválida o pareja incompleta) se omitirán y se informarán.</p>
            <div className="max-h-[50vh] overflow-auto rounded-xl border border-white/10">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-ink-850">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400">
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Jugador 1</th>
                    <th className="px-3 py-2">Jugador 2</th>
                    <th className="px-3 py-2">Categoría</th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.map((r, i) => (
                    <tr key={i} className="border-t border-white/5">
                      <td className="px-3 py-1.5 text-slate-500">{i + 1}</td>
                      <td className="px-3 py-1.5">{r.player1}</td>
                      <td className="px-3 py-1.5">{r.player2}</td>
                      <td className="px-3 py-1.5">{r.category}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setImportRows(null)}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={doImport}>
                Importar {importRows.length} parejas
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

function EditPairModal({ pair, onClose }: { pair: Pair | null; onClose: () => void }) {
  const { snapshot: s, index, run } = useTournament();
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [cat, setCat] = useState('');
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (pair && loadedFor !== pair.id) {
    const [a, b] = index.pairPlayers(pair.id);
    setP1(a);
    setP2(b);
    setCat(pair.categoryId);
    setLoadedFor(pair.id);
  }
  const close = () => {
    setLoadedFor(null);
    onClose();
  };
  const locked = pair ? s.matches.some((m) => m.categoryId === pair.categoryId) : false;
  return (
    <Modal open={!!pair} onClose={close} title={`Editar pareja #${pair?.number ?? ''}`}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (pair && (await run((x) => updatePair(x, pair.id, { categoryId: cat, player1: p1, player2: p2 }), 'Pareja actualizada'))) close();
        }}
      >
        <div>
          <label className="label">Jugador 1</label>
          <input className="input" value={p1} onChange={(e) => setP1(e.target.value)} />
        </div>
        <div>
          <label className="label">Jugador 2</label>
          <input className="input" value={p2} onChange={(e) => setP2(e.target.value)} />
        </div>
        <div>
          <label className="label">Categoría</label>
          <select className="input" value={cat} onChange={(e) => setCat(e.target.value)} disabled={locked}>
            {s.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {locked && <p className="mt-1 text-xs text-slate-500">La categoría no se puede cambiar con el calendario generado (parejas fijas). Sí puedes corregir erratas en los nombres.</p>}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={close}>
            Cancelar
          </button>
          <button className="btn-primary">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

