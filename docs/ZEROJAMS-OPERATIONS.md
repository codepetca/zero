# ZeroJams local verification and operator setup

The owner authorized deployment and a small real pilot on 2026-11-05. The local
release candidate requires a separate production pilot flag and hides the Hub
navigation link; direct pilot URLs are available only after configuration and
deployment. Jam writes also require `ZERO_JAMS_ENABLED=1`. The production Neon
schema, empty seed and restricted runtime credential were created; the exact
production runtime selector identity query passed. Vercel Zero production
environment settings were added. No Zero website deployment has occurred. A
temporary authenticated Vercel TCP probe is in progress; its result and live
pilot acceptance are unverified.

Production Hub visibility always requires the shared Neon authority, even when
pilot pages or writes are disabled. Missing or invalid database configuration
fails Hub visibility closed. Hosted preview visibility-dependent Hub and catalog
routes fail closed without production credentials; Jam routes remain hidden.
Unaffected pages need not access the authority. Local tests are not live acceptance.

## Manual Free and Pro licenses

Free personal use includes joining and submitting to a jam under its ordinary
rules. Pro is required to create a hosted jam, with up to 100 distinct registered
accounts. Contact `info@codepet.ca` to request access; licenses are enabled
manually. New Pro jams are automatically approved and each organizer may have
one active jam at a time. The slot lasts through gallery reveal (or legacy
submission close); suspended and historical pending events still occupy it,
while cancelled or rejected-without-accepted events release it. An accepted
event remains active if its later update is rejected. The creator can cancel their
own automatically approved jam with a public reason even after Pro access is
revoked; existing project holds remain until scheduled reveal. Maintainers retain
moderation authority; historical review records remain available. This is a
manual service entitlement, not an automated billing, checkout or subscription
integration. No owner account receives an automatic grant from its login or role.

An authorized operator supplies the server-only `ZERO_JAMS_PRO_GITHUB_IDS`
environment value as a comma-separated list of independently verified immutable
GitHub numeric account IDs. Do not use logins, email addresses, a client-side
`NEXT_PUBLIC_` variable, request fields or unverified user claims. Each ID must be
a canonical positive decimal string of at most 20 digits, without leading zeroes.
Whitespace around entries is allowed. The value is limited to 8,192 characters
and 256 entries; duplicates, empty entries, missing/empty configuration or any
malformed ID deny all new creation with the generic Pro-required response.
Never return the grant list to clients. No real account grants or provider
settings are configured by this source change.

Production hosted composition uses the real server process environment; local
and isolated test compositions use their trusted server environment. Sanitized
Neon/staging environment facades keep the value non-enumerable and server-only.
The trusted service constructor's synchronous `canCreateJam(accountId)` hook
defaults to deny; only literal `true` grants creation. HTTP derives the actor from
a current verified GitHub identity. Legacy creator-hosted intake remains closed.
Grant configuration is separate from registry/visibility authority: missing or
revoked Pro access must not disable existing events, participation or Hub holds.

Provider environment edits require a new deployment to reach running code.
Older instances retain their prior environment; redeployment is not proof that
all earlier writers retired or a dispatched COMMIT was fenced. New proposals
check the grant after accepted-result/settlement recovery in the write
transaction and again immediately before CAS. Revocation before those new-write
checks denies creation, but cannot cancel an already-dispatched transaction.
Retain operation IDs and reconcile uncertain outcomes. Accepted same-payload
requests still recover, and applied/not-applied settlement remains available
after revocation. Existing proposals remain readable/reviewable; no participants,
entries, histories or discovery holds are deleted. These semantics do not assert
an immediate fleet-wide revocation guarantee or verify ongoing payment.

## Local work

