# Pruebas de la base de datos

`supabase_stubs.sql` simula lo mínimo de Supabase (roles `anon`/`authenticated`,
`auth.users`, `auth.uid()` y la publicación `supabase_realtime`) para aplicar la
migración en un PostgreSQL local y ejecutar la prueba de integración.

```bash
createdb padel_test
psql -d padel_test -f supabase/test/supabase_stubs.sql
psql -d padel_test -f supabase/migrations/20261119000000_init.sql
PADEL_TEST_DB=postgres://postgres@localhost:5432/padel_test npm test
```

Sin `PADEL_TEST_DB` la prueba de integración se omite automáticamente.
