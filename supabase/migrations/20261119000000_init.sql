-- =====================================================================
-- Pádel Pro · Esquema inicial
-- Torneos con categorías A/B/C, parejas fijas, canchas compartidas,
-- partidos round robin, sets y fase final opcional.
--
-- Principios:
--  * Lectura pública (dashboards sin registro).
--  * Escritura SOLO mediante funciones RPC que verifican que el usuario
--    autenticado es el organizador (owner) del torneo.
--  * Cada guardado es UNA transacción (apply_changes) con control de
--    concurrencia optimista por "revision".
--  * Las estadísticas NO se almacenan acumuladas: se derivan del historial
--    oficial de partidos y sets (vista v_pair_stats), por lo que corregir
--    un marcador nunca duplica victorias.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------
create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,80}$'),
  name text not null check (char_length(name) between 3 and 120),
  venue text not null default '',
  date date not null default current_date,
  is_demo boolean not null default false,
  status text not null default 'registration' check (status in ('registration','in_progress','finished')),
  settings jsonb not null default '{}'::jsonb,
  local_admin_hash text,
  owner_id uuid not null references auth.users(id) on delete cascade,
  revision integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tournaments_owner_idx on public.tournaments(owner_id);

create table public.categories (
  id uuid primary key,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  code text not null check (code in ('A','B','C')),
  name text not null,
  status text not null default 'registration' check (status in ('registration','round_robin','playoffs','finished')),
  schedule_config jsonb,
  playoff_config jsonb,
  draw_order jsonb not null default '[]'::jsonb,
  podium jsonb not null default '[]'::jsonb,
  sort_index integer not null default 0,
  constraint categories_code_unique unique (tournament_id, code) deferrable initially deferred
);

create table public.players (
  id uuid primary key,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 60),
  normalized_name text not null,
  -- Un jugador no puede aparecer dos veces en el mismo torneo.
  constraint players_name_unique unique (tournament_id, normalized_name) deferrable initially deferred
);

create table public.pairs (
  id uuid primary key,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  number integer not null check (number > 0),
  created_at timestamptz not null default now(),
  constraint pairs_number_unique unique (tournament_id, number) deferrable initially deferred
);
create index pairs_category_idx on public.pairs(category_id);

