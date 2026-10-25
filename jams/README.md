# ZeroJams service

Local implementation only. No GitHub branch, credential, permission or deployment
is created here. Runtime HTTP/auth/configuration belongs to the website adapter.

`createJamService({store, verifySource, maintainerIds, now, limits})` exports the
contract in `CONTRACT.md`. Actors are trusted server-derived GitHub identities;
browser identity/role fields must never be forwarded as authority. Source checks
bind public personal-account repository numeric ownership and exact commits.
Organization/collaborator-only sources and repository transfers do not confer
organizer authority. Maintainers use configured numeric account IDs; a creator
cannot approve their own event. Source and repository links are metadata, never
instructions to execute code or fetch creator-controlled website content.

`createGitHubSourceVerifier({token, fetchImpl, timeoutMs})` returns `verifySource`.
The token is supplied by the HTTP caller for its current GitHub session. It may
be absent when constructing read-only service instances; verification then fails
unavailable. Manifest retrieval uses the fixed GitHub Contents API at the exact
commit and verifies Git blob SHA-1 plus bounded UTF-8 JSON. Links are validated,
but demo bytes and mutable hosted websites are not verified/frozen by Zero.
Commit existence uses `/git/commits/<sha>` metadata, avoiding diff/patch payloads
from large student commits.

`createGitHubJamStore({token, fetchImpl, timeoutMs, maxEvents})` uses a separate
server-only service credential. It is fixed to `codepetca/zero`, existing branch
`zero-jams-registry`, and `jams/jam-<numeric-repository-id>.json`. The store never
uses participant credentials or creates branches. An absent directory is empty
only after the expected branch is verified. An absent branch requires explicit
operator setup. Contents writes use the previous file blob SHA; a committed state
and its operation result occupy the same file update. Transport errors and lost
confirmation remain unknown; retry the same operation ID to recover acceptance.
Proposal retry recovery scans only the bounded official listing before fetching
creator source, so a committed proposal remains recoverable after source removal.
It adds up to one record read per pilot event to proposal requests.

Accepted metadata stays stable while a newer proposal is reviewed. Public reads
expose accepted display fields and active participants/entries; only creators and
maintainers see the pending proposal. Registration/submission windows are
half-open UTC intervals and the server clock is checked again before every CAS
attempt. Join and submission require the current accepted revision. Leaving
withdraws the current entry; rejoining does not restore it. Ordinary leaving and
withdrawal append an entry revision, retaining prior submitted revisions.
Leaving and withdrawal close at the submission deadline and all participant writes stop while
suspended/cancelled. Accepted retries still recover after closure or suspension.
Maintainers can use `withdraw-entry` with a numeric `participantId` and required
reason even after closure or while suspended/cancelled. This appends an attributed
withdrawal revision and moderation history without changing registration or
restoring anything. A participant may submit a corrected new entry revision while
the event is active and its ordinary submission window remains open.
`list(actor?)` includes an inbox of submitted/changes-requested proposal summaries
only for configured maintainer IDs; public and other-account lists omit it.
Public `event.approvalHistory` contains at most 50 approved-only revision, manifest
and approval-date snapshots. Pending proposals stay private. Approving new rules
does not overwrite a participant's previous `registration.revision`; the next
applicable action acknowledges the displayed current revision.

Pilot defaults: 100 events per listing/new-event capacity check, 200 distinct
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
ordinary count/rate quota but remain maintainer-only and recover by the same
durable operation key. Exhausting the safety pool fails explicitly for operator
intervention; moderation is bounded, not unlimited. Custom limits leaving less
than 65,536 ordinary bytes or fewer than two entry-history slots are invalid.

The global event cap is an advisory admission check, **not an atomic quota**:
two new events may race because the contract has per-event CAS only. Over-cap
listings fail closed. A strict global quota would need a separate shared atomic
index/reservation protocol. Large discovery reads remain bounded by the pilot
listing; this is not an unlimited Git-backed database or an activated live pilot.

Run `node --test jams/test/*.test.mjs`. Fixtures exercise privacy, source-owner
binding, no self-approval, accepted revision stability, stale acknowledgment,
half-open deadlines, CAS races, unknown writes and retry recovery, moderation,
entry replacement/withdrawal, durable rates/capacities and fixed GitHub storage.
Mocks do not establish live GitHub permission/hosting or physical browser proof.