The local source introduces automatic approval for new Zero-hosted Pro jams.
The creator supplies public details and a gallery reveal time on Zero; one active
jam is permitted per organizer. Maintainers can moderate events, and historical
review records remain available. The old creator-hosted template code
is retained, but new creator-hosted proposal submissions are blocked. Existing
records remain readable. The release candidate shares a transactional Neon authority
between Jam and Hub; the separate experimental queue is not deployed or wired.
Provider acceptance and the coordinated cutover require verification. A delayed gallery is not a
privacy guarantee for independently public repositories or Pages sites.
Participants join with a public repository, then submit a Pages URL whose
repository association is observed before the submission deadline. Verification
uses GitHub metadata, not the site contents or a frozen commit. Deadline eligibility requires Pages verification and the last service admission
check before the cutoff on Zero’s clock. A delayed Git ref update may complete
after the cutoff; report success only after durable confirmation and recover an
unknown response with the same operation ID. This is not provider-commit-time
deadline enforcement.
Anonymous Pages metadata returned 404 for a known live public project; it is not
a reliable verification path. The one-App Pages flow and real provider capacity
still require acceptance.


The retained creator website template lives in `jam-template/`. It is historical
code for the temporarily unavailable creator-hosted creation path; its presence
is not an instruction to create or submit a new creator-hosted event.

Use Node22 and the repository's pinned dependencies:

```sh
npm ci
npm ci --prefix website
node --test jams/test/*.test.mjs website/tests/jams-*.test.mjs website/tests/jam-*.test.mjs
npm run typecheck --prefix website
npm test --prefix website
npm run build --prefix website
npm run check
```

Website development uses `npm run dev --prefix website -- --port 3025` for an
isolated preview. With no configuration, ZeroJams shows truthful unavailability;
the proposal form remains accessible. Creator-site downloads and previews are closed. Tests inject disposable
stores and intercepted GitHub responses. No production GitHub writes or accounts
are required. The creator site is a static site and can be served independently
to verify its relative paths and editable source copy.

## Configuration boundary

### Launch acceptance gates

Review the exact source and configuration to be released. On 2026-11-05 the
owner explicitly requested the expansion to 100 participants per jam after being
informed that the 100-person hosted flow is untested. This authorizes the limit
change; it is not a provider-capacity acceptance result. The earlier waiver of
the hosted 30-person acceptance gate applied to the prior 30-account expansion
and remains historical. No 100-person Neon/Pages load test has been run. Local
tests do not establish hosted throughput, classroom capacity or live provider
behavior.

1. **Pages identity and access:** finish and independently review a separate,
   Pages-read capability and participant installation flow using the existing
   Codepet Zero App. Verify
   selected-repository consent, account/repository identity, revocation, real
   workflow and legacy Pages responses, custom domains, rate limits, and fresh
   checks both on submission and at reveal. Record exactly what the provider
   proves; a previous successful deployment does not establish the artifact
   currently served at its URL. Failure remains closed. App registration,
   permissions, installations and credential changes require authorization.
   The local preview reader performs five requests for a built site and up to 16
   for workflow evidence per observation, before other service operations;
   per-instance concurrency limits do not prove fleet-wide quota or capacity.
   Repository and deployment-list reads use the restricted installation token;
   do not fall back to the much smaller anonymous quota. A real workflow-site
   check on Drawing Pad used seven authenticated requests; this does not prove
   class-scale throughput or provider secondary-limit behavior.
2. **Registry compatibility:** obtain an authorized, pinned complete snapshot;
   run the offline legacy audit on that snapshot. A `clear` audit only rules out
   its specific missing-binding block at that time. Review a safe recovery for
   every blocked record and separately authorize any live migration or repair.
3. **Writer cutover:** verify the migration and settlement protocol, retire or
   fence all legacy writers and in-flight requests, verify the target branch and
   rollback/suspension procedure, and confirm all active writers use the same
   branch-wide transaction. Do not assume a source deployment retires old instances.
