# Zero entitlements — local implementation

This implementation is not an activated payment system. It provides a central
record for manual GitHub-account grants: ten ordinary ZeroHub app listings and
ZeroJam hosting are independent capabilities. Free remains one ordinary listing.
Personal Pro pricing, purchases, Stripe, subscription processing, school licences
and purchase-history records remain future work; a manual grant is not a purchase.

## Administration

The local `/admin/entitlements` page is restricted server-side to the configured
owner's verified GitHub account (`armorup`, numeric ID 4050555) and a current
WorkOS-linked Zero session. Enter a verified immutable numeric GitHub ID, inspect
its central grants and audit trail, and grant or revoke an individual capability
with a reason and optional expiry. The page distinguishes active independent
legacy grants from central grants. Each mutation has a stable operation ID: after
an uncertain result, retry that same action rather than issuing a new one.
Admin access is not inferred from jam moderation, school affiliation or a
client-provided claim.

Records contain a subject ID, capability, source, timestamps and revocation;
manual mutations write an audit entry and operation receipt in the same database
transaction. The audit is an application history, not an independently immutable
security log: an operator with owner-equivalent database privileges can change it.
No payment card, GitHub token or Stripe secret belongs in these records.

## Storage and migration

`website/sql/zero-entitlements.sql` defines a separate schema. Applying it,
provisioning its runtime identity and setting `ZERO_ENTITLEMENTS_DATABASE_URL`
are separate production operations; this source does none of them. A dedicated
least-privilege runtime connection requires TLS and the table permissions noted
in the SQL header. The configured pool rejects query options in the connection
URL and verifies TLS against the system trust store. Use an explicit supported
connection URI and check actual provider pooling/TLS behavior before activation.
Do not put connection strings in Git, browser code, logs or support requests.

When unconfigured, current environment-based grants keep their prior behavior.
When configured, a valid central grant augments independently valid legacy
listing and jam grants. The existing production environment values may be
write-only and cannot be safely imported or replaced from memory. Do not remove
or overwrite them to enable central grants; first inventory each grant with its
owner and verify any proposed migration. Revoking a central grant does not revoke
an independent legacy grant. Manual legacy grants have no central audit record.

If central storage is unavailable, accounts with a valid legacy grant retain
that legacy capability. Other accounts cannot silently downgrade and have a
listing replaced: the affected listing operation returns unavailable. New jam
creation without a valid legacy grant also returns unavailable; accepted request
recovery and existing events continue. Listing and jam registry writes do not
share the entitlement store's transaction. A grant revoked after the final
entitlement check may still race an already-dispatched write; no instantaneous
cross-store revocation guarantee is made.

Expiry or revocation of the central listing grant does not automatically unlist
existing projects. If an account is already over its new allowance, existing
listed projects may still be updated; the lower limit applies to future listing
placement under the current replacement rules. This is not yet the planned
paid-Pro grace-period and downgrade flow.

## Activation and verification

Before any production rollout, separately authorize and review the database
installation and credentials. Verify backups, administrative identity, TLS,
pooling, privileges and recovery in an isolated environment, including retries,
concurrent grant/revoke and audit failure, before switching on the configured
URL. Confirm existing pilot grants continue, the owner sees the correct effective
access, admin writes are audited and non-admin requests fail, and that an outage
is recoverable. Verify actual browser and editor behavior and disclose any
remaining limitations. Rollback unsets the central URL only after confirming
which central grants would be affected; it is not a safe means to erase the
records or replace legacy configuration.
