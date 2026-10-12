-- Run only through the separately authorized migration identity. Runtime logins
-- are assigned membership by the operator, never passwords or elevated Neon roles.
DO $$ BEGIN
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='hub_migration_owner') THEN CREATE ROLE hub_migration_owner NOLOGIN; END IF;
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='hub_api') THEN CREATE ROLE hub_api NOLOGIN; END IF;
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='hub_checker') THEN CREATE ROLE hub_checker NOLOGIN; END IF;
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='hub_publisher') THEN CREATE ROLE hub_publisher NOLOGIN; END IF;
END $$;
REVOKE ALL ON hub_users,hub_libraries,hub_sessions,hub_oauth_states,hub_submissions,hub_results,hub_releases,hub_objects FROM PUBLIC,hub_api,hub_checker,hub_publisher;
REVOKE ALL ON SEQUENCE hub_library_number FROM PUBLIC,hub_api,hub_checker,hub_publisher;
REVOKE ALL ON FUNCTION hub_preserve_record(),hub_preserve_submission() FROM PUBLIC,hub_api,hub_checker,hub_publisher;
GRANT SELECT ON hub_libraries,hub_submissions,hub_releases,hub_objects TO hub_api;
GRANT SELECT(github_id,login) ON hub_users TO hub_api;
GRANT INSERT(github_id,login),UPDATE(login,updated_at) ON hub_users TO hub_api;
GRANT SELECT,INSERT,DELETE ON hub_sessions,hub_oauth_states TO hub_api;
GRANT INSERT(id,owner_id) ON hub_libraries TO hub_api;
-- FOR UPDATE of reservations requires UPDATE privilege even though the immutable
-- trigger refuses every changed row; no API submission UPDATE privilege exists.
GRANT UPDATE(id) ON hub_libraries TO hub_api;
GRANT USAGE ON SEQUENCE hub_library_number TO hub_api;
GRANT INSERT(id,library_id,owner_id,version,bundle,source_digest,status) ON hub_submissions TO hub_api;
GRANT SELECT(submission_id,report) ON hub_results TO hub_api;
GRANT SELECT ON hub_submissions TO hub_checker;
GRANT UPDATE(status,attempts,lease_token,lease_until,error) ON hub_submissions TO hub_checker;
GRANT INSERT(submission_id,source_digest,policy,passed,report,jar,sources,pom,artifact_hashes,policy_digest) ON hub_results TO hub_checker;
GRANT SELECT ON hub_submissions,hub_libraries,hub_results,hub_releases,hub_objects TO hub_publisher;
GRANT UPDATE(status,error) ON hub_submissions TO hub_publisher;
GRANT INSERT(library_id,version,submission_id,manifest) ON hub_releases TO hub_publisher;
GRANT INSERT(digest,size,bytes) ON hub_objects TO hub_publisher;

-- Column grants alone cannot constrain values of shared status/error columns.
-- Membership checks also apply after RESET ROLE to a distinct runtime login.
CREATE OR REPLACE FUNCTION hub_runtime_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF pg_has_role(current_user,'hub_migration_owner','USAGE') THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' AND pg_has_role(current_user,'hub_api','USAGE') THEN
    IF NEW.status<>'queued' OR NEW.attempts<>0 OR NEW.lease_token IS NOT NULL OR NEW.lease_until IS NOT NULL OR NEW.error IS NOT NULL THEN
      RAISE EXCEPTION 'API may only queue new immutable submissions';
    END IF;
  ELSIF TG_OP='UPDATE' AND pg_has_role(current_user,'hub_checker','USAGE') THEN
    IF NOT ((OLD.status='queued' AND NEW.status='checking' AND NEW.attempts=OLD.attempts+1 AND NEW.attempts<=3 AND NEW.lease_token IS NOT NULL AND NEW.lease_until>now())
      OR (OLD.status='checking' AND NEW.status IN ('queued','checked','failed') AND NEW.attempts=OLD.attempts AND NEW.lease_token IS NULL AND NEW.lease_until IS NULL)) THEN
      RAISE EXCEPTION 'Checker transition outside its lease authority';
    END IF;
  ELSIF TG_OP='UPDATE' AND pg_has_role(current_user,'hub_publisher','USAGE') THEN
    IF OLD.status<>'checked' OR NEW.status NOT IN ('failed','published') THEN
      RAISE EXCEPTION 'Publisher may only finalize a checked submission';
    END IF;
  ELSIF pg_has_role(current_user,'hub_api','USAGE') OR pg_has_role(current_user,'hub_checker','USAGE') OR pg_has_role(current_user,'hub_publisher','USAGE') THEN
    RAISE EXCEPTION 'Runtime submission operation not permitted';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hub_submission_runtime ON hub_submissions;
CREATE TRIGGER hub_submission_runtime BEFORE INSERT OR UPDATE ON hub_submissions
FOR EACH ROW EXECUTE FUNCTION hub_runtime_transition();
REVOKE ALL ON FUNCTION hub_runtime_transition() FROM PUBLIC,hub_api,hub_checker,hub_publisher;
-- The migration login must first have membership in hub_migration_owner. The
-- operator grants that membership separately; the CLI never assigns logins.
ALTER TABLE hub_users OWNER TO hub_migration_owner;
ALTER TABLE hub_libraries OWNER TO hub_migration_owner;
ALTER TABLE hub_sessions OWNER TO hub_migration_owner;
ALTER TABLE hub_oauth_states OWNER TO hub_migration_owner;
ALTER TABLE hub_submissions OWNER TO hub_migration_owner;
ALTER TABLE hub_results OWNER TO hub_migration_owner;
ALTER TABLE hub_releases OWNER TO hub_migration_owner;
ALTER TABLE hub_objects OWNER TO hub_migration_owner;
ALTER SEQUENCE hub_library_number OWNER TO hub_migration_owner;
ALTER FUNCTION hub_preserve_record() OWNER TO hub_migration_owner;
ALTER FUNCTION hub_preserve_submission() OWNER TO hub_migration_owner;
ALTER FUNCTION hub_runtime_transition() OWNER TO hub_migration_owner;
