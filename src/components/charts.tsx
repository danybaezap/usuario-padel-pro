import { useEffect, useRef, useState } from 'react';

/**
 * Evolución de la posición de una pareja tras cada partido de su categoría.
 * Una sola serie (sin leyenda: el título la nombra), eje Y invertido (1º arriba),
 * línea de 2px, marcadores de 8px, rejilla recesiva y tooltip por punto.
 */
export function RankLine({ points, total, color = '#c6f432' }: { points: Array<{ step: number; position: number; label: string }>; total: number; color?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [points.length > 0]);
  if (points.length < 1) return <p className="text-sm text-slate-500">La evolución aparecerá tras el primer partido de la categoría.</p>;
  const H = Math.max(160, 28 * total + 40);
  const pad = { l: 34, r: 14, t: 14, b: 26 };
  const maxStep = Math.max(...points.map((p) => p.step), 2);
  const x = (st: number) => pad.l + ((st - 1) / Math.max(1, maxStep - 1)) * (W - pad.l - pad.r);
  const y = (pos: number) => pad.t + ((pos - 1) / Math.max(1, total - 1)) * (H - pad.t - pad.b);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.step).toFixed(1)},${y(p.position).toFixed(1)}`).join(' ');
  const hp = hover !== null ? points[hover] : null;
  return (
    <div className="relative" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" role="img" aria-label="Evolución de la posición en la clasificación">
        {Array.from({ length: total }, (_, i) => i + 1).map((pos) => (
          <g key={pos}>
            <line x1={pad.l} x2={W - pad.r} y1={y(pos)} y2={y(pos)} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
            <text x={pad.l - 10} y={y(pos) + 4} textAnchor="end" className="fill-slate-500" fontSize={11}>
              {pos}º
            </text>
          </g>
        ))}
        <text x={pad.l} y={H - 6} className="fill-slate-500" fontSize={10}>
          Partidos de la categoría →
        </text>
        <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onTouchStart={() => setHover(i)}>
            <circle cx={x(p.step)} cy={y(p.position)} r={14} fill="transparent" />
            <circle cx={x(p.step)} cy={y(p.position)} r={hover === i ? 6 : 4} fill={color} stroke="#0a0f1c" strokeWidth={2} />
          </g>
        ))}
      </svg>
      {hp && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-white/10 bg-ink-850 px-2.5 py-1.5 text-xs shadow-xl"
          style={{ left: `${(x(hp.step) / W) * 100}%`, top: `${(y(hp.position) / H) * 100}%`, marginTop: -10 }}
        >
          <div className="font-semibold text-white">{hp.position}º puesto</div>
          <div className="text-slate-400">{hp.label}</div>
        </div>
      )}
    </div>
  );
}

/** Rendimiento por partido: diferencia de juegos (positiva / negativa) con etiqueta. */
export function MatchDiffBars({ items }: { items: Array<{ label: string; diff: number; won: boolean }> }) {
  if (!items.length) return <p className="text-sm text-slate-500">Sin partidos disputados.</p>;
  const max = Math.max(4, ...items.map((i) => Math.abs(i.diff)));
  return (
    <div className="space-y-1.5" role="list">
      {items.map((it, i) => (
        <div key={i} role="listitem" className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_2.5rem] items-center gap-2 text-xs" title={`${it.label}: ${it.diff > 0 ? '+' : ''}${it.diff} juegos`}>
          <span className="truncate text-slate-400">{it.label}</span>
          <div className="relative h-4">
            <div className="absolute left-1/2 top-0 h-full w-px bg-white/15" />
            <div
              className="absolute top-0.5 h-3 rounded"
              style={{
                left: it.diff >= 0 ? '50%' : `${50 - (Math.abs(it.diff) / max) * 50}%`,
                width: `${(Math.abs(it.diff) / max) * 50}%`,
                background: it.diff >= 0 ? '#c6f432' : '#fb7185',
                minWidth: 2,
              }}
            />
          </div>
          <span className="num text-right font-semibold text-slate-200">
            {it.diff > 0 ? '+' : ''}
            {it.diff}
          </span>
        </div>
      ))}
    </div>
  );
}
