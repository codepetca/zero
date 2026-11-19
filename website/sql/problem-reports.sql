-- Apply explicitly to the dedicated private reports database as its owner.
-- No student/session database, public REST exposure, or automatic migrations.
BEGIN;
CREATE TABLE IF NOT EXISTS zero_problem_destination (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  repository_id bigint NOT NULL CHECK (repository_id > 0),
  repository text NOT NULL
);
CREATE TABLE IF NOT EXISTS zero_problem_groups (
  fingerprint text PRIMARY KEY CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  issue_number bigint CHECK (issue_number > 0),
  create_reserved_at timestamptz,
  revision bigint NOT NULL DEFAULT 0,
  delivered_revision bigint NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS zero_problem_reports (
  report_id uuid PRIMARY KEY,
  receipt uuid NOT NULL UNIQUE,
  fingerprint text NOT NULL REFERENCES zero_problem_groups(fingerprint),
  payload jsonb NOT NULL,
  failed boolean NOT NULL DEFAULT false,
  recovered boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS zero_problem_reports_group ON zero_problem_reports(fingerprint);
-- Only aggregate fixed-window budgets. No IP address or user identifier.
CREATE TABLE IF NOT EXISTS zero_problem_budgets (
  bucket text PRIMARY KEY,
  count integer NOT NULL,
  expires_at timestamptz NOT NULL
);
REVOKE ALL ON zero_problem_destination, zero_problem_groups, zero_problem_reports, zero_problem_budgets FROM PUBLIC;
COMMIT;
