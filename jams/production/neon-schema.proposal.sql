-- REVIEW PROPOSAL ONLY: not a migration and not applied to production.
-- Tested as a transaction on the disposable Neon PostgreSQL 18 branch only.
-- Run only as the independently verified dedicated project's neondb_owner.
-- No password or seed is included. Provider administrator retains its automatic
-- ADMIN membership: it can issue another SET grant, and is a trusted operator.
BEGIN;
CREATE ROLE zerojams_production_owner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE zerojams_production_runtime LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT zerojams_production_owner TO neondb_owner WITH SET TRUE, INHERIT FALSE;
CREATE SCHEMA zerojams_production_private AUTHORIZATION zerojams_production_owner;
SET LOCAL ROLE zerojams_production_owner;
REVOKE ALL ON SCHEMA zerojams_production_private FROM PUBLIC;
CREATE TABLE zerojams_production_private.registry (
  singleton smallint PRIMARY KEY CHECK (singleton = 1),
  epoch text NOT NULL CHECK (epoch ~ '^[0-9a-f]{24}$'),
  generation bigint NOT NULL CHECK (generation >= 0),
  document jsonb NOT NULL CHECK (
    jsonb_typeof(document) = 'object' AND document ? 'events' AND document ? 'settlements'
    AND document - 'events' - 'settlements' = '{}'::jsonb
    AND jsonb_typeof(document->'events') = 'object'
    AND jsonb_typeof(document->'settlements') = 'object'
  )
);
REVOKE ALL ON TABLE zerojams_production_private.registry FROM PUBLIC;
ALTER TABLE zerojams_production_private.registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE zerojams_production_private.registry FORCE ROW LEVEL SECURITY;
CREATE POLICY registry_runtime_select ON zerojams_production_private.registry
  FOR SELECT TO zerojams_production_runtime USING (singleton = 1);
CREATE POLICY registry_runtime_update ON zerojams_production_private.registry
  FOR UPDATE TO zerojams_production_runtime USING (singleton = 1) WITH CHECK (singleton = 1);
GRANT USAGE ON SCHEMA zerojams_production_private TO zerojams_production_runtime;
GRANT SELECT ON TABLE zerojams_production_private.registry TO zerojams_production_runtime;
GRANT UPDATE (generation, document) ON zerojams_production_private.registry TO zerojams_production_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE zerojams_production_owner
  IN SCHEMA zerojams_production_private REVOKE ALL ON TABLES FROM PUBLIC;
RESET ROLE;
REVOKE zerojams_production_owner FROM neondb_owner GRANTED BY neondb_owner;
COMMIT;
