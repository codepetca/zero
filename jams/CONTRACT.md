# ZeroJams implementation contract v2

Protected invited pilot only; production remains hidden. This contract grants no
setup, credential, publication or rollout authority.
Coordinator owns this interface; workers coordinate changes before integration.

## Data

Manifest (`zero-jam.json`): `{schema:1, templateVersion:"1.0.0", type:"game"|"app",
title, summary, theme, rules, eligibility, websiteUrl, timezone,
schedule:{registrationOpensAt,registrationClosesAt,startsAt,submissionsOpenAt,
submissionsCloseAt}}`. Dates are ISO UTC instants; timezone is IANA. Manifest is
fetched at an exact public GitHub source commit; numeric owner ID must match the
authenticated creator. All text and HTTPS URLs are bounded/validated. No arbitrary
website fetch or source execution. One stable event per repository, ID `jam-<repoId>`.

Actor is server-derived `{id:string,login:string}`. Source verifier takes
`{repositoryUrl,commit,actor,manifest:boolean}` and returns
`{repository:{id:string,ownerId:string,fullName:string,commit:string},manifest?}`.
Exact commit must exist in the named public owner repository.

Official state is separate from game/library sharing. The hosted writer uses
`createAtomicGitHubJamStore` and one existing fixed registry branch in
`codepetca/zero`. Current protocol:

- `jams` is an exact regular-file protocol marker, never a directory.
- `zero-jams-v2/events/<id>.json` retains each schema1 event record.
- `zero-jams-v2/settlements.json` is a bounded schema1 rejection ledger.
- `snapshot() -> {revision:branchHead,ids,settlements,read(id)}` pins all reads to
  the immutable commit. `read(id)` in a snapshot returns `{state:null|object}`.
- `compareAndSwap(id|null,expectedHead,nextState|null,{settlements?}) -> boolean`
  stages blobs/tree against that commit and creates one commit with exactly that
  parent. Non-forced ref publication makes concurrent sibling transactions conflict.
  A null event ID updates only the settlement ledger, without inventing an event.
- Standalone `read(id)` returns `{state,revision:branchHead}`; `list()` returns IDs.
  No missing-branch creation, fallback namespace or alternate writer credential.

`migrate()` is an explicit operator method, never called by runtime requests. It
atomically copies existing legacy event bytes, creates the ledger, and replaces
the old `jams/` tree with the marker; other files/history remain. The guarded operator call supplies `expectedRevision` and aborts on drift or
publication conflict; inspect a fresh plan before applying again. Unguarded test
migrations can recopy from a fresh snapshot. Old writers cannot change the v2 event namespace. If an
unexpected legacy write replaces the marker, v2 fails closed rather than importing
it. GitHub's exact Contents parent-file traversal behavior remains a provider
acceptance limit; correctness does not rely on that request being rejected.

The old `github-store.mjs` adapter remains for legacy/migration tests only. Hosted
runtime uses the atomic adapter. All accepted changes and rejection fences share
the same branch transaction domain. A side-file check followed by a Contents PUT
would be unsafe and is not used.

## Service API (jams/service.mjs)

Export `createJamService({store,verifySource,maintainerIds,now=Date.now,limits?})`.
Return methods:

- `list(actor?)` -> `{events:[summary],canMaintain,proposals?}` (approved only;
  no suspended/cancelled discovery). Only maintainers receive pending review
  summaries `{id,title,type,revision,status,organizerLogin,submittedAt}` in proposals.
- `read(id,actor?)` -> `{event,registration,entry,canMaintain,proposal?}`; unauthenticated
  callers see only accepted public event, active participant/entry summaries.
  Unapproved proposal detail is creator/maintainer-only. `registration` and `entry`
  are the current actor's records or null. `proposal` is the latest reviewable
  `{revision,manifest,repository,status,reason}` for authorized actors.
- `propose({actor,operationId,repositoryUrl,commit})` -> `{eventId,operationId,...}`.
- `mutate({id,actor,operationId,action,revision?,reason?,participantId?,source?,title?,description?,demoUrl?,instructions?})`
  -> `{eventId,operationId,...}`. Actions: `approve`, `request-changes`, `reject`,
  `suspend`, `resume`, `cancel`, `withdraw-entry`, `join`, `leave`, `submit`, `withdraw`.
  Approve/request-changes/reject require exact latest proposal `revision` and
  maintainer identity; no self-approval. Moderation requires maintainer/reason.
  `join` and `submit` require accepted event `revision` as acknowledgment. Submit
  requires a joined actor and `source:{repositoryUrl,commit}`. One active entry
  per actor; replacement adds history; leave withdraws and rejoin does not restore.
  `withdraw-entry` requires maintainer authority, numeric participantId and public
  reason. It appends withdrawal history even after closure/suspension/cancellation;
  registration stays unchanged. Corrected ordinary submissions still follow the
  accepted schedule and rules. Instructions are optional; demoUrl is required.
  Suspend/cancel/entry-removal reasons are at most256characters and use separately
  reserved bounded operation/storage capacity that ordinary writes cannot consume.

