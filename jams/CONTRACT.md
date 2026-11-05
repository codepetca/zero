# ZeroJams implementation contract v1

Local implementation, default off. No live setup/permissions or publication.
Coordinator owns this interface; workers coordinate changes before integration.

## Data

New proposals are Zero-hosted. HTTP input is `{operationId,manifest}`; service
input adds only the server-derived `actor`. Manifest is
`{schema:1,templateVersion:"1.0.0",type:"game"|"app",title,summary,theme,rules,
eligibility,timezone,schedule:{registrationOpensAt,registrationClosesAt,startsAt,
submissionsOpenAt,submissionsCloseAt,galleryRevealAt}}`. Dates are ISO UTC instants;
timezone is IANA. `galleryRevealAt` is required, strictly after the submission
deadline, and future at each new-write CAS attempt. Accepted operation retries
recover even after that date. Text is bounded/validated. Input has no website URL,
repository, hosting choice or identity fields. No organizer repository is fetched.

New IDs are `jam-zero-<32 lowercase hex>`, from a domain-separated SHA-256 digest
of numeric creator ID and operation ID. The namespace is distinct from legacy
`jam-<repoId>` and paths accept both. The deterministic ID preserves unknown-write
recovery without a global scan. A fresh operation creates a separate proposed
event; this creation endpoint does not edit/resubmit an existing event.

Hosted durable state has `hosting:"zero"` and `repositoryId:null`; its proposal
has `hosting:"zero",repository:null,manifest`. Archived creator-hosted records
retain their original schema, source metadata, IDs and website URL. Existing
pending proposals remain readable to their creator/maintainers and reviewable;
approved events remain readable and usable. New creator-hosted intake is rejected
at both HTTP and direct service boundaries. The standalone template source and
pure generators remain available to maintainers; template ZIP/preview routes
return410 locally and retain404 under the production visibility hold.

Actor is server-derived `{id:string,login:string}`. Source verifier takes
`{repositoryUrl,commit,actor,manifest:boolean}` and returns
`{repository:{id:string,ownerId:string,fullName:string,commit:string},manifest?}`.
Exact commit must exist in the named public owner repository.

Official state uses a branch-wide atomic Git snapshot and CAS. `snapshot()`
returns `{revision,ids,settlements,read(id)}` pinned to one commit;
`compareAndSwap(id,revision,state,{settlements?})` publishes a single-parent
commit with a non-forced ref update. The registry uses `zero-jams-v2/events/`
and a settlement ledger. Migration from legacy `jams/` is explicit and requires
operator authorization; no startup or test mutates a live branch. The prior
per-file writer must be retired before cutover. Missing authority fails closed.
A creator may have at most three pending hosted proposals by default; that cap
and the global event cap are checked in the same snapshot and on each CAS retry.

## Service API (jams/service.mjs)

Export `createJamService({store,verifySource,verifyRepository,pagesBindingReader,maintainerIds,now=Date.now,limits?,canCreateJam?})`.
`canCreateJam(accountId)` is a trusted, synchronous server-only constructor hook;
it defaults to deny and requires literal `true`. The HTTP actor is verified by
immutable numeric GitHub ID, not a claimed browser plan or mutable login. Free
personal users can join/submit; manual Pro access is required only for new
proposals. Hosted/local composition uses the server-only
`ZERO_JAMS_PRO_GITHUB_IDS` allowlist; missing or invalid configuration denies all
new creation. No account grant list is returned and no billing/subscription
verification is implemented. See the operator guide for strict format and bounds.

Accepted/fenced proposal recovery precedes the entitlement check inside the
transaction; new-write admission checks it again immediately before CAS and on
each retry. Accepted requests and applied/not-applied settlement still recover
after grant revocation. Existing events, Free participation and approver authority
are unchanged. Provider environment changes require redeployment; old instances
and already-dispatched commits can retain prior authority. This is not a write
fence or immediate fleet-wide revocation guarantee.

Return methods:

- `list(actor?)` -> `{events:[summary],canMaintain,proposals?}` (approved only;
  no suspended/cancelled discovery). Only maintainers receive pending review
  summaries `{id,title,type,revision,status,organizerLogin,submittedAt}` in proposals.
