import { Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CategoryBadge, Empty, SectionTitle } from '@/components/ui';
import { CATEGORY_THEME } from '@/domain/defaults';
import { computeStandings } from '@/domain/standings';
import { normalizeName } from '@/domain/util';
import { useTournament } from '@/hooks/useTournament';

/** "Busca tu pareja": acceso rápido desde el móvil a la ficha de cada pareja. */
export default function PairsView() {
  const { snapshot: s, index } = useTournament();
  const [q, setQ] = useState('');
  const nq = normalizeName(q);
  const positions = new Map<string, number>();
  for (const c of s.categories) for (const r of computeStandings(s, c.id)) positions.set(r.pairId, r.position);

  return (
    <div>
      <SectionTitle eyebrow="Jugadores">Busca tu pareja</SectionTitle>
      <div className="relative mb-6 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input className="input pl-9" placeholder="Escribe tu nombre…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        {s.categories.map((c) => {
          const pairs = s.pairs
            .filter((p) => p.categoryId === c.id)
            .filter((p) => !nq || normalizeName(index.pairName(p.id)).includes(nq))
            .sort((a, b) => (positions.get(a.id) ?? 99) - (positions.get(b.id) ?? 99));
          return (
            <div key={c.id}>
              <h3 className="mb-2 flex items-center gap-2 font-semibold text-white">
                <CategoryBadge code={c.code} /> {c.name} <span className="text-xs text-slate-500">({s.pairs.filter((p) => p.categoryId === c.id).length})</span>
              </h3>
              {!pairs.length ? (
                <Empty title="Sin resultados" />
              ) : (
                <div className="space-y-1.5">
                  {pairs.map((p) => {
                    const [a, b] = index.pairPlayers(p.id);
                    return (
                      <Link key={p.id} to={`/t/${s.tournament.slug}/pareja/${p.id}`} className="card card-hover flex items-center gap-3 px-3 py-2.5" style={{ borderLeft: `3px solid ${CATEGORY_THEME[c.code].hex}` }}>
                        <span className="display w-7 text-center text-xl text-slate-300">{positions.get(p.id) ?? '–'}</span>
                        <div className="min-w-0 flex-1 text-sm leading-tight">
                          <div className="truncate font-semibold text-white">{a}</div>
                          <div className="truncate font-semibold text-slate-300">{b}</div>
                        </div>
                        <span className="font-mono text-[10px] text-slate-500">#{p.number}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