4. **Capacity and reliability:** the prior 30-person acceptance gate was waived
   for the 30-account expansion on 2026-11-05. The later 100-account expansion
   was explicitly requested after disclosure that its hosted flow is untested;
   it does not establish a passing result. The historical untested target is
   30 participants starting together, separately
   for join and submission, with 95% durably confirmed within five minutes and all within ten minutes,
   without lost, duplicate or falsely confirmed actions; also exercise the full
   gallery reveal. Use actual provider and deployment constraints. Record
   contention, request quotas, deadlines, unknown responses and recovery. A
   failure requires an implementation change or a smaller explicitly reviewed
   pilot, not a claim that the target passed. The unexposed queue prototype is
   not accepted evidence of safe coordination. A local 30-entry workflow-gallery
   simulation exceeded the 18-second response budget; the new bounded pagination
   remains subject to end-to-end review and real-provider acceptance. A 30-participant atomic-Git simulation
   demonstrated many write collisions; randomized delays after definite rejected
   updates improved one synthetic run, but do not establish fleet capacity.
5. **Release review and pilot:** reconcile current main; run required source,
   website, browser and security checks and independent review; record exact
   revisions, configuration, owner review authority, monitoring, stop conditions
   and tested operating systems. After separately authorized setup/publication,
   run a controlled real event through creation, join, submission and reveal
   before expanding availability. New Pro jams are automatically approved;
   `armorup` retains maintainer moderation authority.

The 2026-11-04 isolated GitHub capacity run exhausted its request budget after
three confirmed joins; it did not meet the 30-person target. A disposable local
PostgreSQL 18.6 run completed 30 synthetic joins and 30 submissions, but does
not establish hosted Neon or classroom capacity. The earlier waiver covered
only the 10-person pilot; the later explicit 2026-11-05 owner waiver also covers
deploying the 30-account expansion without its hosted acceptance result. Neither
waiver is a passing result.

The selected authority is the dedicated Neon project `autumn-queen-85821497`,
direct host `ep-frosty-fog-be7fiw2h.c-9.us-east-2.aws.neon.tech`, database
`neondb`, and restricted role `zerojams_production_runtime`. Independently
verify the endpoint, schema, epoch, identity, role grants, forced RLS, policies,
constraints, function access, TLS trust and complete initial state before release.
The selector pins the observed provider administrator identities and admits only
the reviewed creator-membership pattern; those administrators can still change
privileges. Admission checks do not fence concurrent administrative changes.
A cloned epoch alone cannot prove branch identity.

The hosted source caps each event at 100 distinct GitHub accounts in
the transactional service, including departed accounts. The 101st distinct account
is rejected; an existing account can recover its accepted request and rejoin
within the normal schedule. The limit is shown before joining from the same
service value. The owner authorized this 100-account expansion on 2026-11-05
after disclosure of its untested hosted flow. The live limit changes only
through separate publication. A local source change does not alter the live
pilot. New Pro jams are automatically approved; each organizer may have one
active jam at a time. `armorup` retains maintainer moderation authority.
There is no participant allowlist; a person with the direct URL can participate
within the event's rules and capacity. Do not publicly promote the pilot.

The 100-account admission setting is not hosted Neon or GitHub Pages capacity
acceptance. No 100-person live join/submission/reveal load test was run; local
transaction, pagination and UI tests do not establish provider throughput or
classroom reliability. The owner requested the expansion with this limitation
disclosed; neither the request nor the historical 30-person waiver is a test pass.

The service reserves `min(safetyOperations, participants + 2)` safety slots. At
100 accounts that is 102 slots and 417,792 bytes, leaving an initial ordinary
budget of 1,582,208 bytes within the unchanged 2,000,000-byte event limit. The
prior 30-account setting reserves 32 slots and 131,072 bytes; the older
10-account setting reserves 12 slots and 49,152 bytes. Ordinary writes cannot
consume unused safety capacity. Audit existing event sizes and operation pools
before rollout: every authoritative service read applies the configured reserve,
so an unusually large old event could fail validation under the larger reserve.
Safety actions remain bounded; exhausted safety space requires operator recovery.

Rollback is state-dependent. The prior 30-account service rejects an event with
more than 30 distinct registrations or more than 32 accepted safety operations.
The older 10-account service rejects more than ten registrations or more than
twelve safety operations. Safety operations are retained; repeated suspension
or entry removal can exceed the target's operation limit even when registration
count fits. Either bound can make Jam reads unavailable after rollback.
Registration count alone is not a sufficient compatibility check.

