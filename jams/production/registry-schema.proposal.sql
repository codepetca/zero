-- LOCAL / OPERATOR REVIEW ONLY. This is not an applied migration.
-- Intended only for the dedicated ZeroJams Neon production database after
-- provider-specific privilege review and explicit operator approval.
-- No login password, seed, provider settings or runtime activation is included.
-- An authorized provisioner must own/create roles, assign table ownership and
-- seed the singleton separately. Existing objects/roles intentionally cause an
-- error; this proposal must not silently adopt existing authority.
--
-- Hosted gates outside SQL: disable the Data API, keep this schema unexposed,
-- exclude it from GraphQL/Realtime, verify API roles have no inherited access,
-- require verified TLS and pin project/epoch in a separate production runtime.
-- No functions/routines are permitted in this schema by this proposal. Any
-- future routine requires separate security review and explicit per-routine
-- EXECUTE privilege audit/revocation (including PostgreSQL's default PUBLIC
-- EXECUTE). A per-schema default-privilege REVOKE cannot undo global defaults.
-- This trusted server role may replace the registry document; per-user/event
-- authorization remains in the service. RLS does not authenticate students.
-- Monotonic generation, exact-revision CAS, document semantics and operation
-- fences are APPLICATION invariants, not database-enforced permissions. A
-- compromised runtime role can reset generation or replace structurally valid
-- document contents, corrupting authority and causing revision ABA. Never share
-- this credential with clients; this proposal does not contain that compromise.
-- DDL restrictions below protect this schema/table and role authority. Shared
-- database privileges (e.g. PUBLIC TEMP) require a separate operator audit.
BEGIN;

CREATE ROLE zerojams_production_owner
  NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE zerojams_production_runtime
  LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

CREATE SCHEMA zerojams_production_private AUTHORIZATION zerojams_production_owner;
REVOKE ALL ON SCHEMA zerojams_production_private FROM PUBLIC;

CREATE TABLE zerojams_production_private.registry (
  singleton smallint PRIMARY KEY CHECK (singleton = 1),
  epoch text NOT NULL CHECK (epoch ~ '^[0-9a-f]{24}$'),
  generation bigint NOT NULL CHECK (generation >= 0),
  document jsonb NOT NULL CHECK (
    jsonb_typeof(document) = 'object'
    AND document ? 'events' AND document ? 'settlements'
    AND document - 'events' - 'settlements' = '{}'::jsonb
    AND jsonb_typeof(document->'events') = 'object'
    AND jsonb_typeof(document->'settlements') = 'object'
  )
);
ALTER TABLE zerojams_production_private.registry OWNER TO zerojams_production_owner;
REVOKE ALL ON TABLE zerojams_production_private.registry FROM PUBLIC;

-- service_role can bypass RLS, so schema/table privileges must deny it too.
-- The conditional block also allows testing without Supabase-managed roles.
DO $proposal$
DECLARE api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA zerojams_production_private FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON TABLE zerojams_production_private.registry FROM %I', api_role);
    END IF;
  END LOOP;
END
$proposal$;

ALTER TABLE zerojams_production_private.registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE zerojams_production_private.registry FORCE ROW LEVEL SECURITY;
CREATE POLICY registry_runtime_select ON zerojams_production_private.registry
  FOR SELECT TO zerojams_production_runtime USING (singleton = 1);
CREATE POLICY registry_runtime_update ON zerojams_production_private.registry
  FOR UPDATE TO zerojams_production_runtime
  USING (singleton = 1) WITH CHECK (singleton = 1);

GRANT USAGE ON SCHEMA zerojams_production_private TO zerojams_production_runtime;
GRANT SELECT ON TABLE zerojams_production_private.registry TO zerojams_production_runtime;
GRANT UPDATE (generation, document) ON zerojams_production_private.registry
  TO zerojams_production_runtime;

ALTER DEFAULT PRIVILEGES FOR ROLE zerojams_production_owner
  IN SCHEMA zerojams_production_private REVOKE ALL ON TABLES FROM PUBLIC;
COMMIT;
