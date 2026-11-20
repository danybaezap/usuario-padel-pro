import { motion } from 'framer-motion';
import { Crown, FileDown, Sparkles } from 'lucide-react';
import { BrandMark } from '@/components/Brand';
import { PairLabel } from '@/components/sport';
import { Podium } from '@/components/standings';
import { CategoryBadge, Empty, Stat } from '@/components/ui';
import { CATEGORY_THEME } from '@/domain/defaults';
import { categoryHighlights } from '@/domain/stats';
import { useTournament } from '@/hooks/useTournament';
import { exportPdf, exportStandingsCsv } from '@/lib/export';

/** Pantalla de premiación y resumen final (enlace público compartible). */
export default function AwardsView() {
  const { snapshot: s, index } = useTournament();
  const slug = s.tournament.slug;
  const finished = s.categories.filter((c) => c.status === 'finished' && c.podium.length);
  const totalMatches = s.matches.filter((m) => m.status === 'finished').length;
  const totalGames = s.matchSets.reduce((a, x) => a + (x.isSuperTiebreak ? 1 : x.games1 + x.games2), 0);

  if (!finished.length) return <Empty title="Aún no hay campeones declarados">La premiación se mostrará cuando la organización cierre cada categoría.</Empty>;

  return (
    <div className="space-y-10">
      <div className="relative overflow-hidden rounded-3xl border border-amber-300/20 bg-gradient-to-br from-amber-400/15 via-ink-900 to-ink-950 p-8 text-center">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[38rem] -translate-x-1/2 rounded-full bg-amber-300/20 blur-3xl" />
        <BrandMark variant="full" className="relative mx-auto mb-6 h-12 sm:h-16" />
        <Sparkles className="relative mx-auto h-8 w-8 text-amber-300" />
        <h2 className="display relative mt-2 text-4xl text-white sm:text-6xl">{s.tournament.status === 'finished' ? 'Premiación' : 'Campeones'}</h2>
        <p className="relative mt-2 text-slate-300">{s.tournament.name}</p>
        <div className="relative mx-auto mt-6 grid max-w-xl grid-cols-3 gap-3">
          <Stat label="Parejas" value={s.pairs.length} />
          <Stat label="Partidos" value={totalMatches} />
          <Stat label="Juegos" value={totalGames} />
        </div>
        <div className="relative mt-5 flex justify-center gap-2 print:hidden">
          <button className="btn-secondary btn-sm" onClick={() => void exportPdf(s)}>
            <FileDown className="h-4 w-4" /> Resumen PDF
          </button>
          <button className="btn-secondary btn-sm" onClick={() => exportStandingsCsv(s)}>
            <FileDown className="h-4 w-4" /> Clasificaciones CSV
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {s.categories.map((c, i) => {
          const theme = CATEGORY_THEME[c.code];
          if (!(c.status === 'finished' && c.podium.length))
            return (
              <div key={c.id} className="card flex items-center justify-center p-8 text-sm text-slate-500">
                <CategoryBadge code={c.code} className="mr-2" /> {c.name}: en juego
              </div>
            );
          return (
            <motion.div key={c.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.15 }} className="card relative overflow-hidden p-6">
              <div className={`pointer-events-none absolute inset-0 bg-gradient-to-b ${theme.gradient}`} />
              <div className="relative">
                <div className="mb-4 flex items-center justify-center gap-2">
                  <CategoryBadge code={c.code} size="md" />
                  <span className="display text-2xl text-white">{c.name}</span>
                </div>
                <div className="mb-6 text-center">
                  <Crown className="mx-auto h-8 w-8" style={{ color: theme.hex }} />
                  <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Pareja campeona</div>
                  <div className="mt-1 flex justify-center">
                    <PairLabel index={index} pairId={c.podium[0]} slug={slug} size="lg" showNumber={false} />
                  </div>
                </div>
                <Podium s={s} index={index} category={c} slug={slug} />
                <div className="mt-6 space-y-2 border-t border-white/10 pt-4">
                  {categoryHighlights(s, c.id).map((h) => (
                    <div key={h.label} className="flex items-start justify-between gap-3 text-sm">
                      <span className="text-slate-400">{h.label}</span>
                      <span className="text-right font-semibold text-white">
                        {h.value}
                        {h.pairId && <span className="block text-xs font-normal text-slate-400">{index.pairName(h.pairId)}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
