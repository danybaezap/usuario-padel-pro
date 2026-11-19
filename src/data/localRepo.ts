import type { TournamentSnapshot } from '@/domain/types';
import { ConflictError, summaryOf, type AuthUser, type Repository, type TournamentSummary } from './repository';

const PREFIX = 'padelpro:v1:';
const INDEX_KEY = `${PREFIX}index`;
const CHANNEL = 'padelpro-sync';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

/**
 * Persistencia local (sin servidor). Útil para probar, para el modo demo y
 * para torneos en un único equipo. Sincroniza en tiempo real entre pestañas
 * y ventanas del mismo navegador (p. ej. panel admin + TV en un segundo monitor).
 */
export class LocalRepository implements Repository {
  readonly mode = 'local' as const;
  private channel: BroadcastChannel | null = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null;

  private index(): Record<string, TournamentSummary> {
    return read<Record<string, TournamentSummary>>(INDEX_KEY) ?? {};
  }

  private slugKey(slug: string) {
    return `${PREFIX}slug:${slug}`;
  }

  private dataKey(id: string) {
    return `${PREFIX}t:${id}`;
  }

  async listTournaments() {
    return Object.values(this.index()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async load(slug: string) {
    const id = read<string>(this.slugKey(slug));
    return id ? read<TournamentSnapshot>(this.dataKey(id)) : null;
  }

  private persist(s: TournamentSnapshot) {
    try {
      write(this.dataKey(s.tournament.id), s);
      write(this.slugKey(s.tournament.slug), s.tournament.id);
      const idx = this.index();
      idx[s.tournament.id] = summaryOf(s);
      write(INDEX_KEY, idx);
    } catch (e) {
      throw new Error('No se pudo guardar en este navegador (almacenamiento lleno o bloqueado).', { cause: e });
    }
    this.channel?.postMessage({ type: 'changed', id: s.tournament.id });
  }

  async create(s: TournamentSnapshot) {
    const saved = { ...s, tournament: { ...s.tournament, revision: 1 } };
    this.persist(saved);
    return saved;
  }

  async save(prev: TournamentSnapshot, next: TournamentSnapshot) {
    const current = read<TournamentSnapshot>(this.dataKey(prev.tournament.id));
    if (!current) throw new Error('El torneo ya no existe.');
    if (current.tournament.revision !== prev.tournament.revision) throw new ConflictError();
    const saved = { ...next, tournament: { ...next.tournament, revision: prev.tournament.revision + 1 } };
    this.persist(saved);
    return saved;
  }

  async remove(id: string) {
    const s = read<TournamentSnapshot>(this.dataKey(id));
    localStorage.removeItem(this.dataKey(id));
    if (s) localStorage.removeItem(this.slugKey(s.tournament.slug));
    const idx = this.index();
    delete idx[id];
    write(INDEX_KEY, idx);
    this.channel?.postMessage({ type: 'changed', id });
  }

  subscribe(t: { id: string }, onChange: () => void, onStatus?: (s: 'live' | 'offline') => void) {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.id === t.id) onChange();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === this.dataKey(t.id)) onChange();
    };
    this.channel?.addEventListener('message', onMsg);
    window.addEventListener('storage', onStorage);
    onStatus?.('live');
    return () => {
      this.channel?.removeEventListener('message', onMsg);
      window.removeEventListener('storage', onStorage);
    };
  }

  /* El modo local no tiene cuentas: el acceso admin se protege con un PIN por torneo. */
  async getUser(): Promise<AuthUser | null> {
    return { id: 'local', email: null };
  }
  onAuthChange() {
    return () => {};
  }
  async signIn() {}
  async signUp() {}
  async signOut() {}
}

/* ---------------- PIN local de administración ---------------- */

export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`padelpro:${pin}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const unlockKey = (id: string) => `padelpro:unlocked:${id}`;

export function isLocallyUnlocked(id: string): boolean {
  try {
    return sessionStorage.getItem(unlockKey(id)) === '1';
  } catch {
    return false;
  }
}

export function setLocallyUnlocked(id: string, value: boolean) {
  try {
    if (value) sessionStorage.setItem(unlockKey(id), '1');
    else sessionStorage.removeItem(unlockKey(id));
  } catch {
    /* almacenamiento no disponible */
  }
}