create table public.pair_members (
  id uuid primary key,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  pair_id uuid not null references public.pairs(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  slot smallint not null check (slot in (1,2)),
  constraint pair_members_slot_unique unique (pair_id, slot) deferrable initially deferred,
  -- Ningún jugador en dos parejas activas del mismo torneo.
  constraint pair_members_player_unique unique (tournament_id, player_id) deferrable initially deferred
);

create table public.courts (
  id uuid primary key,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  number integer not null check (number between 1 and 50),
  name text not null,
  active boolean not null default true,
  constraint courts_number_unique unique (tournament_id, number) deferrable initially deferred
);

create table public.matches (
  id uuid primary key,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  phase text not null check (phase in ('round_robin','semifinal','final','third_place')),
  leg integer not null default 1,
  round integer not null default 1,
  order_index integer not null default 0,
  pair1_id uuid not null references public.pairs(id) on delete cascade,
  pair2_id uuid not null references public.pairs(id) on delete cascade,
  court_id uuid references public.courts(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending','scheduled','in_progress','finished','suspended','cancelled')),
  postponed_count integer not null default 0,
  scheduled_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  winner_pair_id uuid,
  outcome text check (outcome in ('normal','walkover','retired')),
  forfeit_pair_id uuid,
  notes text not null default '',
  constraint matches_distinct_pairs check (pair1_id <> pair2_id),
  constraint matches_winner_valid check (winner_pair_id is null or winner_pair_id in (pair1_id, pair2_id)),
  constraint matches_finished_has_winner check ((status = 'finished') = (winner_pair_id is not null)),
  constraint matches_active_has_court check (status not in ('scheduled','in_progress') or court_id is not null),
  -- Una cancha no puede tener dos partidos activos a la vez.
  constraint matches_court_exclusive exclude using btree (court_id with =)
    where (status in ('scheduled','in_progress')) deferrable initially deferred
);
create index matches_tournament_idx on public.matches(tournament_id);
create index matches_category_idx on public.matches(category_id);

create table public.match_sets (
  id uuid primary key,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  set_number smallint not null check (set_number between 1 and 5),
  games1 smallint not null check (games1 between 0 and 30),
  games2 smallint not null check (games2 between 0 and 30),
  tiebreak1 smallint check (tiebreak1 >= 0),
  tiebreak2 smallint check (tiebreak2 >= 0),
  is_super_tiebreak boolean not null default false,
  constraint match_sets_unique unique (match_id, set_number) deferrable initially deferred
);
create index match_sets_match_idx on public.match_sets(match_id);

-- ---------------------------------------------------------------------
-- Integridad deportiva
-- ---------------------------------------------------------------------

-- Los partidos solo enfrentan parejas de la misma categoría del partido.
create or replace function public.check_match_category() returns trigger
language plpgsql as $$
begin
  if (select category_id from public.pairs where id = new.pair1_id) is distinct from new.category_id
     or (select category_id from public.pairs where id = new.pair2_id) is distinct from new.category_id then
    raise exception 'Las parejas del partido deben pertenecer a la categoría del partido' using errcode = '23514';
  end if;
  return new;
end $$;

create constraint trigger matches_same_category
  after insert or update on public.matches
  deferrable initially deferred
  for each row execute function public.check_match_category();

-- Una pareja no puede estar en dos partidos activos a la vez.
create or replace function public.check_pair_availability() returns trigger
language plpgsql as $$
begin
  if new.status in ('scheduled','in_progress') and exists (
    select 1 from public.matches m
    where m.id <> new.id and m.tournament_id = new.tournament_id
      and m.status in ('scheduled','in_progress')
      and (m.pair1_id in (new.pair1_id, new.pair2_id) or m.pair2_id in (new.pair1_id, new.pair2_id))
  ) then
    raise exception 'Una pareja no puede jugar dos partidos simultáneamente' using errcode = '23P01';
  end if;
  return new;
end $$;

create constraint trigger matches_pair_availability
  after insert or update on public.matches
  deferrable initially deferred
  for each row execute function public.check_pair_availability();

-- Cada pareja tiene exactamente dos integrantes (comprobado al cerrar la transacción).
create or replace function public.check_pair_complete() returns trigger
language plpgsql as $$
declare v_pair uuid := coalesce(new.id, old.id);
begin
  if exists (select 1 from public.pairs where id = v_pair)
     and (select count(*) from public.pair_members where pair_id = v_pair) <> 2 then
    raise exception 'Cada pareja debe tener exactamente dos jugadores' using errcode = '23514';
  end if;
  return null;
end $$;

create constraint trigger pairs_complete
  after insert or update on public.pairs
  deferrable initially deferred
  for each row execute function public.check_pair_complete();

-- ---------------------------------------------------------------------
-- Seguridad (RLS): lectura pública, escritura solo por RPC
-- ---------------------------------------------------------------------
alter table public.tournaments enable row level security;
alter table public.categories enable row level security;
alter table public.players enable row level security;
alter table public.pairs enable row level security;
alter table public.pair_members enable row level security;
alter table public.courts enable row level security;
alter table public.matches enable row level security;
alter table public.match_sets enable row level security;

create policy "lectura pública" on public.tournaments for select using (true);
create policy "lectura pública" on public.categories for select using (true);
create policy "lectura pública" on public.players for select using (true);
create policy "lectura pública" on public.pairs for select using (true);
create policy "lectura pública" on public.pair_members for select using (true);
create policy "lectura pública" on public.courts for select using (true);
create policy "lectura pública" on public.matches for select using (true);
create policy "lectura pública" on public.match_sets for select using (true);
create policy "el organizador elimina su torneo" on public.tournaments for delete using (owner_id = auth.uid());


-- ---------------------------------------------------------------------
-- Vista de estadísticas derivadas (recalculables desde el historial)
-- Nota: la app aplica además las reglas de W.O./abandono del formato.
-- ---------------------------------------------------------------------
create or replace view public.v_pair_stats with (security_invoker = true) as
with fin as (
  select m.* from public.matches m where m.status = 'finished' and m.phase = 'round_robin'
),
sides as (
  select f.tournament_id, f.category_id, f.id as match_id, f.pair1_id as pair_id, (f.winner_pair_id = f.pair1_id) as won, 1 as side from fin f
  union all
  select f.tournament_id, f.category_id, f.id, f.pair2_id, (f.winner_pair_id = f.pair2_id), 2 from fin f
)
select s.tournament_id, s.category_id, s.pair_id,
  count(*) as played,
  count(*) filter (where s.won) as won,
  count(*) filter (where not s.won) as lost,
  coalesce(sum((select count(*) from public.match_sets x where x.match_id = s.match_id
     and ((s.side = 1 and x.games1 > x.games2) or (s.side = 2 and x.games2 > x.games1)))), 0) as sets_won,
  coalesce(sum((select sum(case when s.side = 1 then x.games1 else x.games2 end) from public.match_sets x where x.match_id = s.match_id)), 0) as games_won,
  coalesce(sum((select sum(case when s.side = 1 then x.games2 else x.games1 end) from public.match_sets x where x.match_id = s.match_id)), 0) as games_lost
from sides s
group by s.tournament_id, s.category_id, s.pair_id;

-- ---------------------------------------------------------------------
-- RPC: lectura del estado completo de un torneo
-- ---------------------------------------------------------------------
create or replace function public.get_tournament_snapshot(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tournament', to_jsonb(t) - 'local_admin_hash',
    'categories', coalesce((select jsonb_agg(to_jsonb(c) order by c.sort_index) from categories c where c.tournament_id = t.id), '[]'::jsonb),
    'players', coalesce((select jsonb_agg(to_jsonb(p)) from players p where p.tournament_id = t.id), '[]'::jsonb),
    'pairs', coalesce((select jsonb_agg(to_jsonb(p) order by p.number) from pairs p where p.tournament_id = t.id), '[]'::jsonb),
    'pair_members', coalesce((select jsonb_agg(to_jsonb(pm)) from pair_members pm where pm.tournament_id = t.id), '[]'::jsonb),
    'courts', coalesce((select jsonb_agg(to_jsonb(c) order by c.number) from courts c where c.tournament_id = t.id), '[]'::jsonb),
    'matches', coalesce((select jsonb_agg(to_jsonb(m) order by m.order_index) from matches m where m.tournament_id = t.id), '[]'::jsonb),
    'match_sets', coalesce((select jsonb_agg(to_jsonb(s)) from match_sets s where s.tournament_id = t.id), '[]'::jsonb)
  )
  from tournaments t where t.slug = p_slug;
$$;

-- ---------------------------------------------------------------------
-- RPC: aplicar cambios de forma transaccional
-- p_changes = { "<tabla>": { "upsert": [filas], "delete": [ids] }, ... }
-- ---------------------------------------------------------------------
create or replace function public.apply_changes(
  p_tournament_id uuid,
  p_expected_revision integer,
  p_tournament jsonb,
  p_changes jsonb
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_rev integer;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  update tournaments
     set revision = revision + 1, updated_at = now()
   where id = p_tournament_id and owner_id = auth.uid() and revision = p_expected_revision
  returning revision into v_rev;

  if v_rev is null then
    if not exists (select 1 from tournaments where id = p_tournament_id and owner_id = auth.uid()) then
      raise exception 'not_authorized' using errcode = '42501';
    end if;
    raise exception 'revision_conflict' using errcode = '40001';
  end if;

  if p_tournament is not null then
    update tournaments t
       set name = r.name, venue = r.venue, date = r.date, status = r.status, settings = r.settings
      from jsonb_populate_record(null::tournaments, p_tournament) r
     where t.id = p_tournament_id;
  end if;

  -- Borrados (de hijos a padres)
  delete from match_sets where tournament_id = p_tournament_id
    and id in (select jsonb_array_elements_text(coalesce(p_changes->'match_sets'->'delete', '[]'))::uuid);
  delete from matches where tournament_id = p_tournament_id
    and id in (select jsonb_array_elements_text(coalesce(p_changes->'matches'->'delete', '[]'))::uuid);
  delete from pair_members where tournament_id = p_tournament_id
    and id in (select jsonb_array_elements_text(coalesce(p_changes->'pair_members'->'delete', '[]'))::uuid);
  delete from pairs where tournament_id = p_tournament_id
    and id in (select jsonb_array_elements_text(coalesce(p_changes->'pairs'->'delete', '[]'))::uuid);
  delete from players where tournament_id = p_tournament_id
    and id in (select jsonb_array_elements_text(coalesce(p_changes->'players'->'delete', '[]'))::uuid);
  delete from courts where tournament_id = p_tournament_id
    and id in (select jsonb_array_elements_text(coalesce(p_changes->'courts'->'delete', '[]'))::uuid);
  delete from categories where tournament_id = p_tournament_id
    and id in (select jsonb_array_elements_text(coalesce(p_changes->'categories'->'delete', '[]'))::uuid);

  -- Altas y modificaciones (de padres a hijos)
  insert into categories
    select * from jsonb_populate_recordset(null::categories, p_changes->'categories'->'upsert') r
     where r.tournament_id = p_tournament_id
  on conflict (id) do update set
    code = excluded.code, name = excluded.name, status = excluded.status,
    schedule_config = excluded.schedule_config, playoff_config = excluded.playoff_config,
    draw_order = excluded.draw_order, podium = excluded.podium, sort_index = excluded.sort_index
  where categories.tournament_id = p_tournament_id;

  insert into courts
    select * from jsonb_populate_recordset(null::courts, p_changes->'courts'->'upsert') r
     where r.tournament_id = p_tournament_id
  on conflict (id) do update set number = excluded.number, name = excluded.name, active = excluded.active
  where courts.tournament_id = p_tournament_id;

  insert into players
    select * from jsonb_populate_recordset(null::players, p_changes->'players'->'upsert') r
     where r.tournament_id = p_tournament_id
  on conflict (id) do update set full_name = excluded.full_name, normalized_name = excluded.normalized_name
  where players.tournament_id = p_tournament_id;

  insert into pairs
    select * from jsonb_populate_recordset(null::pairs, p_changes->'pairs'->'upsert') r
     where r.tournament_id = p_tournament_id
  on conflict (id) do update set category_id = excluded.category_id, number = excluded.number
  where pairs.tournament_id = p_tournament_id;

  insert into pair_members
    select * from jsonb_populate_recordset(null::pair_members, p_changes->'pair_members'->'upsert') r
     where r.tournament_id = p_tournament_id
  on conflict (id) do update set pair_id = excluded.pair_id, player_id = excluded.player_id, slot = excluded.slot
  where pair_members.tournament_id = p_tournament_id;

  insert into matches
    select * from jsonb_populate_recordset(null::matches, p_changes->'matches'->'upsert') r
     where r.tournament_id = p_tournament_id
  on conflict (id) do update set
    category_id = excluded.category_id, phase = excluded.phase, leg = excluded.leg, round = excluded.round,
    order_index = excluded.order_index, pair1_id = excluded.pair1_id, pair2_id = excluded.pair2_id,
    court_id = excluded.court_id, status = excluded.status, postponed_count = excluded.postponed_count,
    scheduled_at = excluded.scheduled_at, started_at = excluded.started_at, finished_at = excluded.finished_at,
    winner_pair_id = excluded.winner_pair_id, outcome = excluded.outcome, forfeit_pair_id = excluded.forfeit_pair_id,
    notes = excluded.notes
  where matches.tournament_id = p_tournament_id;

  insert into match_sets
    select * from jsonb_populate_recordset(null::match_sets, p_changes->'match_sets'->'upsert') r
     where r.tournament_id = p_tournament_id
  on conflict (id) do update set
    set_number = excluded.set_number, games1 = excluded.games1, games2 = excluded.games2,
    tiebreak1 = excluded.tiebreak1, tiebreak2 = excluded.tiebreak2, is_super_tiebreak = excluded.is_super_tiebreak
  where match_sets.tournament_id = p_tournament_id;

  return v_rev;
end $$;

-- ---------------------------------------------------------------------
-- RPC: crear torneo (el usuario autenticado queda como organizador)
-- ---------------------------------------------------------------------
create or replace function public.create_tournament(p_tournament jsonb, p_changes jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  r tournaments;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  r := jsonb_populate_record(null::tournaments, p_tournament);
  insert into tournaments (id, slug, name, venue, date, is_demo, status, settings, owner_id, revision)
  values (r.id, r.slug, r.name, r.venue, r.date, r.is_demo, r.status, r.settings, auth.uid(), 0);
  return public.apply_changes(r.id, 0, null, p_changes);
end $$;

revoke all on function public.apply_changes(uuid, integer, jsonb, jsonb) from public;
revoke all on function public.create_tournament(jsonb, jsonb) from public;
grant execute on function public.apply_changes(uuid, integer, jsonb, jsonb) to authenticated;
grant execute on function public.create_tournament(jsonb, jsonb) to authenticated;
grant execute on function public.get_tournament_snapshot(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Tiempo real: cada guardado incrementa tournaments.revision
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.tournaments;
