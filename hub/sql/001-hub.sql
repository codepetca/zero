CREATE TABLE IF NOT EXISTS hub_users (
  github_id text PRIMARY KEY CHECK (github_id ~ '^[1-9][0-9]{0,19}$'),
  login text NOT NULL CHECK (length(login) BETWEEN 1 AND 39),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS hub_library_number;
CREATE TABLE IF NOT EXISTS hub_libraries (
  id text PRIMARY KEY CHECK (id ~ '^ui[1-9a-z][0-9a-z]*$'),
  owner_id text NOT NULL REFERENCES hub_users(github_id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS hub_sessions (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES hub_users(github_id),
  csrf_token text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS hub_oauth_states (
  state_hash text PRIMARY KEY,
  binding_hash text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS hub_submissions (
  id uuid PRIMARY KEY,
  library_id text NOT NULL REFERENCES hub_libraries(id),
  owner_id text NOT NULL REFERENCES hub_users(github_id),
  version text NOT NULL,
  bundle jsonb NOT NULL,
  source_digest text NOT NULL CHECK (source_digest ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('queued','checking','checked','failed','published')),
  attempts integer NOT NULL DEFAULT 0,
  lease_token uuid,
  lease_until timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Failed attempts remain immutable history; only an active/published candidate
-- reserves a version. A corrected submission can reuse an unpublished version.
ALTER TABLE hub_submissions DROP CONSTRAINT IF EXISTS hub_submissions_library_id_version_key;
CREATE UNIQUE INDEX IF NOT EXISTS hub_active_library_version
  ON hub_submissions(library_id,version) WHERE status <> 'failed';
CREATE TABLE IF NOT EXISTS hub_results (
  submission_id uuid PRIMARY KEY REFERENCES hub_submissions(id),
  source_digest text NOT NULL,
  policy text NOT NULL,
  policy_digest text NOT NULL CHECK (policy_digest ~ '^[a-f0-9]{64}$'),
  passed boolean NOT NULL,
  report jsonb NOT NULL,
  jar bytea,
  sources bytea,
  pom bytea,
  artifact_hashes jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Earlier local results have no policy implementation digest. Leave it NULL so
-- publication rejects them; do not fabricate authority for an old verdict.
ALTER TABLE hub_results ADD COLUMN IF NOT EXISTS policy_digest text
  CHECK (policy_digest ~ '^[a-f0-9]{64}$');
CREATE TABLE IF NOT EXISTS hub_releases (
  library_id text NOT NULL REFERENCES hub_libraries(id),
  version text NOT NULL,
  submission_id uuid NOT NULL UNIQUE REFERENCES hub_submissions(id),
  manifest jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(library_id,version)
);
CREATE OR REPLACE FUNCTION hub_preserve_submission() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.library_id,NEW.owner_id,NEW.version,NEW.bundle,NEW.source_digest)
     IS DISTINCT FROM ROW(OLD.id,OLD.library_id,OLD.owner_id,OLD.version,OLD.bundle,OLD.source_digest) THEN
    RAISE EXCEPTION 'Submission source and ownership are immutable';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS hub_submission_immutable ON hub_submissions;
CREATE TRIGGER hub_submission_immutable BEFORE UPDATE ON hub_submissions
FOR EACH ROW EXECUTE FUNCTION hub_preserve_submission();
CREATE OR REPLACE FUNCTION hub_preserve_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Hub authority records are immutable'; END;
$$;
DROP TRIGGER IF EXISTS hub_result_immutable ON hub_results;
CREATE TRIGGER hub_result_immutable BEFORE UPDATE OR DELETE ON hub_results
FOR EACH ROW EXECUTE FUNCTION hub_preserve_record();
DROP TRIGGER IF EXISTS hub_release_immutable ON hub_releases;
CREATE TRIGGER hub_release_immutable BEFORE UPDATE OR DELETE ON hub_releases
FOR EACH ROW EXECUTE FUNCTION hub_preserve_record();
DROP TRIGGER IF EXISTS hub_library_immutable ON hub_libraries;
CREATE TRIGGER hub_library_immutable BEFORE UPDATE OR DELETE ON hub_libraries
FOR EACH ROW EXECUTE FUNCTION hub_preserve_record();
