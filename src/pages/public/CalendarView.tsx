import { useMemo, useState } from 'react';
import { MatchLine, useCategoryMap } from '@/components/sport';
import { CategoryBadge, Empty, SectionTitle, cx } from '@/components/ui';
import type { Match, MatchStatus } from '@/domain/types';
import { STATUS_LABEL } from '@/domain/types';
import { useEstimates } from '@/hooks/useEstimates';
import { useNow, useTournament } from '@/hooks/useTournament';
import { hhmm } from '@/lib/format';

type View = 'timeline' | 'rounds';

/** Calendario visual de partidos pendientes y disputados, filtrable por categoría, cancha y estado. */
export function CalendarBoard({ admin, onMatchClick }: { admin?: boolean; onMatchClick?: (m: Match) => void }) {
  const { snapshot: s, index } = useTournament();
  const now = useNow(60000);
  const est = useEstimates(s, now);
  const cats = useCategoryMap(s);
  const [catF, setCatF] = useState<string>('all');
  const [courtF, setCourtF] = useState<string>('all');
  const [statusF, setStatusF] = useState<'all' | 'open' | 'done'>('all');
  const [view, setView] = useState<View>('timeline');
  const slug = admin ? undefined : s.tournament.slug;

  const rows = useMemo(() => {
    return s.matches
      .filter((m) => catF === 'all' || m.categoryId === catF)
      .filter((m) => {
        if (courtF === 'all') return true;
        const c = m.courtId ?? est.get(m.id)?.courtId;
        return c === courtF;
      })
      .filter((m) => (statusF === 'all' ? true : statusF === 'done' ? m.status === 'finished' || m.status === 'cancelled' : !['finished', 'cancelled'].includes(m.status)))
      .map((m) => {
        const slot = est.get(m.id);
        const time = m.status === 'finished' ? m.startedAt ?? m.finishedAt : m.status === 'in_progress' ? m.startedAt : slot?.start.toISOString() ?? null;
        return { m, time, slot };
      })
      .sort((a, b) => {
        const order: Record<MatchStatus, number> = { finished: 0, in_progress: 1, scheduled: 2, pending: 3, suspended: 4, cancelled: 5 };
        if (view === 'rounds')
          return (cats.get(a.m.categoryId)!.sortIndex - cats.get(b.m.categoryId)!.sortIndex) || a.m.leg - b.m.leg || a.m.round - b.m.round || a.m.orderIndex - b.m.orderIndex;
        return order[a.m.status] - order[b.m.status] || (a.time ?? '9').localeCompare(b.time ?? '9');
      });
  }, [s.matches, est, catF, courtF, statusF, view, cats]);

  const groups = useMemo(() => {
    const g = new Map<string, typeof rows>();
    for (const r of rows) {
      let key: string;
      if (view === 'rounds') {
        const c = cats.get(r.m.categoryId)!;
        key = r.m.phase === 'round_robin' ? `${c.name} · Vuelta ${r.m.leg} · Jornada ${r.m.round}` : `${c.name} · Fase final`;
      } else {
        key = r.m.status === 'finished' ? 'Disputados' : r.m.status === 'in_progress' ? 'En juego' : r.m.status === 'scheduled' ? 'Llamados a cancha' : r.m.status === 'pending' ? 'Pendientes (horario estimado)' : STATUS_LABEL[r.m.status] + 's';
      }
      g.set(key, [...(g.get(key) ?? []), r]);
    }
    return [...g.entries()];
  }, [rows, view, cats]);

  const chip = (active: boolean) => cx('chip cursor-pointer border px-3 py-1 text-xs', active ? 'border-accent/50 bg-accent/15 text-accent' : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/10');

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <button className={chip(catF === 'all')} onClick={() => setCatF('all')}>
          Todas
        </button>
        {s.categories.map((c) => (
          <button key={c.id} className={chip(catF === c.id)} onClick={() => setCatF(c.id)}>
            <CategoryBadge code={c.code} /> {c.code}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-white/10" />
        <select className="input w-auto py-1.5 text-xs" value={courtF} onChange={(e) => setCourtF(e.target.value)} aria-label="Filtrar por cancha">
          <option value="all">Todas las canchas</option>
          {s.courts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className="input w-auto py-1.5 text-xs" value={statusF} onChange={(e) => setStatusF(e.target.value as typeof statusF)} aria-label="Filtrar por estado">
          <option value="all">Todos los estados</option>
          <option value="open">Por jugar</option>
          <option value="done">Disputados / cancelados</option>
        </select>
        <span className="mx-1 h-5 w-px bg-white/10" />
        <button className={chip(view === 'timeline')} onClick={() => setView('timeline')}>
          Cronológico
        </button>
        <button className={chip(view === 'rounds')} onClick={() => setView('rounds')}>
          Por jornadas
        </button>
      </div>
      {!rows.length ? (
        <Empty title="No hay partidos con estos filtros" />
      ) : (
        <div className="space-y-6">
          {groups.map(([title, list]) => (
            <div key={title}>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                {title} <span className="text-slate-600">· {list.length}</span>
              </h3>
              <div className="space-y-1.5">
                {list.map(({ m, time }) => (
                  <MatchLine
                    key={m.id}
                    s={s}
                    index={index}
                    match={m}
                    slug={slug}
                    categories={cats}
                    time={time}
                    onClick={onMatchClick ? () => onMatchClick(m) : undefined}
                    extra={m.status === 'pending' && est.get(m.id) ? <span className="text-[10px] text-slate-500">≈ {hhmm(est.get(m.id)!.start)} · {s.courts.find((c) => c.id === est.get(m.id)!.courtId)?.name}</span> : null}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CalendarView() {
  return (
    <div>
      <SectionTitle eyebrow="Partidos">Calendario</SectionTitle>
      <CalendarBoard />
    </div>
  );
}
