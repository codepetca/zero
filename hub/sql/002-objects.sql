-- Durable content-addressed artifacts. Ordinary runtime roles cannot replace bytes.
CREATE TABLE IF NOT EXISTS hub_objects (
  digest text PRIMARY KEY CHECK (digest ~ '^[a-f0-9]{64}$'),
  size integer NOT NULL CHECK (size BETWEEN 1 AND 16777216),
  bytes bytea NOT NULL CHECK (octet_length(bytes)=size),
  created_at timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS hub_object_immutable ON hub_objects;
CREATE TRIGGER hub_object_immutable BEFORE UPDATE OR DELETE ON hub_objects
FOR EACH ROW EXECUTE FUNCTION hub_preserve_record();
