-- Permisos explícitos para la API de Supabase (por si el proyecto no expone
-- automáticamente las tablas nuevas). La escritura sigue siendo solo vía RPC.
grant usage on schema public to anon, authenticated;
grant select on
  public.tournaments, public.categories, public.players, public.pairs,
  public.pair_members, public.courts, public.matches, public.match_sets,
  public.v_pair_stats
to anon, authenticated;
grant delete on public.tournaments to authenticated;
