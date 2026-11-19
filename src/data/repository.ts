import type { TournamentSnapshot, TournamentStatus } from '@/domain/types';

export interface TournamentSummary {
  id: string;
  slug: string;
  name: string;
  venue: string;
  date: string;
  isDemo: boolean;
  status: TournamentStatus;
  updatedAt: string;
}

export interface AuthUser {
  id: string;
  email: string | null;
}

export class ConflictError extends Error {
  constructor() {
    super('Otro dispositivo modificó el torneo. Se recargaron los datos.');
    this.name = 'ConflictError';
  }
}

export class AuthError extends Error {
  constructor(message = 'No tienes permisos de administración para este torneo.') {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Contrato de persistencia. Dos implementaciones:
 *  - SupabaseRepository: base de datos PostgreSQL + Auth + Realtime (producción).
 *  - LocalRepository: localStorage + BroadcastChannel (sin servidor, un solo equipo).
 */
export interface Repository {
  readonly mode: 'supabase' | 'local';
  listTournaments(): Promise<TournamentSummary[]>;
  load(slug: string): Promise<TournamentSnapshot | null>;
  create(snapshot: TournamentSnapshot): Promise<TournamentSnapshot>;
  /** Guarda `next` (derivado de `prev`) en una transacción. Lanza ConflictError si `prev` está desactualizado. */
  save(prev: TournamentSnapshot, next: TournamentSnapshot): Promise<TournamentSnapshot>;
  remove(id: string): Promise<void>;
  /** Notifica cuando el torneo cambia en otro cliente. Devuelve la función para cancelar. */
  subscribe(snapshot: { id: string; slug: string }, onChange: () => void, onStatus?: (s: 'live' | 'offline') => void): () => void;

  // Autenticación del organizador
  getUser(): Promise<AuthUser | null>;
  onAuthChange(cb: (u: AuthUser | null) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}

export function summaryOf(s: TournamentSnapshot): TournamentSummary {
  const t = s.tournament;
  return { id: t.id, slug: t.slug, name: t.name, venue: t.venue, date: t.date, isDemo: t.isDemo, status: t.status, updatedAt: t.updatedAt };
}
