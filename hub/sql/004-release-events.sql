-- Operator-only, append-only availability history. Original manifests and bytes
-- remain immutable. No login, sequence or runtime write authority is introduced.
CREATE TABLE IF NOT EXISTS hub_release_events (
  library_id text NOT NULL,
  version text NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  action text NOT NULL CHECK (action IN ('withdrawn','restored')),
  reason text NOT NULL CHECK (octet_length(reason) BETWEEN 1 AND 8000),
  actor text NOT NULL DEFAULT session_user,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(library_id,version,revision),
  FOREIGN KEY(library_id,version) REFERENCES hub_releases(library_id,version)
);
DROP TRIGGER IF EXISTS hub_release_event_immutable ON hub_release_events;
CREATE TRIGGER hub_release_event_immutable BEFORE UPDATE OR DELETE ON hub_release_events
FOR EACH ROW EXECUTE FUNCTION hub_preserve_record();
REVOKE ALL ON hub_release_events FROM PUBLIC;
-- Local proofs can install the schema without the production role foundation.
DO $$ BEGIN
  IF EXISTS(SELECT FROM pg_roles WHERE rolname='hub_migration_owner') THEN
    REVOKE ALL ON hub_release_events FROM hub_api,hub_checker,hub_publisher;
    REVOKE ALL(library_id,version,revision,action,reason,actor,created_at) ON hub_release_events FROM PUBLIC,hub_api,hub_checker,hub_publisher;
    GRANT SELECT(library_id,version,revision,action) ON hub_release_events TO hub_api;
    ALTER TABLE hub_release_events OWNER TO hub_migration_owner;
  END IF;
END $$;
