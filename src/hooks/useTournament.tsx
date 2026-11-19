import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ConflictError, repo } from '@/data';
import { isLocallyUnlocked } from '@/data/localRepo';
import { DomainError, type TournamentSnapshot } from '@/domain/types';
import { indexSnapshot, type SnapshotIndex } from '@/domain/util';
import { useAuth } from './useAuth';
import { useToast } from './useToast';

export type Command = (s: TournamentSnapshot) => TournamentSnapshot;

interface TournamentCtx {
  snapshot: TournamentSnapshot;
  index: SnapshotIndex;
  /** Ejecuta un comando de dominio y lo guarda de forma transaccional. Devuelve true si se guardó. */
  run: (cmd: Command, successMessage?: string) => Promise<boolean>;
  busy: boolean;
  connection: 'live' | 'offline' | 'connecting';
  canAdmin: boolean;
  reload: () => Promise<void>;
  lastUpdate: number;
}

const Ctx = createContext<TournamentCtx | null>(null);

export function useTournamentLoader(slug: string) {
  const [snapshot, setSnapshot] = useState<TournamentSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<'live' | 'offline' | 'connecting'>('connecting');
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  const ref = useRef<TournamentSnapshot | null>(null);

  const reload = useCallback(async () => {
    try {
      const s = await repo.load(slug);
      if (!s) {
        setError(null);
        setLoading(false);
        return;
      }
      if (!ref.current || ref.current.tournament.revision !== s.tournament.revision || ref.current.tournament.id !== s.tournament.id) {
        ref.current = s;
        setSnapshot(s);
        setLastUpdate(Date.now());
      }
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    ref.current = null;
    setLoading(true);
    void reload();
  }, [reload]);

  const id = snapshot?.tournament.id;
  useEffect(() => {
    if (!id) return;
    let timer: number | undefined;
    const off = repo.subscribe(
      { id, slug },
      () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => void reload(), 120);
      },
      setConnection,
    );
    return () => {
      window.clearTimeout(timer);
      off();
    };
  }, [id, slug, reload]);

  const commit = useCallback((s: TournamentSnapshot) => {
    ref.current = s;
    setSnapshot(s);
    setLastUpdate(Date.now());
  }, []);

  return { snapshot, error, loading, connection, reload, commit, ref, lastUpdate };
}

export function TournamentProvider({ slug, children, fallback }: { slug: string; children: ReactNode; fallback?: (state: { loading: boolean; error: string | null }) => ReactNode }) {
  const { snapshot, error, loading, connection, reload, commit, ref, lastUpdate } = useTournamentLoader(slug);
  const toast = useToast();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const canAdmin = useMemo(() => {
    if (!snapshot) return false;
    if (repo.mode === 'local') return !snapshot.tournament.localAdminHash || isLocallyUnlocked(snapshot.tournament.id);
    return !!user && user.id === snapshot.tournament.ownerId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot?.tournament.id, snapshot?.tournament.ownerId, snapshot?.tournament.localAdminHash, user, lastUpdate]);

  const run = useCallback(
    (cmd: Command, successMessage?: string) => {
      const task = queue.current.then(async () => {
        setBusy(true);
        try {
          for (let attempt = 0; attempt < 2; attempt++) {
            const prev = ref.current;
            if (!prev) return false;
            let next: TournamentSnapshot;
            try {
              next = cmd(prev);
            } catch (e) {
              if (e instanceof DomainError) {
                toast.error(e.message);
                return false;
              }
              throw e;
            }
            if (next === prev) return true;
            try {
              const saved = await repo.save(prev, next);
              commit(saved);
              if (successMessage) toast.success(successMessage);
              return true;
            } catch (e) {
              if (e instanceof ConflictError && attempt === 0) {
                // Otro dispositivo guardó antes: recargar y reintentar el comando sobre el estado actual.
                await reload();
                continue;
              }
              throw e;
            }
          }
          return false;
        } catch (e) {
          toast.error((e as Error).message || 'No se pudo guardar.');
          await reload();
          return false;
        } finally {
          setBusy(false);
        }
      });
      queue.current = task.catch(() => undefined);
      return task;
    },
    [commit, reload, ref, toast],
  );

  const index = useMemo(() => (snapshot ? indexSnapshot(snapshot) : null), [snapshot]);

  if (!snapshot || !index) return <>{fallback ? fallback({ loading, error }) : null}</>;
  return (
    <Ctx.Provider value={{ snapshot, index, run, busy, connection, canAdmin, reload, lastUpdate }}>{children}</Ctx.Provider>
  );
}

export function useTournament(): TournamentCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useTournament fuera de TournamentProvider');
  return c;
}

/** Fuerza un re-render periódico (relojes, "hace X min"). */
export function useNow(intervalMs = 30000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}