- `read(id,actor?)` -> `{event,registration,entry,canMaintain,proposal?}`; unauthenticated
  callers see only accepted public event, active participant/entry summaries.
  Unapproved proposal detail is creator/maintainer-only. `registration` and `entry`
  are the current actor's records or null. `proposal` is the latest reviewable
  `{revision,manifest,repository,status,reason}` for authorized actors.
- `propose({actor,operationId,manifest})` -> `{eventId,operationId,...}`.
- `mutate({id,actor,operationId,action,revision?,reason?,participantId?,source?,title?,description?,demoUrl?,instructions?})`
  -> `{eventId,operationId,...}`. Actions: `approve`, `request-changes`, `reject`,
  `suspend`, `resume`, `cancel`, `withdraw-entry`, `join`, `leave`, `submit`, `withdraw`.
  Approve/request-changes/reject require exact latest proposal `revision` and
  maintainer identity; no self-approval. Moderation requires maintainer/reason.
  `join` and `submit` require accepted event `revision` as acknowledgment. For
  showcase events, Join binds a verified public repository without requiring a
  published site. Submit rechecks that repository and requires a Pages URL with
  a server-observed matching repository/owner receipt; matching configured custom domains
  qualify. Legacy submissions retain `source:{repositoryUrl,commit}`. One active entry
  per actor; replacement adds history; leave withdraws and rejoin does not restore.
  `withdraw-entry` requires maintainer authority, numeric participantId and public
  reason. It appends withdrawal history even after closure/suspension/cancellation;
  registration stays unchanged. Corrected ordinary submissions still follow the
  accepted schedule and rules. Instructions are optional; demoUrl is required.
  Suspend/cancel/entry-removal reasons are at most256characters and use separately
  reserved bounded operation/storage capacity that ordinary writes cannot consume.

Hosted source admits 100 distinct registered accounts per jam, including
departed registrations. The 101st distinct account is rejected transactionally
with 429; accepted retries and existing-account rejoin remain available under
the ordinary rules. `event.participantLimit` comes from the enforcing service.
The shared physical schema maximum remains 200; it does not set hosted admission.
On 2026-11-05 the owner requested the 100-account expansion after disclosure
that the hosted 100-person flow is untested. No 100-person Neon/Pages provider
acceptance is claimed. The prior 30-person acceptance waiver remains historical.
The live limit changes only through separate publication.

Event summary: `{id,creator:{id,login},hosting:"zero"|"creator",revision,title,type,summary,theme,rules,eligibility,websiteUrl,
timezone,schedule,reviewStatus,moderation,registrationOpen,submissionsOpen,
participantCount,participantLimit,participants:[{id,login}],entries:[{participantId,login,title,
description,demoUrl,instructions,repository:{id,ownerId,fullName,commit},submittedAt}],
updatedAt}`. `websiteUrl` exists only for archived creator-hosted events.
For manifests with `galleryRevealAt`, public event projections expose
`galleryRevealed` and withhold `entries` until that instant. A participant can
still read their own `entry`. A fresh complete snapshot holds bound repository
IDs across events and Hub discovery until the last applicable reveal. Withdrawal,
leaving and moderation do not erase held history. This controls Zero discovery,
not access to public GitHub repositories or independently hosted Pages sites.
Showcase entries lacking an on-time receipt or a fresh matching Pages observation
are excluded from public galleries; owner and maintainer access remains. GitHub
metadata is an observation, not proof of site contents or an immutable commit.
Pending creator view may have `revision:null` and proposal-derived
display fields, but never open actions. Latest proposal reviewStatus does not
disable an existing accepted revision while a replacement is under review.
`event.approvalHistory` contains approved-only `{revision,approvedAt,manifest}`
versions. A joined participant's prior acknowledgment is `registration.revision`;
the UI explicitly identifies a newer accepted rules/schedule version and makes
previous accepted facts inspectable before renewed acknowledgment.

