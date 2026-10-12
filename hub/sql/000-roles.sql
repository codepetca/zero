-- Initial operator step only. Grant hub_migration_owner membership to the chosen
-- migration login separately, then run migrate.mjs. No login/passwords are created.
DO $$ BEGIN
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='hub_migration_owner') THEN CREATE ROLE hub_migration_owner NOLOGIN; END IF;
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='hub_api') THEN CREATE ROLE hub_api NOLOGIN; END IF;
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='hub_checker') THEN CREATE ROLE hub_checker NOLOGIN; END IF;
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='hub_publisher') THEN CREATE ROLE hub_publisher NOLOGIN; END IF;
  IF EXISTS(SELECT FROM pg_roles WHERE rolname IN ('hub_migration_owner','hub_api','hub_checker','hub_publisher') AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Existing hub role has unexpected elevated or login authority';
  END IF;
END $$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE,CREATE ON SCHEMA public TO hub_migration_owner;
GRANT USAGE ON SCHEMA public TO hub_api,hub_checker,hub_publisher;
