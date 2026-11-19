import { TABLES, type TableName, type Tournament, type TournamentSnapshot } from '@/domain/types';

export interface TableChanges {
  upsert: Array<Record<string, unknown>>;
  delete: string[];
}

export interface SnapshotDiff {
  tournament: Tournament | null;
  tables: Partial<Record<TableName, TableChanges>>;
  empty: boolean;
}

/** Calcula los cambios fila a fila entre dos estados del torneo. */
export function diffSnapshots(prev: TournamentSnapshot | null, next: TournamentSnapshot): SnapshotDiff {
  const tables: SnapshotDiff['tables'] = {};
  let empty = true;
  for (const t of TABLES) {
    const before = new Map<string, string>((prev?.[t] ?? []).map((r) => [r.id, JSON.stringify(r)]));
    const after = next[t] as Array<{ id: string }>;
    const upsert = after.filter((r) => before.get(r.id) !== JSON.stringify(r)) as unknown as Array<Record<string, unknown>>;
    const afterIds = new Set(after.map((r) => r.id));
    const del = [...before.keys()].filter((id) => !afterIds.has(id));
    if (upsert.length || del.length) {
      tables[t] = { upsert, delete: del };
      empty = false;
    }
  }
  const { revision: _r1, updatedAt: _u1, ...a } = prev?.tournament ?? ({} as Tournament);
  const { revision: _r2, updatedAt: _u2, ...b } = next.tournament;
  void _r1;
  void _r2;
  void _u1;
  void _u2;
  const tournamentChanged = !prev || JSON.stringify(a) !== JSON.stringify(b);
  if (tournamentChanged) empty = false;
  return { tournament: tournamentChanged ? next.tournament : null, tables, empty };
}

/* ---------------- Conversión camelCase <-> snake_case ---------------- */

const camelToSnake = (k: string) => k.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());
const snakeToCamel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

export function rowToDb(row: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [camelToSnake(k), v]));
}

export function rowFromDb<T>(row: Record<string, unknown>): T {
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => {
      const key = snakeToCamel(k);
      // Normalizar marcas de tiempo a ISO UTC para comparaciones consistentes.
      const val = key.endsWith('At') && typeof v === 'string' ? new Date(v).toISOString() : v;
      return [key, val];
    }),
  ) as T;
}

export const DB_TABLE: Record<TableName, string> = {
  categories: 'categories',
  players: 'players',
  pairs: 'pairs',
  pairMembers: 'pair_members',
  courts: 'courts',
  matches: 'matches',
  matchSets: 'match_sets',
};

export function diffToDbPayload(diff: SnapshotDiff) {
  const changes: Record<string, { upsert: Array<Record<string, unknown>>; delete: string[] }> = {};
  for (const [t, c] of Object.entries(diff.tables) as Array<[TableName, TableChanges]>) {
    changes[DB_TABLE[t]] = { upsert: c.upsert.map(rowToDb), delete: c.delete };
  }
  return { tournament: diff.tournament ? rowToDb(diff.tournament) : null, changes };
}

export function snapshotFromDb(raw: Record<string, unknown>): TournamentSnapshot {
  const t = rowFromDb<Tournament>(raw.tournament as Record<string, unknown>);
  const list = <T,>(key: string) => ((raw[key] as Array<Record<string, unknown>>) ?? []).map((r) => rowFromDb<T>(r));
  return {
    tournament: { ...t, localAdminHash: null, date: String(t.date).slice(0, 10) },
    categories: list('categories'),
    players: list('players'),
    pairs: list('pairs'),
    pairMembers: list('pair_members'),
    courts: list('courts'),
    matches: list('matches'),
    matchSets: list('match_sets'),
  };
}
