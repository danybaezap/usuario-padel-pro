import { AnimatePresence, motion } from 'framer-motion';
import { Maximize, Pause, Play } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CourtCard, PairLabel } from '@/components/sport';
import { Podium, StandingsTable } from '@/components/standings';
import { BrandMark } from '@/components/Brand';
import { CategoryBadge, LiveDot, cx } from '@/components/ui';
import { publicBaseUrl } from '@/data';
import { CATEGORY_THEME } from '@/domain/defaults';
import { matchOnCourt } from '@/domain/scheduler';
import { categoryProgress, computeStandings } from '@/domain/standings';
import { matchScoreLabel } from '@/domain/stats';
import { useEstimates, upcomingOrdered } from '@/hooks/useEstimates';
import { useNow, useTournament } from '@/hooks/useTournament';
import { hhmm } from '@/lib/format';

type Slide = { key: string; kind: 'courts' | 'leaders' | 'category' | 'awards'; categoryId?: string };

/**
 * Modo TV / proyector: tipografía grande, alto contraste y rotación automática
 * entre canchas en juego y clasificaciones de A, B y C. Pensado para funcionar
 * durante horas sin intervención (reconexión automática y bloqueo de suspensión).
 */
export default function TvMode() {
  const { snapshot: s, index, connection } = useTournament();
  const [params] = useSearchParams();
  const now = useNow(1000);
  const est = useEstimates(s, now);
  const interval = Math.max(5, Number(params.get('intervalo')) || s.tournament.settings.display.tvIntervalSeconds) * 1000;
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const display = s.tournament.settings.display;

  const slides = useMemo<Slide[]>(() => {
    const list: Slide[] = [];
    const active = s.categories.filter((c) => s.pairs.some((p) => p.categoryId === c.id));
    const hasLive = s.matches.some((m) => m.status === 'in_progress' || m.status === 'scheduled');
    if (active.some((c) => c.status === 'finished')) list.push({ key: 'awards', kind: 'awards' });
    for (const c of active) {
      if (display.tvShowCourts && (hasLive || s.matches.some((m) => m.status === 'pending'))) list.push({ key: `courts-${c.id}`, kind: 'courts' });
      list.push({ key: `cat-${c.id}`, kind: 'category', categoryId: c.id });
    }
    if (display.tvShowLeaders && active.length > 1) list.push({ key: 'leaders', kind: 'leaders' });
    // Las canchas se intercalan entre cada categoría (canchas → A → canchas → B → …).
    return list.map((sl, k) => (sl.kind === 'courts' ? { ...sl, key: `courts-${k}` } : sl));
  }, [s, display.tvShowCourts, display.tvShowLeaders]);

  const go = useCallback((d: number) => {
    setI((x) => (x + d + slides.length) % Math.max(1, slides.length));
    setElapsed(0);
  }, [slides.length]);

  useEffect(() => {
    if (paused || slides.length <= 1) return;
    const t = window.setInterval(() => {
      setElapsed((e) => {
        if (e + 250 >= interval) {
          setI((x) => (x + 1) % slides.length);
          return 0;
        }
        return e + 250;
      });
    }, 250);
    return () => window.clearInterval(t);
  }, [paused, interval, slides.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === ' ') setPaused((p) => !p);
      if (e.key.toLowerCase() === 'f') void document.documentElement.requestFullscreen?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  // Mantener la pantalla encendida.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const req = async () => {
      try {
        lock = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null;
      } catch {
        /* no soportado */
      }
    };
    void req();
    const onVis = () => document.visibilityState === 'visible' && void req();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release();
    };
  }, []);

  const slide = slides[i % Math.max(1, slides.length)];
  const url = `${publicBaseUrl()}/t/${s.tournament.slug}`;
  const recent = s.matches.filter((m) => m.status === 'finished').sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? '')).slice(0, 8);
  const courts = s.courts.filter((c) => c.active).sort((a, b) => a.number - b.number);
  const upcoming = upcomingOrdered(s, est).filter((u) => u.match.status === 'pending').slice(0, 4);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-ink-950 text-white">
      {/* Cabecera */}
      <header className="flex items-center justify-between gap-6 border-b border-white/10 bg-gradient-to-r from-ink-850 to-ink-950 px-8 py-4">
        <div className="flex items-center gap-5">
          <BrandMark className="h-14" />
          <span className="h-12 w-px bg-white/20" />
          <div>
            <h1 className="display text-4xl leading-none xl:text-5xl">{s.tournament.name}</h1>
            {s.tournament.venue && <p className="text-lg text-slate-400">{s.tournament.venue}</p>}
          </div>
        </div>
        <div className="flex items-center gap-6">
          <span className={cx('flex items-center gap-2 text-xl font-semibold', connection === 'offline' ? 'text-rose-300' : 'text-lime-court')}>
            {connection === 'offline' ? 'Reconectando…' : (<><LiveDot /> EN VIVO</>)}
          </span>
          <span className="num text-5xl font-bold">{hhmm(now)}</span>
        </div>
      </header>

      {/* Contenido */}
      <main className="relative flex-1 overflow-hidden px-8 py-6">
        <AnimatePresence mode="wait">
          <motion.div key={slide?.key ?? 'none'} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.45 }} className="h-full">
            {!slide && <div className="flex h-full items-center justify-center text-4xl text-slate-500">El torneo comenzará pronto</div>}
            {slide?.kind === 'courts' && (
              <div className="flex h-full flex-col gap-6">
                <h2 className="display text-4xl text-slate-200">Canchas en juego</h2>
                <div className="grid flex-1 gap-6" style={{ gridTemplateColumns: `repeat(${Math.min(3, courts.length)}, minmax(0, 1fr))` }}>
                  {courts.slice(0, 6).map((c) => (
                    <CourtCard key={c.id} s={s} index={index} court={c} match={matchOnCourt(s, c.id)} now={now} big />
                  ))}
                </div>
                {upcoming.length > 0 && (
                  <div className="grid grid-cols-4 gap-4">
                    {upcoming.map(({ match, slot }) => {
                      const cat = s.categories.find((c) => c.id === match.categoryId)!;
                      return (
                        <div key={match.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4" style={{ borderTop: `4px solid ${CATEGORY_THEME[cat.code].hex}` }}>
                          <div className="mb-2 flex items-center justify-between text-lg text-slate-400">
                            <span className="flex items-center gap-2"><CategoryBadge code={cat.code} size="md" /> Próximo</span>
                            {slot && <span className="num">≈ {hhmm(slot.start)}</span>}
                          </div>
                          <div className="truncate text-xl font-semibold">{index.pairName(match.pair1Id)}</div>
                          <div className="truncate text-xl font-semibold text-slate-300">{index.pairName(match.pair2Id)}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {slide?.kind === 'category' && slide.categoryId && (() => {
              const cat = s.categories.find((c) => c.id === slide.categoryId)!;
              const theme = CATEGORY_THEME[cat.code];
              const pr = categoryProgress(s, cat.id);
              return (
                <div className="flex h-full gap-8">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="mb-4 flex items-center gap-4">
                      <CategoryBadge code={cat.code} size="lg" className="h-14 w-14 text-3xl" />
                      <h2 className="display text-6xl" style={{ color: theme.hex }}>{cat.name}</h2>
                      <span className="ml-auto text-2xl text-slate-400">{pr.finished}/{pr.total - pr.cancelled} partidos</span>
                    </div>
                    <div className="min-h-0 flex-1 overflow-hidden">
                      <StandingsTable s={s} index={index} category={cat} compact={false} tv />
                    </div>
                  </div>
                </div>
              );
            })()}
            {slide?.kind === 'leaders' && (
              <div className="flex h-full flex-col">
                <h2 className="display mb-6 text-5xl">Líderes</h2>
                <div className="grid flex-1 grid-cols-3 gap-8">
                  {s.categories.filter((c) => s.pairs.some((p) => p.categoryId === c.id)).map((c) => {
                    const theme = CATEGORY_THEME[c.code];
                    const st = computeStandings(s, c.id).slice(0, 3);
                    return (
                      <div key={c.id} className="card flex flex-col p-8" style={{ boxShadow: `inset 0 4px 0 ${theme.hex}` }}>
                        <div className="mb-6 flex items-center gap-3">
                          <CategoryBadge code={c.code} size="lg" />
                          <span className="display text-4xl">{c.name}</span>
                        </div>
                        <div className="space-y-6">
                          {st.map((r) => (
                            <div key={r.pairId} className="flex items-center gap-4">
                              <span className="display w-10 text-5xl" style={{ color: r.position === 1 ? theme.hex : '#94a3b8' }}>{r.position}</span>
                              <div className="min-w-0 flex-1">
                                <PairLabel index={index} pairId={r.pairId} size="lg" showNumber={false} />
                              </div>
                              <span className="num text-3xl font-bold">{r.won}<span className="text-lg text-slate-500">G</span></span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {slide?.kind === 'awards' && (
              <div className="flex h-full flex-col">
                <h2 className="display mb-6 text-center text-6xl text-amber-300">Campeones</h2>
                <div className="grid flex-1 grid-cols-3 gap-8">
                  {s.categories.filter((c) => c.status === 'finished' && c.podium.length).map((c) => (
                    <div key={c.id} className="card flex flex-col justify-end p-6">
                      <div className="mb-4 flex items-center justify-center gap-3">
                        <CategoryBadge code={c.code} size="lg" />
                        <span className="display text-4xl">{c.name}</span>
                      </div>
                      <Podium s={s} index={index} category={c} big />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Pie: últimos resultados + QR */}
      <footer className="flex items-stretch border-t border-white/10 bg-ink-900">
        <div className="flex shrink-0 items-center bg-lime-court px-5 text-xl font-bold uppercase text-ink-950 display">Resultados</div>
        <div className="relative flex-1 overflow-hidden">
          <div className="flex h-full animate-[ticker_60s_linear_infinite] items-center gap-10 whitespace-nowrap px-6 text-xl">
            {[...recent, ...recent].map((m, k) => {
              const cat = s.categories.find((c) => c.id === m.categoryId)!;
              return (
                <span key={`${m.id}-${k}`} className="flex items-center gap-3">
                  <CategoryBadge code={cat.code} size="md" />
                  <span className={m.winnerPairId === m.pair1Id ? 'font-bold' : 'text-slate-400'}>{index.pairName(m.pair1Id)}</span>
                  <span className="num text-lime-court">{matchScoreLabel(s, m)}</span>
                  <span className={m.winnerPairId === m.pair2Id ? 'font-bold' : 'text-slate-400'}>{index.pairName(m.pair2Id)}</span>
                </span>
              );
            })}
            {!recent.length && <span className="text-slate-500">Los resultados aparecerán aquí</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 border-l border-white/10 px-5 py-2">
          <div className="text-right text-sm leading-tight text-slate-400">
            Sigue el torneo
            <br />
            en tu móvil
          </div>
          <div className="rounded-md bg-white p-1">
            <QRCodeSVG value={url} size={72} />
          </div>
        </div>
      </footer>
      <div className="h-1 bg-white/5">
        <div className="h-full bg-lime-court transition-[width] duration-200 ease-linear" style={{ width: `${paused ? 0 : (elapsed / interval) * 100}%` }} />
      </div>

      {/* Controles discretos */}
      <div className="group fixed right-4 top-24 flex gap-2 opacity-0 transition hover:opacity-100 focus-within:opacity-100">
        <button className="btn-secondary btn-sm" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Reanudar' : 'Pausar'}>
          {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
        </button>
        <button className="btn-secondary btn-sm" onClick={() => void document.documentElement.requestFullscreen?.()} aria-label="Pantalla completa">
          <Maximize className="h-4 w-4" />
        </button>
        <Link to={`/t/${s.tournament.slug}`} className="btn-secondary btn-sm">
          Salir
        </Link>
      </div>
      <style>{`@keyframes ticker { from { transform: translateX(0) } to { transform: translateX(-50%) } }`}</style>
    </div>
  );
}
