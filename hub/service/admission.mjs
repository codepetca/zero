// Fixed API admission policy. These limits cover retained submission JSON only,
// including failed/published history; results, artifacts, objects, database
// overhead, sessions and OAuth state need their own operating/storage budgets.
export const ADMISSION_LIMITS = Object.freeze({
  activePerAccount:2,
  activeGlobal:100,
  submissionsPer24Hours:20,
  reservationsPer24Hours:10,
  reservationsPerAccount:100,
  sourceBytesPerAccount:16 * 1024 * 1024,
  sourceBytesGlobal:256 * 1024 * 1024
});

function limited(message) { throw Object.assign(new Error(message),{status:429}); }

// Every reservation/submission transaction takes this lock FIRST. It is shared
// across processes and released by commit/rollback. A single global lock also
// serializes each account, avoiding account/global lock-order cycles. Runtime
// checker/publisher transitions preserve or reduce active occupancy; they never
// insert source. Direct administrator/SQL writes are outside API admission.
export async function lockAdmission(client) {
  await client.query('SELECT pg_advisory_xact_lock(92104420)');
}

export async function admitReservation(client,ownerId) {
  const {rows:[usage]}=await client.query(`SELECT count(*)::int AS total,
    count(*) FILTER (WHERE created_at >= statement_timestamp() - interval '24 hours')::int AS recent
    FROM hub_libraries WHERE owner_id=$1`,[ownerId]);
  if (usage.total >= ADMISSION_LIMITS.reservationsPerAccount)
    limited('You have reached the limit of 100 reserved libraries for this GitHub account.');
  if (usage.recent >= ADMISSION_LIMITS.reservationsPer24Hours)
    limited('You can prepare 10 new libraries in 24 hours. Please try again later.');
}

// Call only after ownership and the existing exact-source/version decision.
// Measure both stored and incoming bundles using PostgreSQL's JSONB text in
// UTF-8, including descriptor, file contents, preview and JSON syntax. This
// logical byte budget is independent of TOAST compression and the 1 MiB body.
export async function admitSubmission(client,ownerId,bundle) {
  const {rows:[usage]}=await client.query(`SELECT
    count(*) FILTER (WHERE status IN ('queued','checking','checked'))::int AS active_global,
    count(*) FILTER (WHERE owner_id=$1 AND status IN ('queued','checking','checked'))::int AS active_account,
    count(*) FILTER (WHERE owner_id=$1 AND created_at >= statement_timestamp() - interval '24 hours')::int AS recent,
    COALESCE(sum(octet_length(convert_to(bundle::text,'UTF8'))),0)::text AS bytes_global,
    COALESCE(sum(octet_length(convert_to(bundle::text,'UTF8'))) FILTER (WHERE owner_id=$1),0)::text AS bytes_account,
    octet_length(convert_to($2::jsonb::text,'UTF8')) AS bytes_candidate
    FROM hub_submissions`,[ownerId,bundle]);
  if (usage.active_account >= ADMISSION_LIMITS.activePerAccount)
    limited('You already have 2 submissions waiting for checks or publication. Please wait for them to finish.');
  if (usage.active_global >= ADMISSION_LIMITS.activeGlobal)
    limited('The hub has 100 submissions waiting for checks or publication. Please try again later.');
  if (usage.recent >= ADMISSION_LIMITS.submissionsPer24Hours)
    limited('You can upload 20 new submissions in 24 hours. Please try again later.');
  if (BigInt(usage.bytes_account) + BigInt(usage.bytes_candidate) > BigInt(ADMISSION_LIMITS.sourceBytesPerAccount))
    limited('Your retained submission source has reached the 16 MiB account limit. Please contact the hub operator.');
  if (BigInt(usage.bytes_global) + BigInt(usage.bytes_candidate) > BigInt(ADMISSION_LIMITS.sourceBytesGlobal))
    limited('The hub has reached its 256 MiB retained source limit. Please try again later.');
}