Errors: export `JamError` with `.status` (400,401,403,404,409,413,429,503) and
safe public message. No credentials/operational payloads in errors. Same operation
key + actor/event + same payload recovers result; changed payload rejects. Clock
is rechecked before each CAS attempt. Existing accepted result recovers after
deadline, while a new attempt requires its last service admission check inside
the half-open window and Pages verification before close. Git provider publication may finish
after the cutoff; confirmation requires the durable update, and no strict
provider-commit-time guarantee is made.

Scoped ordinary mutations spread retries after an explicitly rejected ref
update using a short cancelable delay. They reload state and recheck admission
before retrying. Unknown outcomes are not automatically retried, safety actions
are not delayed, and only a literal boolean store result can establish success
or rejection. This is not a queue or fleet-capacity guarantee.

An optional local transactional-store contract is under evaluation. Its
`transact(callback)` serializes the complete registry authority and supplies a
transaction-local snapshot/CAS facade. The service obtains repository and Pages
proof before entering that callback; recovery, settlement fences, current clock,
caps and the state transition are checked inside it. The store may return the
callback result only after confirmed commit. A lost commit response remains
unknown and is recovered with the same operation ID. Transactional CAS rejection
is unavailable, not a reason to retry while holding the lock. The production
pilot uses the PostgreSQL authority for both Jam and Hub visibility; a cutover
or rollback must keep the two on the same reviewed authority.

## HTTP (coordinator)

- GET `/api/jams`: `{configured,events,canMaintain,proposals?,galleriesDeferred?}`;
  unavailable503 when unconfigured. Optional session; pending inbox only for
  maintainers. If the directory exceeds 200 distinct public destinations, it
  returns event summaries without `entries` and sets `galleriesDeferred:true`;
  individual event details remain available and enforce the same reveal hold.
  `?view=summaries` explicitly requests entry-free event summaries with
  `galleriesDeferred:true` and does not perform Pages observations; the default
  contract remains unchanged.
- GET `/api/jams/<id>`: `{configured,event,registration,entry,canMaintain,proposal?}`.
  Optional session; unapproved unknown events404 to unauthenticated callers.
  A revealed event has `galleryIncomplete:true` when one or more otherwise
  eligible Pages observations could not be verified; unverified entries and
  failure details remain hidden. An overall deadline failure remains a 503.
  `?view=gallery` selects up to eight eligible candidates per page; `nextCursor`
  is an opaque, authenticated continuation or null. Every page verifies fresh
  authority, current Pages associations and destination identity. A changed
  registry, expired cursor or crossed reveal horizon requires restart (409).
  `?view=overview` omits public entries and Pages work while preserving the
  caller's own registration and entry. `?view=moderation` is maintainer-only and
  returns the current private moderation list, including held entries, without
  treating it as public discovery.
- POST `/api/jams/proposals`: JSON `{operationId,manifest}`.
- POST `/api/jams/<id>/actions`: JSON same service mutation fields, except actor/id
  come from session/path, never browser. Require Origin/session/CSRF and current
  GitHub identity verification. Use `x-hub-csrf` from existing session endpoint.
- POST `/api/jams/settlements`: `{operationId,scope,payload}` uses the original
  payload without its operation ID. The durable result reports `applied` or
  `not-applied`; ordinary retries of a fenced operation return a terminal 409.
- GET/POST `/api/jams/template` and `/api/jams/template/preview`: closed creator-hosted artifact routes (410 locally;404 under visibility hold).

Service responses carry `configured:true`; errors `{error,configured?}`. No-store for public and authenticated responses and mutations.
Session endpoint and sign-in unchanged at `/api/hub/github/session` and login
`/api/hub/github/login?returnTo=/hub/jams/...`.

Website UI: `/hub/jams` discovery; `/hub/jams/create` preparation/proposal;
`/hub/jams/<id>` official detail + creator/maintainer proposal review;
`/hub/jams/<id>/panel` public embeddable status/links only;
`/hub/jams/<id>/participate` trusted top-level confirmations. No write controls
inside creator frames. Top-level pages have anti-framing headers. No tokens passed
through parent messages; plain secure links/popups suffice. Preserve blocked-popup
fallback and readable unavailable state. Do not fake successful joins in previews.
