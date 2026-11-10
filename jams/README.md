# ZeroJams service

Local implementation only. No GitHub branch, credential, permission or deployment
is created here. Runtime HTTP/auth/configuration belongs to the website adapter.

`createJamService({store, verifySource, maintainerIds, now, limits, canCreateJam})` exports the
contract in `CONTRACT.md`. Actors are trusted server-derived GitHub identities;
browser identity/role fields must never be forwarded as authority. New proposal
intake is `{actor,operationId,manifest}` for Zero-hosted events, with no organizer
repository, website URL or hosting choice. The validated manifest requires a
future gallery reveal strictly after its submission deadline. Proposal state has
`hosting:'zero'`, `repository:null`; event state has `repositoryId:null`. IDs use
the separate deterministic `jam-zero-<32 hex>` namespace. Same actor/operation
and normalized manifest recover the stored result; changed information conflicts.
A new operation creates a separate event, not an edit to an existing proposal.
A Pro creator can have one active jam at a time; new hosted events are
automatically approved. The slot remains occupied through gallery reveal (or
legacy submission close), including while suspended; cancellation releases it.
Historical pending events also occupy it until their applicable end, unless
rejected without an accepted version. A creator can cancel their own
automatically approved jam with a public reason even after Pro revocation;
existing project holds remain until the scheduled reveal. Maintainers retain
moderation and historical review.
Source checks still bind participant public repositories and exact commits.
Organization/collaborator-only sources do not confer participant source ownership.
Maintainers use configured numeric account IDs for moderation and historical
review; historical manual approval retains its independent-review rule. Source and repository links are metadata, never
instructions to execute code or fetch creator-controlled website content.

Free personal users may join and submit; a manually enabled Pro license is
required to create a jam for up to 100 participants. Contact `info@codepet.ca`.
The server-only `ZERO_JAMS_PRO_GITHUB_IDS` value lists verified immutable numeric
GitHub IDs, not logins. The optional `ZERO_JAMS_ADDITIONAL_PRO_GITHUB_IDS`
list grants access independently. Missing, malformed or duplicate entries
invalidate their own list; an account must appear in a valid list.
The trusted `canCreateJam(accountId)` hook may be asynchronous and defaults to deny; browser
license claims cannot override it. This is not checkout or subscription billing.
The operator guide records exact configuration bounds and deployment semantics.

Accepted/fenced requests recover before entitlement checks, even after revocation;
new writes recheck the grant inside the transaction and immediately before CAS.
Settlement remains available and existing events/Free participation/Hub holds are
preserved. Environment edits require redeployment; older instances and dispatched
commits can retain previous authority. Retain uncertain operation IDs and reconcile
outcomes. No real licenses or provider settings are activated by these changes.

`createGitHubSourceVerifier({token, fetchImpl, timeoutMs})` returns `verifySource`.
The token is supplied by the HTTP caller for its current GitHub session. It may
be absent when constructing read-only service instances; verification then fails
unavailable. Manifest retrieval uses the fixed GitHub Contents API at the exact
commit and verifies Git blob SHA-1 plus bounded UTF-8 JSON. Links are validated,
but demo bytes and mutable hosted websites are not verified/frozen by Zero.
Commit existence uses `/git/commits/<sha>` metadata, avoiding diff/patch payloads
from large student commits.

`createAtomicGitHubJamStore` uses a server-only service credential, pinned
commit snapshots and non-forced branch updates. The legacy layout requires an
explicit operator migration and retirement of prior writers; this local work
performs neither. Same-operation retries recover committed results. Settlement
fences are stored atomically with registry updates; uncertain outcomes remain
unknown until recovery or settlement. Template ZIP and preview routes are closed,
while their underlying code remains available.

Accepted metadata stays stable while a historical newer proposal is reviewed. Public reads
expose accepted display fields and active participants; event entries with an
explicit gallery reveal stay hidden until that server-clock instant. Participants
can still inspect their own entry. Public Jam and Hub discovery use a complete pinned registry snapshot to hold
a joined project repository across galleries until all applicable reveals.
This is a discovery hold, not secrecy for independently public source or Pages.
The separate experimental queue and controlled pilot remain unchanged. Only creators and
maintainers see the pending proposal. Registration/submission windows are
half-open UTC intervals and the server clock is checked again before every CAS
attempt. Join and submission require the current accepted revision. Leaving
withdraws the current entry; rejoining does not restore it. Ordinary leaving and
withdrawal append an entry revision, retaining prior submitted revisions.
Leaving and withdrawal close at the submission deadline and all participant writes stop while
suspended/cancelled. Accepted retries still recover after closure or suspension.
Maintainers can use `withdraw-entry` with a numeric `participantId` and required
reason even after closure or while suspended/cancelled. The host of an active
jam can use the same action once its gallery opens, or after submissions close
for older jams without a reveal date. This appends an attributed
withdrawal revision and moderation history without changing registration or
restoring anything. A participant may submit a corrected new entry revision while
the event is active and its ordinary submission window remains open.
`list(actor?)` includes an inbox of submitted/changes-requested proposal summaries
only for configured maintainer IDs; public and other-account lists omit it.
Public `event.approvalHistory` contains at most 50 approved-only revision, manifest
and approval-date snapshots. Pending proposals stay private. Approving new rules
does not overwrite a participant's previous `registration.revision`; the next
applicable action acknowledges the displayed current revision.