- `settle({actor,scope,operationId,payload})` where scope is `proposals` or an
  event ID and payload is the exact original public form. Current identity is
  always server-derived. It recovers an existing accepted result with
  `settlement:"applied"`, or atomically records a terminal `not-applied` fence.
  Closing applies no business action and requires no current maintainer role; it
  only settles that actor's key. It never closes a different actor's request.
  Source verification is unnecessary. Proposal recovery scans the bounded pinned
  event snapshot without depending on current source names/availability.
  Valid forms use the same normalizer as ordinary intake; invalid old forms use
  a bounded deterministic envelope digest. Changed payload/key reuse conflicts.
  Fence recovery precedes deadlines, roles, capacity checks and source requests.
  Missing events/proposals need no fake event. Accepted outcomes and fences cannot
  coexist for the same scope/actor/key.

Rejection ledger records are keyed `scope:actorId:operationId`, with exactly
`{scope,actorId,operationId,payloadDigest,settledAt}`. No original form text or
credentials are retained there. Limits:1000 fences,50 per actor,512000 serialized
bytes and10 new closes per actor/minute. Pilot invitation remains two accounts.
Fences have separate capacity from ordinary operations and reserved safety
moderation. Never evict them while old requests may be admissible. Exhaustion,
malformed state or unknown provider replies retain the client request for retry.

Event summary: `{id,revision,title,type,summary,theme,rules,eligibility,websiteUrl,
timezone,schedule,reviewStatus,moderation,registrationOpen,submissionsOpen,
participantCount,participants:[{id,login}],entries:[{participantId,login,revision,title,
description,demoUrl,instructions,repository:{id,ownerId,fullName,commit},submittedAt}],
updatedAt}`. Pending creator view may have `revision:null` and proposal-derived
display fields, but never open actions. Latest proposal reviewStatus does not
disable an existing accepted revision while a replacement is under review.
`event.approvalHistory` contains approved-only `{revision,approvedAt,manifest}`
versions. Each gallery entry includes its immutable entry `revision`, so a saved
review draft can remain bound to the exact entry being reviewed. This field does
not grant mutation authority. A joined participant's prior acknowledgment is `registration.revision`;
the UI explicitly identifies a newer accepted rules/schedule version and makes
previous accepted facts inspectable before renewed acknowledgment.

Errors: export `JamError` with `.status` (400,401,403,404,409,413,429,503) and
safe public message. No credentials/operational payloads in errors. Same operation
key + actor/event + same payload recovers result; changed payload rejects. Clock
is rechecked before each CAS attempt. Existing accepted result recovers after
deadline, while newly accepted writes require current half-open window.

## HTTP (coordinator)

- GET `/api/jams`: `{configured,events,canMaintain,proposals?}`; unavailable503
  when unconfigured. Optional session; pending inbox only for maintainers.
- GET `/api/jams/<id>`: `{configured,event,registration,entry,canMaintain,proposal?}`.
  Optional session; unapproved unknown events404 to unauthenticated callers.
- POST `/api/jams/settlements`: JSON `{scope,operationId,payload}`. Same current
  GitHub identity, Origin/session/CSRF, body bounds and unconditional production
  hold as other mutations. Closing returns200 only with a confirmed outcome.
  Normal action/proposal replay of a closed key returns409 with matching
  `{configured:true,operationId,scope,settlement:"not-applied",status:"not-applied"}`
  and a safe error for older clients.
- POST `/api/jams/proposals`: JSON `{operationId,repositoryUrl,commit}`.
- POST `/api/jams/<id>/actions`: JSON same service mutation fields, except actor/id
  come from session/path, never browser. Require Origin/session/CSRF and current
  GitHub identity verification. Use `x-hub-csrf` from existing session endpoint.
- GET `/api/jams/template?type=game|app`: complete standalone template ZIP.

Service responses carry `configured:true`; errors `{error,configured?}`. No-store
for authenticated data/mutations. Public summaries may have bounded caching.
Session endpoint and sign-in unchanged at `/api/hub/github/session` and login
`/api/hub/github/login?returnTo=/hub/jams/...`.

Website UI: `/hub/jams` discovery; `/hub/jams/create` preparation/proposal;
`/hub/jams/<id>` official detail + creator/maintainer proposal review;
`/hub/jams/<id>/panel` public embeddable status/links only;
`/hub/jams/<id>/participate` trusted top-level confirmations. No write controls
inside creator frames. Top-level pages have anti-framing headers. No tokens passed
through parent messages; plain secure links/popups suffice. Preserve blocked-popup
fallback and readable unavailable state. Do not fake successful joins in previews.

Client recovery stores only the public form and an atomic operation-ID/close-mode
value in session storage. If saving/readback fails, no new request is dispatched;
editing still works and the existing uncertain request is retained. A lost close reply/reload retries closing, never the original
action. Clear keys only after matching configured operation/scope/outcome; an
ordinary 4xx retry,503, malformed response or authentication error does not settle
an unknown. Not-applied outcomes preserve drafts and refresh current details.
A later new action uses a fresh ID. Controls work only on a direct trusted page.

Normal HTTP requests remain bounded to16384 bytes. Close accepts up to17408 bytes
for its wrapper, while reconstructing and enforcing the original16384-byte request
bound. Large valid multibyte forms can therefore close without changing their
immutable payload. The read-only preflight recognizes the exact public v2 marker
and audits its pinned event namespace; legacy layout explicitly requires migration.