Before rollback, validate every complete event and settlement record with the
exact target version and its configured limits, including both operation pools,
serialized byte budget and remaining safety reserve, histories and repository
bindings. Raising the participant limit requires no schema migration, but that
does not prove later state remains readable by the old version. Keep the
production Neon authority and Hub holds selected; stop new admissions, reconcile
unknown writes, inspect every affected event, and retain state-compatible
readers/writers. Do not remove registrations or operation history, discard source
bindings or roll back to a deployment without hold enforcement to fit old limits.

Before the first automatically approved write, protect or retire every older
30/100-limit deployment and drain or fence its in-flight requests. Older readers
reject the new automatic-approval records with null human approver and can fail
the complete registry and Hub visibility closed. A new deployment alone does not
prove old instances have stopped. Roll back only to a verified state-compatible
version that understands automatic approvals and preserves all Hub holds; do not
remove or rewrite approval records to make an old deployment accept them.

Before cutover, fence legacy writers and in-flight requests and confirm both Jam
and Hub use the same complete Neon authority. Provisioning, configuration and
release must be coordinated: deploying this source without valid Neon configuration
makes production Hub visibility unavailable. No automatic Git fallback is safe.
To stop new writes, disable `ZERO_JAMS_ENABLED`; keep the authority available for
Hub hold enforcement. Reconcile dispatched or unknown operations by their original
IDs; disabling a flag cannot cancel an already dispatched commit. Never route traffic
to an older build that omits production Hub enforcement while holds may exist.
For restore, secure a backup, stop admission, drain or fence all writers, restore
and validate the complete state under a fresh epoch, then resume. Keep Hub visibility
fail-closed until that is verified. No rollback or recovery procedure is yet proven
against live production.

These gates describe required work, not permission to perform live actions. Never
put credentials, private account data or participant information in evidence.

The configured maintainer is the owner’s GitHub account `armorup` (numeric
ID `4050555`, verified via GitHub on 2026-11-04). New Pro jams are automatically
approved; the maintainer retains moderation and historical review controls. No provider account
or deployment configuration is changed by this local source decision.

The authorized pilot requires the existing website browser-auth configuration,
a reviewed GitHub App installation, and the following server-only configuration.
Configure and verify it before routing production traffic to the new source; never
place credential values in this document, source control or logs:

| Setting | Purpose |
| --- | --- |
| `ZERO_JAMS_PILOT_ENABLED=1` | Exposes direct production pilot Jam routes; does not disable production Hub hold enforcement when removed. |
| `ZERO_JAMS_ENABLED=1` | Enables new Jam writes; disabling it does not fence dispatched commits or disable Hub holds. |
| `ZERO_JAMS_PRODUCTION_AUTHORITY` | Must be `neon-postgres`; production has no Git fallback. |
| `ZERO_JAMS_PRODUCTION_PROJECT_REF`, `ZERO_JAMS_PRODUCTION_PG_HOST`, `ZERO_JAMS_PRODUCTION_PG_PORT`, `ZERO_JAMS_PRODUCTION_PG_DATABASE`, `ZERO_JAMS_PRODUCTION_PG_ROLE` | Independently verified fixed Neon project, host, port, database and restricted role. |
| `ZERO_JAMS_PRODUCTION_PG_EPOCH`, `ZERO_JAMS_PRODUCTION_CREATOR_OID`, `ZERO_JAMS_PRODUCTION_ADMIN_OID` | Reviewed database epoch and pinned provider role identities. |
| `ZERO_JAMS_PRODUCTION_PG_CA_PEM`, `ZERO_JAMS_PRODUCTION_PG_URI` | Server-only TLS trust and restricted-role connection credentials. Never place values in public evidence. |
| Maintainer identity | Hosted composition pins `armorup` (GitHub ID `4050555`) for moderation and historical review; environment settings cannot widen it. |
| `ZERO_JAMS_APP_ID` | Numeric ID of the existing Codepet Zero GitHub App (`5367740`) |
| `ZERO_JAMS_INSTALLATION_ID` | Installation belonging to `codepetca` with approved repository access |
| `ZERO_JAMS_PRIVATE_KEY` | RSA private key for server-only installation-token minting |

