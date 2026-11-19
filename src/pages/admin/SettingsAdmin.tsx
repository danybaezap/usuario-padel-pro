import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SectionTitle } from '@/components/ui';
import { renameCourt, setCourtCount, updateSettings, updateTournamentInfo } from '@/domain/commands';
import { formatDescription } from '@/domain/format';
import { CRITERION_LABEL, type TiebreakCriterion, type TournamentSettings } from '@/domain/types';
import { useTournament } from '@/hooks/useTournament';

const ALL_CRITERIA = Object.keys(CRITERION_LABEL) as TiebreakCriterion[];

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

export default function SettingsAdmin() {
  const { snapshot: s, run } = useTournament();
  const [info, setInfo] = useState({ name: s.tournament.name, venue: s.tournament.venue, date: s.tournament.date });
  const [st, setSt] = useState<TournamentSettings>(s.tournament.settings);
  const [courtNames, setCourtNames] = useState<Record<string, string>>({});
  const hasResults = s.matches.some((m) => m.status === 'finished');

  useEffect(() => setSt(s.tournament.settings), [s.tournament.settings]);

  const f = st.format;
  const setF = (patch: Partial<typeof f>) => setSt({ ...st, format: { ...f, ...patch } });
  const activeCourts = s.courts.filter((c) => c.active).sort((a, b) => a.number - b.number);

  const moveCrit = (i: number, d: number) => {
    const list = [...st.tiebreakers];
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setSt({ ...st, tiebreakers: list });
  };

  return (
    <div className="space-y-8">
      <section className="card p-5 sm:p-6">
        <SectionTitle eyebrow="General">Datos del torneo</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Nombre">
            <input className="input" value={info.name} onChange={(e) => setInfo({ ...info, name: e.target.value })} />
          </Field>
          <Field label="Sede">
            <input className="input" value={info.venue} onChange={(e) => setInfo({ ...info, venue: e.target.value })} />
          </Field>
          <Field label="Fecha">
            <input type="date" className="input" value={info.date} onChange={(e) => setInfo({ ...info, date: e.target.value })} />
          </Field>
        </div>
        <button className="btn-primary mt-4" onClick={() => run((x) => updateTournamentInfo(x, info), 'Datos guardados')}>
          Guardar datos
        </button>
      </section>

      <section className="card p-5 sm:p-6">
        <SectionTitle eyebrow="Reglas">Formato de partido</SectionTitle>
        {hasResults && <p className="mb-4 rounded-lg bg-amber-400/10 px-3 py-2 text-xs text-amber-200">Ya hay resultados registrados: solo se puede modificar el punto de oro. El resto del formato queda bloqueado para no invalidar marcadores.</p>}
        <fieldset disabled={hasResults} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 disabled:opacity-60">
          <Field label="Sets">
            <select className="input" value={f.bestOf} onChange={(e) => setF({ bestOf: Number(e.target.value) as 1 | 3 | 5 })}>
              <option value={1}>1 set</option>
              <option value={3}>Al mejor de 3</option>
              <option value={5}>Al mejor de 5</option>
            </select>
          </Field>
          <Field label="Juegos para ganar un set">
            <input type="number" min={1} max={12} className="input" value={f.gamesPerSet} onChange={(e) => {
              const g = Number(e.target.value);
              setF({ gamesPerSet: g, tiebreakAt: f.tiebreakAt === null ? null : g === 9 ? 8 : g });
            }} />
          </Field>
          <Field label="Tie-break" hint="Con cuántos juegos iguales se juega">
            <select className="input" value={f.tiebreakAt ?? 'none'} onChange={(e) => setF({ tiebreakAt: e.target.value === 'none' ? null : Number(e.target.value) })}>
              <option value={f.gamesPerSet}>{`En ${f.gamesPerSet}-${f.gamesPerSet}`}</option>
              <option value={f.gamesPerSet - 1}>{`En ${f.gamesPerSet - 1}-${f.gamesPerSet - 1}`}</option>
              <option value="none">Sin tie-break (dif. de 2)</option>
            </select>
          </Field>
          <Field label="Puntos del tie-break">
            <input type="number" min={5} max={15} className="input" value={f.tiebreakPoints} onChange={(e) => setF({ tiebreakPoints: Number(e.target.value) })} />
          </Field>
          {f.bestOf > 1 && (
            <>
              <Field label="Set decisivo">
                <select className="input" value={f.decidingSet} onChange={(e) => setF({ decidingSet: e.target.value as typeof f.decidingSet })}>
                  <option value="full">Set completo</option>
                  <option value="super_tiebreak">Super tie-break</option>
                </select>
              </Field>
              {f.decidingSet === 'super_tiebreak' && (
                <>
                  <Field label="Puntos del super tie-break">
                    <input type="number" min={7} max={21} className="input" value={f.superTiebreakPoints} onChange={(e) => setF({ superTiebreakPoints: Number(e.target.value) })} />
                  </Field>
                  <Field label="El super tie-break cuenta como">
                    <select className="input" value={f.superTiebreakCountsAs} onChange={(e) => setF({ superTiebreakCountsAs: e.target.value as typeof f.superTiebreakCountsAs })}>
                      <option value="one_game">1 juego (1-0)</option>
                      <option value="set_only">Solo set (0 juegos)</option>
                    </select>
                  </Field>
                </>
              )}
            </>
          )}
        </fieldset>
        <label className="mt-4 flex items-center gap-2 text-sm text-slate-200">
          <input type="checkbox" checked={f.goldenPoint} onChange={(e) => setF({ goldenPoint: e.target.checked })} /> Punto de oro (sin ventajas)
        </label>
        <p className="mt-3 text-xs text-slate-400">{formatDescription(f)}</p>
      </section>

      <section className="card p-5 sm:p-6">
        <SectionTitle eyebrow="Clasificación">Criterios de desempate</SectionTitle>
        <p className="mb-3 text-sm text-slate-400">El criterio principal siempre es el número de partidos ganados. Después se aplican, en orden:</p>
        <ol className="max-w-lg space-y-1.5">
          {st.tiebreakers.map((c, i) => (
            <li key={c} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm">
              <span className="num w-5 text-slate-500">{i + 1}.</span>
              <span className="flex-1 text-white">{CRITERION_LABEL[c]}</span>
              <button className="btn-ghost btn-sm px-1.5" onClick={() => moveCrit(i, -1)} aria-label="Subir"><ArrowUp className="h-3.5 w-3.5" /></button>
              <button className="btn-ghost btn-sm px-1.5" onClick={() => moveCrit(i, 1)} aria-label="Bajar"><ArrowDown className="h-3.5 w-3.5" /></button>
              <button className="btn-ghost btn-sm px-1.5" disabled={st.tiebreakers.length <= 1} onClick={() => setSt({ ...st, tiebreakers: st.tiebreakers.filter((x) => x !== c) })} aria-label="Quitar"><X className="h-3.5 w-3.5" /></button>
            </li>
          ))}
          <li className="px-3 py-1 text-xs text-slate-500">Último recurso: sorteo realizado por la organización.</li>
        </ol>
        <div className="mt-2 flex flex-wrap gap-2">
          {ALL_CRITERIA.filter((c) => !st.tiebreakers.includes(c)).map((c) => (
            <button key={c} className="btn-secondary btn-sm" onClick={() => setSt({ ...st, tiebreakers: [...st.tiebreakers, c] })}>
              <Plus className="h-3 w-3" /> {CRITERION_LABEL[c]}
            </button>
          ))}
        </div>
      </section>

      <section className="card p-5 sm:p-6">
        <SectionTitle eyebrow="Programación">Descansos y tiempos</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Descanso mínimo entre partidos (min)" hint="Las parejas que no lo cumplen se proponen al final y con aviso.">
            <input type="number" min={0} className="input" value={st.scheduling.minRestMinutes} onChange={(e) => setSt({ ...st, scheduling: { ...st.scheduling, minRestMinutes: Number(e.target.value) } })} />
          </Field>
          <Field label="Duración estimada de partido (min)" hint="Para los horarios estimados del calendario.">
            <input type="number" min={10} className="input" value={st.scheduling.estimatedMatchMinutes} onChange={(e) => setSt({ ...st, scheduling: { ...st.scheduling, estimatedMatchMinutes: Number(e.target.value) } })} />
          </Field>
          <Field label="Cambio entre partidos (min)">
            <input type="number" min={0} className="input" value={st.scheduling.changeoverMinutes} onChange={(e) => setSt({ ...st, scheduling: { ...st.scheduling, changeoverMinutes: Number(e.target.value) } })} />
          </Field>
        </div>
      </section>

      <section className="card p-5 sm:p-6">
        <SectionTitle eyebrow="Pantallas">Modo TV / proyector</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Segundos por pantalla">
            <input type="number" min={5} className="input" value={st.display.tvIntervalSeconds} onChange={(e) => setSt({ ...st, display: { ...st.display, tvIntervalSeconds: Number(e.target.value) } })} />
          </Field>
          <label className="flex items-center gap-2 pt-6 text-sm text-slate-200">
            <input type="checkbox" checked={st.display.tvShowCourts} onChange={(e) => setSt({ ...st, display: { ...st.display, tvShowCourts: e.target.checked } })} /> Mostrar canchas en juego
          </label>
          <label className="flex items-center gap-2 pt-6 text-sm text-slate-200">
            <input type="checkbox" checked={st.display.tvShowLeaders} onChange={(e) => setSt({ ...st, display: { ...st.display, tvShowLeaders: e.target.checked } })} /> Mostrar vista de líderes
          </label>
        </div>
      </section>

      <div className="sticky bottom-4 z-20 flex justify-end">
        <button className="btn-primary shadow-2xl" onClick={() => run((x) => updateSettings(x, st), 'Configuración guardada · clasificaciones recalculadas')}>
          Guardar configuración
        </button>
      </div>

      <section className="card p-5 sm:p-6">
        <SectionTitle eyebrow="Instalaciones">Canchas</SectionTitle>
        <div className="mb-4 flex items-center gap-3">
          <span className="text-sm text-slate-300">Número de canchas:</span>
          <button className="btn-secondary btn-sm" onClick={() => run((x) => setCourtCount(x, activeCourts.length - 1), 'Canchas actualizadas')} disabled={activeCourts.length <= 1}>−</button>
          <span className="display w-8 text-center text-2xl text-white">{activeCourts.length}</span>
          <button className="btn-secondary btn-sm" onClick={() => run((x) => setCourtCount(x, activeCourts.length + 1), 'Canchas actualizadas')} disabled={activeCourts.length >= 12}>+</button>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {activeCourts.map((c) => (
            <div key={c.id} className="flex gap-2">
              <input className="input" value={courtNames[c.id] ?? c.name} onChange={(e) => setCourtNames({ ...courtNames, [c.id]: e.target.value })} />
              {courtNames[c.id] !== undefined && courtNames[c.id] !== c.name && (
                <button className="btn-primary btn-sm" onClick={() => run((x) => renameCourt(x, c.id, courtNames[c.id]), 'Cancha renombrada')}>OK</button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