Hosted source fixes admission at 100 distinct accounts per jam, including
departed registrations; it overrides injected participant limits. On 2026-11-05
the owner requested this expansion after disclosure that the 100-person hosted
flow is untested. The earlier 30-person acceptance waiver remains historical;
no 100-person Neon/Pages provider-capacity acceptance is claimed. The live limit
changes only through publication. The service projects `event.participantLimit`
for the participation UI. The shared schema retains its 200-record physical
maximum and standalone service default for storage/readability and local fixtures.

The hosted reserve grows to 102 safety slots (417,792 bytes); existing records
must fit the larger reserve and initial 1,582,208-byte ordinary budget. Rollback
to the prior 30-account service rejects more than 30 registrations or more than
32 accepted safety operations. The older 10-account service rejects more than ten accounts
or twelve safety operations, even when registration count fits. Validate complete
state against the target version's operation pools, bytes/reserve budget and
other limits. Older 30/100-limit readers also reject automatic approvals with
null human approver and can fail the entire registry and Hub visibility closed.
Before the first automatic write, retire or protect older deployments and drain
or fence in-flight requests; rollback requires a verified reader compatible with
automatic approval and existing holds. See the operator guide for rollout/rollback.
Local synthetic 100-entry pagination covers 13 pages, ending at offset 96 with
four entries; this does not establish actual provider performance or quota.

Standalone service defaults: 100 events per listing/new-event capacity check, 200 distinct
participant records per event (including departed participants), 1,000 accepted
ordinary operations per event, 50 proposal revisions, 30 entry revisions per participant,
2,000,000 serialized state bytes, eight CAS attempts, and ten distinct accepted
writes per actor/event in a rolling 60 seconds for ordinary operations. The per-event capacities and
write-rate limit are durable CAS checks. Idempotent recovery runs before quotas;
same actor/event/key with altered normalized payload conflicts. No operation is
evicted to make room. Operators must review capacity before activation.
The final entry-history slot is reserved for withdrawal/removal; ordinary
submissions stop at 29 revisions under the default 30-revision bound.

Safety moderation (`suspend`, `cancel`, `withdraw-entry`) has a separate bounded
pool: `min(safetyOperations, participants + 2)` slots, default 202, with 4,096
serialized bytes reserved per unspent slot. Ordinary writes cannot consume that
space or those operation slots. The initial ordinary byte budget is 1,172,608
under the default 2,000,000-byte limit. Every safety write must grow the whole
record by at most 4,096 bytes, and state validation reserves 4,096 bytes for each
remaining safety slot; unused bytes from consumed slots may serve later ordinary
writes. Safety reasons are limited to 256 characters, and removal stores a compact
withdrawal revision pointing to immutable prior source. Participant reads resolve
that reference for useful removed-entry metadata. These safety actions bypass the
ordinary count/rate quota, require authority for the action and recover by the same
durable operation key. Host withdrawals leave two slots for maintainer suspension
and cancellation. Exhausting the safety pool fails explicitly for operator
intervention; moderation is bounded, not unlimited. Custom limits leaving less
than 65,536 ordinary bytes or fewer than two entry-history slots are invalid.

The total event cap and the legacy default limit of three outstanding hosted proposals
per creator are checked against the same branch snapshot used for CAS. Conflicts
reload and recheck. Approval or rejection releases a pending-proposal slot;
retries recover before limits. These bounds do not establish a strict wall-clock
rate limit or authorize live activation.
Run `node --test jams/test/*.test.mjs`. Fixtures exercise privacy, source-owner
binding, no self-approval, accepted revision stability, stale acknowledgment,
half-open deadlines, CAS races, unknown writes and retry recovery, moderation,
entry replacement/withdrawal, durable rates/capacities and fixed GitHub storage.
Mocks do not establish live GitHub permission/hosting or physical browser proof.
