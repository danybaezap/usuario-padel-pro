import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { TournamentSnapshot } from '@/domain/types';
import { diffSnapshots, diffToDbPayload, rowFromDb, rowToDb, snapshotFromDb } from './diff';
import { AuthError, ConflictError, type AuthUser, type Repository, type TournamentSummary } from './repository';

function translateError(e: { message?: string; code?: string } | null): Error {
  const msg = e?.message ?? 'Error desconocido';
  if (msg.includes('revision_conflict')) return new ConflictError();
  if (msg.includes('not_authorized') || msg.includes('not_authenticated')) return new AuthError();
  if (e?.code === '23505') return new Error('Dato duplicado: ' + msg);
  if (msg.includes('Failed to fetch')) return new Error('Sin conexión con el servidor. Revisa tu red.');
  return new Error(msg);
}

/** Persistencia en Supabase (PostgreSQL + Auth + Realtime). */
export class SupabaseRepository implements Repository {
  readonly mode = 'supabase' as const;
  readonly client: SupabaseClient;

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
      realtime: { params: { eventsPerSecond: 10 } },
    });
  }

  async listTournaments(): Promise<TournamentSummary[]> {
    const user = await this.getUser();
    if (!user) return [];
    const { data, error } = await this.client
      .from('tournaments')
      .select('id, slug, name, venue, date, is_demo, status, updated_at')
      .eq('owner_id', user.id)
      .order('updated_at', { ascending: false });
    if (error) throw translateError(error);
    return (data ?? []).map((r) => rowFromDb<TournamentSummary>(r));
  }

  async load(slug: string) {
    const { data, error } = await this.client.rpc('get_tournament_snapshot', { p_slug: slug });
    if (error) throw translateError(error);
    return data ? snapshotFromDb(data as Record<string, unknown>) : null;
  }

  async create(s: TournamentSnapshot) {
    const payload = diffToDbPayload(diffSnapshots(null, s));
    const { error } = await this.client.rpc('create_tournament', {
      p_tournament: rowToDb({ ...s.tournament, localAdminHash: null }),
      p_changes: payload.changes,
    });
    if (error) throw translateError(error);
    const loaded = await this.load(s.tournament.slug);
    if (!loaded) throw new Error('El torneo no se pudo leer tras crearlo.');
    return loaded;
  }

  async save(prev: TournamentSnapshot, next: TournamentSnapshot) {
    const diff = diffSnapshots(prev, next);
    if (diff.empty) return prev;
    const payload = diffToDbPayload(diff);
    const { data, error } = await this.client.rpc('apply_changes', {
      p_tournament_id: prev.tournament.id,
      p_expected_revision: prev.tournament.revision,
      p_tournament: payload.tournament,
      p_changes: payload.changes,
    });
    if (error) throw translateError(error);
    return { ...next, tournament: { ...next.tournament, revision: data as number } };
  }

  async remove(id: string) {
    const { error } = await this.client.from('tournaments').delete().eq('id', id);
    if (error) throw translateError(error);
  }

  subscribe(t: { id: string }, onChange: () => void, onStatus?: (s: 'live' | 'offline') => void) {
    const channel = this.client
      .channel(`tournament:${t.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournaments', filter: `id=eq.${t.id}` }, () => onChange())
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          onStatus?.('live');
          onChange(); // ponerse al día tras (re)conectar
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') onStatus?.('offline');
      });
    // Red de seguridad para pantallas que pasan horas encendidas.
    const poll = window.setInterval(onChange, 30000);
    const onVisible = () => document.visibilityState === 'visible' && onChange();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onChange);
    return () => {
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onChange);
      void this.client.removeChannel(channel);
    };
  }

  async getUser(): Promise<AuthUser | null> {
    const { data } = await this.client.auth.getSession();
    const u = data.session?.user;
    return u ? { id: u.id, email: u.email ?? null } : null;
  }

  onAuthChange(cb: (u: AuthUser | null) => void) {
    const { data } = this.client.auth.onAuthStateChange((_e, session) => {
      const u = session?.user;
      cb(u ? { id: u.id, email: u.email ?? null } : null);
    });
    return () => data.subscription.unsubscribe();
  }

  async signIn(email: string, password: string) {
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : error.message);
  }

  async signUp(email: string, password: string) {
    const { error, data } = await this.client.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
    if (!data.session) throw new Error('Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.');
  }

  async signOut() {
    await this.client.auth.signOut();
  }
}
