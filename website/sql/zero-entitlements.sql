-- Apply explicitly as the database owner. Runtime requires schema USAGE,
-- SELECT/INSERT/UPDATE on grants and SELECT/INSERT on operations and audit.
BEGIN;
CREATE SCHEMA zero_entitlements;
REVOKE ALL ON SCHEMA zero_entitlements FROM PUBLIC;
CREATE TABLE zero_entitlements.grants (
  id uuid PRIMARY KEY,
  target_id text NOT NULL CHECK (target_id ~ '^[1-9][0-9]{0,19}$'),
  capability text NOT NULL CHECK (capability IN ('pro_listings','jam_hosting')),
  source text NOT NULL CHECK (source = 'manual'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX entitlement_target ON zero_entitlements.grants (target_id, created_at DESC);
CREATE TABLE zero_entitlements.operations (
  operation_id text PRIMARY KEY,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE zero_entitlements.audit (
  operation_id text PRIMARY KEY REFERENCES zero_entitlements.operations(operation_id),
  grant_id uuid NOT NULL REFERENCES zero_entitlements.grants(id),
  target_id text NOT NULL,
  actor_id text NOT NULL CHECK (actor_id ~ '^[1-9][0-9]{0,19}$'),
  action text NOT NULL CHECK (action IN ('grant','revoke')),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX entitlement_audit_target ON zero_entitlements.audit (target_id, created_at DESC);
COMMIT;
