import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { CATEGORY_THEME } from '@/domain/defaults';
import type { CategoryCode, MatchStatus } from '@/domain/types';
import { STATUS_LABEL } from '@/domain/types';

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return <Loader2 className={cx('animate-spin text-accent', className)} />;
}

export function FullScreenMessage({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="display text-3xl text-white">{title}</h1>
      {children}
    </div>
  );
}

export function CategoryBadge({ code, size = 'sm', className }: { code: CategoryCode; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const t = CATEGORY_THEME[code];
  const sz = size === 'lg' ? 'h-10 w-10 text-xl' : size === 'md' ? 'h-7 w-7 text-sm' : 'h-5 w-5 text-[11px]';
  return (
    <span
      className={cx('inline-flex shrink-0 items-center justify-center rounded-md font-display font-extrabold text-ink-950', sz, className)}
      style={{ backgroundColor: t.hex }}
      title={t.label}
    >
      {code}
    </span>
  );
}

const STATUS_STYLE: Record<MatchStatus, string> = {
  pending: 'bg-white/[0.06] text-slate-300',
  scheduled: 'bg-sky-500/15 text-sky-300',
  in_progress: 'bg-accent/15 text-accent',
  finished: 'bg-emerald-500/10 text-emerald-300',
  suspended: 'bg-amber-500/15 text-amber-300',
  cancelled: 'bg-rose-500/10 text-rose-300 line-through',
};

export function StatusBadge({ status, postponed }: { status: MatchStatus; postponed?: number }) {
  return (
    <span className={cx('chip', STATUS_STYLE[status])}>
      {status === 'in_progress' && <span className="h-1.5 w-1.5 animate-live rounded-full bg-accent" />}
      {STATUS_LABEL[status]}
      {status === 'pending' && postponed ? ` · pospuesto` : ''}
    </span>
  );
}

export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cx('relative inline-flex h-2.5 w-2.5', className)}>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className={cx(
              'card max-h-[92vh] w-full overflow-y-auto rounded-b-none border-white/10 bg-ink-900 p-5 sm:rounded-2xl sm:p-6',
              wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
            )}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 className="display text-xl text-white">{title}</h2>
              <button className="btn-ghost btn-sm -mr-2 -mt-1" onClick={onClose} aria-label="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Diálogo de confirmación reutilizable. */
export function useConfirm() {
  const [state, setState] = useState<{ title: string; body: ReactNode; confirm: string; danger?: boolean; resolve: (v: boolean) => void } | null>(null);
  const ask = (title: string, body: ReactNode, opts: { confirm?: string; danger?: boolean } = {}) =>
    new Promise<boolean>((resolve) => setState({ title, body, confirm: opts.confirm ?? 'Confirmar', danger: opts.danger, resolve }));
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  const dialog = (
    <Modal open={!!state} onClose={() => close(false)} title={state?.title ?? ''}>
      <div className="text-sm leading-relaxed text-slate-300">{state?.body}</div>
      <div className="mt-6 flex justify-end gap-2">
        <button className="btn-secondary" onClick={() => close(false)}>
          Cancelar
        </button>
        <button className={state?.danger ? 'btn-danger' : 'btn-primary'} onClick={() => close(true)} autoFocus>
          {state?.confirm}
        </button>
      </div>
    </Modal>
  );
  return { ask, dialog };
}

export function SectionTitle({ children, action, eyebrow }: { children: ReactNode; action?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent/80">{eyebrow}</div>}
        <h2 className="display text-2xl text-white sm:text-3xl">{children}</h2>
      </div>
      {action}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 px-6 py-10 text-center">
      {icon && <div className="text-slate-500">{icon}</div>}
      <div className="font-semibold text-slate-200">{title}</div>
      {children && <div className="max-w-md text-sm text-slate-400">{children}</div>}
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  items: Array<{ value: T; label: ReactNode }>;
  className?: string;
}) {
  return (
    <div role="tablist" className={cx('inline-flex gap-1 rounded-xl border border-white/[0.07] bg-ink-950/60 p-1', className)}>
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cx(
            'relative rounded-lg px-3 py-1.5 text-sm font-semibold transition',
            value === it.value ? 'text-ink-950' : 'text-slate-400 hover:text-white',
          )}
        >
          {value === it.value && (
            <motion.span layoutId={`tab-${items.map((i) => i.value).join()}`} className="absolute inset-0 rounded-lg bg-accent" transition={{ type: 'spring', damping: 30, stiffness: 400 }} />
          )}
          <span className="relative z-10 flex items-center gap-1.5">{it.label}</span>
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({ value, color = '#5cb8ff', className }: { value: number; color?: string; className?: string }) {
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]', className)}>
      <motion.div className="h-full rounded-full" style={{ backgroundColor: color }} initial={false} animate={{ width: `${Math.max(0, Math.min(100, value))}%` }} transition={{ duration: 0.6 }} />
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className="mt-1 font-display text-3xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

export function Medal({ position, size = 'md' }: { position: number; size?: 'sm' | 'md' | 'lg' }) {
  const colors: Record<number, string> = {
    1: 'from-yellow-200 via-amber-400 to-amber-600 text-amber-950',
    2: 'from-slate-100 via-slate-300 to-slate-500 text-slate-900',
    3: 'from-orange-200 via-orange-400 to-orange-700 text-orange-950',
  };
  const sz = size === 'lg' ? 'h-12 w-12 text-2xl' : size === 'sm' ? 'h-6 w-6 text-xs' : 'h-8 w-8 text-sm';
  if (!colors[position]) return <span className={cx('inline-flex items-center justify-center font-display font-bold text-slate-400', sz)}>{position}</span>;
  return (
    <span className={cx('inline-flex items-center justify-center rounded-full bg-gradient-to-br font-display font-extrabold shadow-lg ring-2 ring-white/20', colors[position], sz)}>
      {position}
    </span>
  );
}
