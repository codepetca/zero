-- Apply with the database owner. Grant the dedicated runtime role USAGE on
-- this schema and sequence, and SELECT, INSERT, UPDATE on the table.
BEGIN;
CREATE SCHEMA zero_hub_listings;
REVOKE ALL ON SCHEMA zero_hub_listings FROM PUBLIC;
CREATE SEQUENCE zero_hub_listings.position;
CREATE TABLE zero_hub_listings.projects (
  account_id text NOT NULL CHECK (account_id ~ '^[1-9][0-9]{0,19}$'),
  repository_id text NOT NULL CHECK (repository_id ~ '^[1-9][0-9]{0,19}$'),
  repository_url text NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  author text NOT NULL,
  pages_url text NOT NULL,
  source_commit text NOT NULL CHECK (source_commit ~ '^[0-9a-f]{40}$'),
  run_id bigint NOT NULL CHECK (run_id > 0),
  run_created_at timestamptz NOT NULL,
  queue_position bigint,
  listed_order bigint,
  protected boolean NOT NULL DEFAULT false,
  PRIMARY KEY (account_id, repository_id),
  CHECK ((queue_position IS NULL) = (listed_order IS NULL)),
  CHECK (NOT protected OR queue_position IS NOT NULL)
);
CREATE UNIQUE INDEX one_protected_project
  ON zero_hub_listings.projects (account_id) WHERE protected;
CREATE INDEX account_queue
  ON zero_hub_listings.projects (account_id, queue_position) WHERE queue_position IS NOT NULL;
CREATE INDEX unlisted_projects
  ON zero_hub_listings.projects (account_id, repository_id DESC) WHERE queue_position IS NULL;
CREATE UNIQUE INDEX discovery_order
  ON zero_hub_listings.projects (listed_order DESC) WHERE listed_order IS NOT NULL;
COMMIT;