Pages observation uses the same App and server-only key, with a token restricted
to the selected repository and Pages/Metadata read. The App key is not similarly
restricted: it can authenticate as the App across installations and their broader
approved permissions. A security and operational review of key storage, access,
rotation and incident response is required before activation. The owner chose one
App; do not register another one for Pages. The pinned participant link targets
`codepet-zero`. Verify existing installations and real provider responses before
release. App-key creation, permissions and installations require authorization.

The service mints short-lived installation tokens narrowed to `codepetca/zero`
with Contents write and Metadata read. Its process-local cache reuses tokens for
at most ten minutes, stopping reuse before token expiry. Browser user credentials
remain separate and verify participant identity/source access. No participant
token is a fallback registry credential. There is no custom token-entry form.
The code does not register an App, modify its permissions, select repositories,
provision a branch or set deployment secrets.

Review shared App key security before activation. Its private key is consequential authority even though issued jam
tokens are narrowed; account owners must approve the actual installation and
permission scope. Do not grant all-repository access or silently add scopes.

### Shared App key release review

Before activation, the owner must identify the deployment environment and the
people and automation able to read or change its secret, and verify that preview
deployments, build logs, error reporting and client bundles cannot expose it.
The local test key is not an approved production secret. Record the responsible
operator, storage and access controls, rotation and incident contacts without
recording the key. Verify secret access using the actual provider configuration;
file permissions on a developer machine do not prove deployment isolation.

For a planned rotation, obtain explicit authorization, generate a replacement,
install it in the approved secret store, and verify both scoped token flows and
the intended deployment before retiring the old key. Account for cached tokens
and running instances; removing a key must not be assumed to revoke previously
issued tokens. Record non-secret key fingerprints and verification times. Never
paste keys into issues, logs, chat, Git, or browser-delivered code.

If exposure is suspected, stop ZeroJams writes and preserve non-secret incident
evidence, then coordinate authorized key revocation and replacement with the
owner. Determine which installations and repositories may have been accessible,
inspect provider audit records, and account for unexpired tokens and in-flight
writes before restoring service. Suspending the shared App or an installation can
also interrupt ordinary Zero features; choose the response with that impact in
view. These are operating steps to rehearse and verify before launch, not evidence
that the current configuration has been secured or that any action is authorized.

## Registry and privacy

The production authority is the dedicated Neon registry described above, not a
Git branch. The older `zero-jams-pilot-registry` is a separate historical test
and must remain untouched unless independently authorized. Never assume absence
or use the legacy Git writer as a fallback. The database stores public event,
registration and submission information; do not add emails, private rosters or
sensitive review material. GitHub Pages and public repositories remain separately
public. Database access is restricted but is not a promise that published event
information is private. Preserve backups and history according to the reviewed
recovery procedure.

For an event incident, a maintainer can suspend or cancel through the reviewed
event controls. For platform trouble, disable `ZERO_JAMS_ENABLED`; this stops
new official admissions and leaves creator websites independently hosted. A
dispatched or staged write can still complete after disablement: preserve its
operation ID and reconcile its durable outcome before claiming it stopped. Preserve
Git history and source when investigating. Re-enable only after verifying the
cause, effective permissions and affected records.

Before expanding the pilot, record requests/GitHub calls per action, latency,
cache behavior, conditional-write conflicts, storage growth and moderation time.
Choose explicit provider spending/usage limits under owner authorization. GitHub
API limits, hosting plans and free allowances are dependencies, not permanent
unlimited service guarantees. Private events, large events or sustained write
contention require another design review.

## Live acceptance still required

After source review and authorized deployment, verify actual GitHub consent,
installation token scope, source ownership, registration, retry recovery, deadline
closure, withdrawal, suspension and gallery visibility with real pilot accounts.
Verify creator-hosted embedding, top-level sign-in fallback, mobile/desktop
browsers, and measured provider use. Keep physical OS/browser and school-network
gaps explicit. Passing local HTTP, source and browser fixtures is not this live
acceptance and does not authorize publication.
