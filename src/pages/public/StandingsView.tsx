import { useState } from 'react';
import { Podium, StandingsTable } from '@/components/standings';
import { CategoryBadge, SectionTitle, Tabs } from '@/components/ui';
import { CATEGORY_THEME } from '@/domain/defaults';
import { PHASE_LABEL } from '@/domain/types';
import { useTournament } from '@/hooks/useTournament';
import { MatchLine, useCategoryMap } from '@/components/sport';

export default function StandingsView() {
  const { snapshot: s, index } = useTournament();
  const cats = useCategoryMap(s);
  const [tab, setTab] = useState(s.categories.find((c) => s.pairs.some((p) => p.categoryId === c.id))?.id ?? s.categories[0].id);
  const cat = cats.get(tab)!;
  const playoffs = s.matches.filter((m) => m.categoryId === cat.id && m.phase !== 'round_robin').sort((a, b) => a.orderIndex - b.orderIndex);
  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="Round Robin"
        action={<Tabs value={tab} onChange={setTab} items={s.categories.map((c) => ({ value: c.id, label: <><CategoryBadge code={c.code} /> {c.name}</> }))} />}
      >
        <span style={{ color: CATEGORY_THEME[cat.code].hex }}>{cat.name}</span>
      </SectionTitle>
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="card p-4 sm:p-6">
          <StandingsTable s={s} index={index} category={cat} slug={s.tournament.slug} />
        </div>
        <div className="space-y-6">
          <div className="card p-5">
            <h3 className="display mb-4 text-lg text-slate-200">{cat.podium.length ? 'Podio oficial' : 'Top 3'}</h3>
            <Podium s={s} index={index} category={cat} slug={s.tournament.slug} />
          </div>
          {playoffs.length > 0 && (
            <div className="card p-5">
              <h3 className="display mb-3 text-lg text-slate-200">Fase final</h3>
              <div className="space-y-2">
                {playoffs.map((m) => (
                  <div key={m.id}>
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-amber-300">{PHASE_LABEL[m.phase]}</div>
                    <MatchLine s={s} index={index} match={m} slug={s.tournament.slug} categories={cats} showCategory={false} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
