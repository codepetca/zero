# ZeroJams implementation contract v1

Local implementation, default off. No live setup/permissions or publication.
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

Official state is separate from game/library sharing. Store interface:
`read(id) -> {state:null|object,revision:null|string}`;
`compareAndSwap(id,expectedRevision,nextState) -> boolean`; `list() -> string[]`.
CAS must atomically store state + operation result; read/write are bounded. Use
dedicated existing branch `zero-jams-registry` in fixed `codepetca/zero`, path
`jams/<id>.json`. Missing branch requires explicit operator setup, never auto-create.

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

Event summary: `{id,revision,title,type,summary,theme,rules,eligibility,websiteUrl,
timezone,schedule,reviewStatus,moderation,registrationOpen,submissionsOpen,
participantCount,participants:[{id,login}],entries:[{participantId,login,title,
description,demoUrl,instructions,repository:{id,ownerId,fullName,commit},submittedAt}],
updatedAt}`. Pending creator view may have `revision:null` and proposal-derived
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
deadline, while newly accepted writes require current half-open window.

## HTTP (coordinator)

- GET `/api/jams`: `{configured,events,canMaintain,proposals?}`; unavailable503
  when unconfigured. Optional session; pending inbox only for maintainers.
- GET `/api/jams/<id>`: `{configured,event,registration,entry,canMaintain,proposal?}`.
  Optional session; unapproved unknown events404 to unauthenticated callers.
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
