/**
 * Prueba de integración contra PostgreSQL real con la migración de Supabase.
 * Se ejecuta solo si PADEL_TEST_DB está definida, p. ej.:
 *   PADEL_TEST_DB=postgres://postgres@localhost:5432/padel_test npm test
 * (ver supabase/test/README.md).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { createDemoTournament, simulateWave } from '@/domain/demo';
import { recordResult } from '@/domain/commands';
import { computeStandings } from '@/domain/standings';
import type { TournamentSnapshot } from '@/domain/types';
import { diffSnapshots, diffToDbPayload, rowToDb, snapshotFromDb } from '../diff';

const DB = process.env.PADEL_TEST_DB;

describe.skipIf(!DB)('Base de datos (Supabase/PostgreSQL)', () => {
  let client: pg.Client;
  const owner = randomUUID();
  const intruder = randomUUID();

  async function asUser<T>(uid: string, fn: () => Promise<T>): Promise<T> {
    await client.query('begin');
    try {
      await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
      const r = await fn();
      await client.query('commit');
      return r;
    } catch (e) {
      await client.query('rollback');
      throw e;
    }
  }

  async function load(slug: string): Promise<TournamentSnapshot> {
    const r = await client.query('select public.get_tournament_snapshot($1) as s', [slug]);
    return snapshotFromDb(r.rows[0].s);
  }

  async function save(prev: TournamentSnapshot, next: TournamentSnapshot, uid = owner): Promise<TournamentSnapshot> {
    const p = diffToDbPayload(diffSnapshots(prev, next));
    await asUser(uid, () =>
      client.query('select public.apply_changes($1, $2, $3, $4)', [
        prev.tournament.id,
        prev.tournament.revision,
        p.tournament ? JSON.stringify(p.tournament) : null,
        JSON.stringify(p.changes),
      ]),
    );
    return load(prev.tournament.slug);
  }

  beforeAll(async () => {
    client = new pg.Client({ connectionString: DB });
    await client.connect();
    await client.query('insert into auth.users(id) values ($1), ($2)', [owner, intruder]);
  });

  afterAll(async () => {
    await client?.end();
  });

  let snap: TournamentSnapshot;

  it('crea el torneo demo y lo lee completo', async () => {
    const local = createDemoTournament();
    const p = diffToDbPayload(diffSnapshots(null, local));
    await asUser(owner, () =>
      client.query('select public.create_tournament($1, $2)', [
        JSON.stringify(rowToDb({ ...local.tournament, localAdminHash: null })),
        JSON.stringify(p.changes),
      ]),
    );
    snap = await load(local.tournament.slug);
    expect(snap.tournament.revision).toBe(1);
    expect(snap.players.length).toBe(24);
    expect(snap.pairs.length).toBe(12);
    expect(snap.pairMembers.length).toBe(24);
    expect(snap.matches.length).toBe(local.matches.length);
    expect(snap.tournament.settings).toEqual(local.tournament.settings);
    expect(snap.categories.map((c) => c.status)).toEqual(['round_robin', 'round_robin', 'round_robin']);
  });

  it('juega el torneo completo guardando cada oleada de forma transaccional', async () => {
    let clock = new Date('2026-05-01T09:00:00Z');
    let guard = 0;
    while (snap.matches.some((m) => m.status !== 'finished') && guard++ < 100) {
      const { snapshot } = simulateWave(snap, clock, guard);
      const reloaded = await save(snap, snapshot);
      // El estado leído de la base de datos coincide con el calculado en el cliente.
      for (const c of reloaded.categories) {
        expect(computeStandings(reloaded, c.id)).toEqual(computeStandings(snapshot, c.id));
      }
      snap = reloaded;
      clock = new Date(clock.getTime() + 3600000);
    }
    expect(snap.matches.every((m) => m.status === 'finished')).toBe(true);
    expect(snap.matchSets.length).toBeGreaterThan(snap.matches.length * 2 - 1);
  });

  it('corregir un marcador no duplica victorias', async () => {
    const cat = snap.categories[0];
    const m = snap.matches.find((x) => x.categoryId === cat.id)!;
    const before = computeStandings(snap, cat.id);
    const loserIs1 = m.winnerPairId !== m.pair1Id;
    const corrected = recordResult(snap, m.id, {
      outcome: 'normal',
      sets: loserIs1 ? [{ games1: 6, games2: 0 }, { games1: 6, games2: 0 }] : [{ games1: 0, games2: 6 }, { games1: 0, games2: 6 }],
    });
    snap = await save(snap, corrected);
    const after = computeStandings(snap, cat.id);
    expect(after.reduce((a, r) => a + r.won, 0)).toBe(before.reduce((a, r) => a + r.won, 0));
    expect(snap.matchSets.filter((x) => x.matchId === m.id).length).toBe(2);
  });

  it('rechaza revisiones desactualizadas (concurrencia optimista)', async () => {
    const stale = { ...snap, tournament: { ...snap.tournament, revision: snap.tournament.revision - 1 } };
    const next = { ...stale, tournament: { ...stale.tournament, name: 'Otro nombre' } };
    await expect(save(stale, next)).rejects.toThrow(/revision_conflict/);
  });

  it('solo el organizador puede escribir', async () => {
    const next = { ...snap, tournament: { ...snap.tournament, name: 'Hackeado' } };
    await expect(save(snap, next, intruder)).rejects.toThrow(/not_authorized/);
    await expect(
      client.query('select public.apply_changes($1, $2, null, $3)', [snap.tournament.id, snap.tournament.revision, '{}']),
    ).rejects.toThrow(/not_authenticated/);
  });

  it('la base de datos impide dos partidos activos en la misma cancha', async () => {
    const [a, b] = snap.matches.filter((m) => m.categoryId !== snap.matches[0].categoryId).slice(0, 2);
    const court = snap.courts[0].id;
    const bad = structuredClone(snap);
    for (const m of bad.matches.filter((x) => x.id === a.id || x.id === b.id)) {
      Object.assign(m, { status: 'scheduled', courtId: court, winnerPairId: null, outcome: null });
    }
    bad.matchSets = bad.matchSets.filter((x) => x.matchId !== a.id && x.matchId !== b.id);
    await expect(save(snap, bad)).rejects.toThrow();
  });

  it('la base de datos impide partidos entre categorías distintas y jugadores repetidos', async () => {
    const bad = structuredClone(snap);
    const pa = bad.pairs.find((p) => p.categoryId === bad.categories[0].id)!;
    const pc = bad.pairs.find((p) => p.categoryId === bad.categories[2].id)!;
    bad.matches.push({ ...bad.matches[0], id: randomUUID(), pair1Id: pa.id, pair2Id: pc.id, status: 'pending', winnerPairId: null, outcome: null });
    await expect(save(snap, bad)).rejects.toThrow(/categoría/);

    const dup = structuredClone(snap);
    dup.players[1].normalizedName = dup.players[0].normalizedName;
    await expect(save(snap, dup)).rejects.toThrow(/players_name_unique/);
  });

  it('la vista de estadísticas derivadas coincide con la clasificación', async () => {
    const cat = snap.categories[1];
    const r = await client.query('select pair_id, won, played from public.v_pair_stats where category_id = $1', [cat.id]);
    const st = computeStandings(snap, cat.id);
    for (const row of r.rows) {
      const s = st.find((x) => x.pairId === row.pair_id)!;
      expect(Number(row.won)).toBe(s.won);
      expect(Number(row.played)).toBe(s.played);
    }
  });
});
