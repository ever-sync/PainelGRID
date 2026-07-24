-- Defense in depth for a Prisma-only backend:
-- - every application table uses RLS;
-- - Supabase Data API roles have no access to the public schema;
-- - newly-created functions are not executable by PUBLIC by default.
DO $migration$
DECLARE
  target_table record;
BEGIN
  FOR target_table IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
      target_table.schemaname,
      target_table.tablename
    );
  END LOOP;
END
$migration$;

REVOKE USAGE ON SCHEMA "public" FROM PUBLIC, "anon", "authenticated";
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA "public" FROM "anon", "authenticated";
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA "public" FROM "anon", "authenticated";
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA "public" FROM PUBLIC, "anon", "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
