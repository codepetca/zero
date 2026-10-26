# ZeroJams controlled preview pilot

Prepared 2026-10-25; activation subsequently authorized by the owner. Production
remains hidden regardless of flags or credentials. Local policy is `enabled` and
pinned to the approved origin. Preview revision `70de6ba8` is active; the
checkpoint below distinguishes verified hosted access from remaining pilot
acceptance.

## Activated controlled pilot — 2026-10-25

Owner subsequently authorized setup and activation for stewchan and armorup while
keeping production hidden. [Draft PR202](https://github.com/codepetca/zero/pull/202)
publishes the reviewed pilot; no main merge is part of activation. The activated
preview is READY at the protected
[pilot branch URL](https://zero-git-codex-zerojams-contr-11f1f5-stewarts-projects-cc2722c4.vercel.app/hub/jams).

The state-only pilot registry exists with orphan root `1709d161` and README-only
tree `7bff485a`. After the owner's action-time confirmation, the exact pilot OAuth
callback was saved alongside the two unchanged production callbacks, with wildcard
matching disabled. Dedicated App `codepet-zerojams-pilot-writer` (App ID `5470616`)
was created with only Contents write and Metadata read, then installed as
`175232591` on selected repository `codepetca/zero` only. Webhooks, device flow and
OAuth-on-install are disabled.

Seven settings now exist only in this branch's Vercel Preview scope: origin,
browser client ID, maintainer ID, writer App and installation IDs, a new sensitive
session secret, and a separately generated sensitive browser client secret. The
existing browser secret was retained. No production settings changed and no
plaintext secret was committed or logged; the temporary client-secret file was
deleted after successful storage.

The owner completed the writer-key download. The downloaded RSA public fingerprint
matches the newly registered key. A real App-authenticated installation check and
narrowed token mint passed, and the token successfully read the empty isolated
registry. The key was stored as a sensitive exact-branch Preview setting; no
intermediate plaintext copy was made. The owner's downloaded file remains local
with mode 0600. GitHub displays two key pairs; neither was revoked by this work.
Both branch-scoped enable flags are now set. All ten required settings are scoped
to Preview and this exact branch; no Production setting changed.

Live validation found the installation token uses GitHub's current stateless
format, which the original character whitelist rejected. The runtime now treats
it as opaque while preserving the installation prefix, printable-ASCII/header
safety and 1,024-character transport bound. Scope, expiry and repository checks
remain unchanged. Regression tests cover stateless punctuation, longer tokens,
caching, wrong types/prefixes, controls, whitespace and oversize rejection. An
independent Sol 6.1/high review found no blockers. See GitHub's
[stateless-token rollout notice](https://github.blog/changelog/2026-10-02-stateless-github-app-installation-tokens-rolled-out/).

The activation checkpoint `5059fd9c48f8059e01842898eacc25ff08b19b62` was READY
as Vercel deployment `dpl_BvRcpQGmS2FJrUNiF6HEKWDNrR2d`, attached to the exact
protected branch alias. In Chrome on macOS, signed-out access shows the invited
sign-in screen and the API reveals no records. Normal GitHub OAuth as `armorup`
returns to the pilot; the hosted API returns `configured:true`, `events:[]`,
`canMaintain:true` and `proposals:[]`. Signing out restores the invitation gate.
Creator `stewchan` also completed normal GitHub OAuth. Its hosted API returns
`configured:true`, `events:[]` and `canMaintain:false`. The preparation page loads
and the source-bound proposal controls are available, requiring its own public
repository and exact commit. No forged session or identity was used.

The preparation milestone passed 251 website tests and typecheck/build. The
session fix below passed its focused checks and production build; all 11 CI checks
passed on the lifecycle revision `f50942b0`; the recovery revision CI is recorded
below. Production was rechecked after deployment: all 13 canonical jam
route/method requests return 404, and `/hub` returns 200 without a jam link. Vercel
protection remains `all_except_custom_domains`; production branch remains `main`.
No main merge, production environment change or public activation occurred.

Registry build exclusion was owner-authorized after activation. The dedicated
state branch now contains only state, its README and `website/vercel.json`:

```json
{"$schema":"https://openapi.vercel.sh/vercel.json","git":{"deploymentEnabled":{"zero-jams-pilot-registry":false}}}
```

The configured project root is `website`; this configuration disables Git-triggered
deployments for only that exact branch. Main and source previews remain enabled.
No project-wide build setting, environment, production branch or protection was
changed. Guard commit `a39b3bdd` and follow-up README probe `5a4eb284` produced no
Vercel deployments in the observed window. Preserve the guard when recovering the
registry; never put it in the validated `jams/` event namespace. Removing only
this guard restores the old deployment behavior. See
[Vercel's branch configuration](https://vercel.com/docs/project-configuration/git-configuration).
The ignored-build-step alternative was avoided because canceled builds still
count against deployment/concurrency limits. After the probe, 24 durable event operations also produced zero registry
deployments. The Vercel list since the guard has one deployment: the expected
source-preview build for `f50942b0`, with no further pagination.

The live creator run found that preparation POST requests omitted the sealed
pilot session. They now use same-origin credentials for the two fixed relative
preview/ZIP endpoints, retaining redirect rejection and all server access gates.
The two-line fix passed 13 focused tests, a production build and an independent
Sol 6.1/high review (24 reviewer tests). Hosted preview/download acceptance now passes for both Game Jam and App Jam.

## Live lifecycle acceptance — 2026-10-25

Chrome on macOS, real GitHub OAuth for both invited accounts; no forged sessions,
clock overrides or participant-token substitution. The fixtures contain only
public test handles, source links and disposable descriptions. Their small HTML
demos verify source/demo delivery; this does not certify a Java/WebFX project.

| Event | Creator-owned source and website | Final official state |
| --- | --- | --- |
| Game Jam `jam-1433630157` | [Repository](https://github.com/stewchan/zerojams-pilot-game-20261025), [page](https://stewchan.github.io/zerojams-pilot-game-20261025/); initial `290b76cb`, update `864a17d6` | Approved updated deadline is in the real past; registration/submissions closed; participant left and entry withdrawn; five history versions retained |
| App Jam `jam-1433632489` | [Repository](https://github.com/stewchan/zerojams-pilot-app-20261025), [page](https://stewchan.github.io/zerojams-pilot-app-20261025/); initial `e4c617a4`, update `95d6e0d9` | Cancelled by armorup after lifecycle completion; one registered participant and final active gallery entry preserved; four history versions |

Observed acceptance:

- Both complete eight-file templates previewed and downloaded through the hosted
  creator form. Public repository bytes match the downloaded/customized files;
  all source assets and pinned Pages workflows are present. Both Pages workflows
  and hosted demos work. Two files initially entered empty through the browser
  editor were corrected before this byte verification; failed initial fixture
  workflow runs are retained in their repositories.
- stewchan proposed exact public commits; armorup independently approved both.
  Creator UI had no approval authority. Joining stayed disabled before current
  rule acknowledgment. Both types joined and submitted exact owned public source.
  An organization-owned repository was rejected without losing the form.
- Game entry replacement, participant withdrawal, resubmission, leaving and
  rejoining passed. Rejoining did not resurrect the entry. A further submission
  correctly hit the configured history-cap error; no cap was relaxed.
- Creator updates remained pending while accepted details stayed active. After
  independent approval, the App participant saw the changed-version warning and
  could not resubmit without a fresh acknowledgment. The Game's approved past
  deadline closed participation using the real server clock.
- App suspension closed both windows; resume reopened them. Maintainer entry
  withdrawal removed the gallery item while retaining registration. Corrected
  resubmission and replacement restored one entry with the exact update commit.
  Maintainer cancellation closed both windows, removed the App Jam from discovery
  and preserved its direct showcase. The App Jam filter then showed no listed events.
- With fresh acknowledgment, cancelled App replacement and deadline-closed Game
  joining remained disabled. Final Git records confirm 12 operations per event,
  creator/approver separation, retained history and the stated final states.
- Creator sites contain the actual event IDs and official pilot links. The
  protected-preview iframe is blocked in Chrome; no protection was weakened.
  Clicking the ordinary creator-page link opened authenticated official
  participation in a new top-level tab. Do not claim the iframe itself worked.

At lifecycle acceptance, all 11 checks passed on `f50942b0`. The session fix has a clean targeted
Sol 6.1/high review and production build; the registry exclusion has a separate
clean review. Final production checks: 13 jam route/method requests return 404;
`/hub` remains 200 with no jam link. Main, production settings and Vercel protection
remain held. Registry head at acceptance: `ce130103b5b84968c83982516104826c88a260a0`.

Both event slots are occupied by these closed, reviewable fixtures. They were not
deleted or silently reset. Preserve the guard and record history in any separately
chosen fixture cleanup. No real student event is admitted by these tests.
Ignored receipts/screenshots are in `.verification/zerojams-pilot/lifecycle/`,
including `final-receipt.json`, both final states, source hashes, CI and production
hold. Safari/mobile/school-network, a third real uninvited account, concurrency,
provider request/latency telemetry and agreed expansion cost thresholds remain
unverified; 24 durable operations and zero registry builds are not a free-tier or
large-scale capacity promise.

The fixed public policy is [jams/pilot.json](../jams/pilot.json). The service model
and existing local verification remain in [the plan](ZEROJAMS-PLAN.md) and
[operations guide](ZEROJAMS-OPERATIONS.md). This packet narrows the proposed hosted
pilot to one invited preview; it grants no production release authority.

## Failure recovery and concurrent writes — 2026-10-25

Reviewed code `791a8482`, deployed as preview `5059fd9c`, was checked against the actual service, source verifier,
GitHub storage adapter and transport using a loopback HTTP GitHub-contract fixture.
This uses real Node fetch, blob SHA comparisons, controlled PUT barriers, dropped
sockets, unreadable replies and actual abort timeouts. Dummy credentials and
fixture identities never reach GitHub or a hosted Zero service. Existing closed
pilot records were not reopened, reset or used for destructive fault injection.

The 24 HTTP integration cases verify concurrent users retain both records, the
last participant slot is rechecked after conflict, duplicate same-key submissions
commit once, changed payloads on the same key conflict, and separate submissions
both survive. Lost post-commit responses (socket, malformed JSON, wrong SHA and
timeout) recover the recorded result with the same operation ID, including after
source outage and deadline. Provider errors and pre-commit timeout do not report
success; bounded 409/422 retries stop without mutating state. Failed reads do not
become empty events. Approval, suspension, leave and deadline races recheck the
winning state; reverse ordering preserves the earlier accepted history.

Client-hook tests connect to the same real-adapter fixture for unreadable success,
`configured:false` and wrong-operation confirmation. Reload preserves the key;
retry records no second join. Existing double-click/in-flight suppression remains
covered. All barriers have ten-second test bounds to prevent a regression from
hanging CI.

One recovery gap was fixed: review and moderation reasons previously disappeared
on reload even while their uncertain operation keys survived. Public reason drafts
now use session storage scoped to account and exact proposal, entry revision or
moderation context. Confirmation clears only that original draft; a late response
cannot hide another account's active draft. Gallery summaries include the immutable
entry `revision` for this read-only context; mutation authority is unchanged.

**Historical finding (superseded by the reconciliation phase below): retry versus new intent.** The audit also
reproduces this browser sequence:

1. Join commits, but the reply is unreadable, leaving its key pending.
2. An authoritative read shows joined; the user subsequently leaves.
3. A later Join with the same payload reuses that old key.
4. The server correctly returns the historical joined result without undoing the
   later leave; the UI currently shows “Confirmed by Zero” while still left.

The characterization test documents this existing behavior; its passing status
is not a readiness sign-off. A dedicated pending-request resolution flow must
separate recovery of the old request from a new intent before a wider trial.
Do not resolve this by blindly generating a fresh key after an uncertain write,
which could create duplicate submissions. During this controlled pilot, resolve
unknown requests before attempting intervening changes. Production stays hidden.

Code checks: 105 jam tests, 258 website tests, typecheck and production build
pass. Independent Sol 6.1/high review reran 41 focused cases and found no remaining
issues in this bounded patch; the pending-intent limitation is deliberately open.
Hosted Chrome smoke on `5059fd9c` also verifies public reason text survives reload
and can be cleared without submitting; the gallery returns its immutable entry
revision. Registry head remains `ce130103b5b84968c83982516104826c88a260a0`. Production
13 jam cases still return 404, with Hub 200/no jam link. All 11 exact-head CI checks pass on `5059fd9c`.
Receipts are in `.verification/zerojams-pilot/recovery/verification.json` and the
ignored `recovery-*.log`/`reason-recovery-*.log` files. These deterministic checks
do not establish live GitHub contention performance, provider capacity, Safari,
mobile or school-network behavior. Cross-event admission remains the existing
advisory cap and must be serialized by the pilot operator.

## Observed audit, 2026-10-25

| Surface | Read-only evidence | Consequence |
| --- | --- | --- |
| Browser/desktop App | `codepet-zero`, App ID `5367740`, client ID `Iv23liWzC8OE2WN5f6qV`; Actions, Administration, Contents, Pages, repository creation, Starring and Workflows write; Metadata read | Existing broad desktop App is unsuitable as the dedicated minimal registry writer |
| GitHub repository | Public `codepetca/zero`, repository ID `1409613370` | Registry records, proposals and history must use public-safe test information |
| Normal registry | GET of `zero-jams-registry` returned 404 | No normal registry provisioned by this work; pilot uses separate `zero-jams-pilot-registry`, whose existence must be verified independently |
| App installations | CLI `/user/installations` returned 403 | Existing Codepet Zero installation/callbacks unknown; do not change credentials to work around this |
| Connector installation | `84608113` belongs to another integration | Never use it as evidence for Codepet Zero or as a registry writer |
| Vercel | `zero`, project `prj_b8dDCbuiF8uzVcXYMLghpWTAr4aA`, team `team_jKbtHZ7k3VeEdJKdqf2GOToE`, scope `stewarts-projects-cc2722c4`; root `website`, Node 22, production branch `main`; protection `all_except_custom_domains`, no custom environments | Preserve protection and production denial |
| Environment metadata | `ZERO_HUB_ORIGIN`, `ZERO_HUB_GITHUB_CLIENT_ID`, `ZERO_HUB_GITHUB_CLIENT_SECRET`, `ZERO_HUB_GITHUB_SESSION_SECRET` names exist only in production; no `ZERO_JAMS_*` names found | Preview is unconfigured; secret values were neither requested nor recorded |
| Account identities | `stewchan` numeric ID `35233916`; `armorup` numeric ID `4050555` | Creator/participant and independent approver respectively; no invitation is active |

This is a dated snapshot. A 403 is unknown access, not proof an installation is
absent. Public App metadata cannot establish private callback settings, private-key
validity, selected repository access or effective deployment behavior.

## Safe preflight

Use existing Node 22 and existing authenticated CLIs. No installation is needed.
From the repository root:

```sh
node scripts/zerojams-pilot-preflight.mjs --help
node scripts/zerojams-pilot-preflight.mjs
node --test scripts/zerojams-pilot-preflight.test.mjs
```

The default command reads only public `jams/pilot.json` and allowlisted process
environment presence/types. It does not read `.env`, private key files, credentials
or linked-project files, invoke CLIs, validate key material, mint tokens or fetch
secrets. It outputs JSON with fixed target metadata, checks and configuration
presence classifications; no environment values are printed.

Explicit read-only metadata refresh, using an already linked directory:

```sh
node scripts/zerojams-pilot-preflight.mjs --audit --project-dir /Users/stew/Repos/zero
```

After a dedicated writer App is separately approved and created, add
`--writer-app-slug <reviewed-public-slug>` to compare its metadata with
`ZERO_JAMS_APP_ID`. The tool does not create/select an App or configure anything.
`--project-dir PATH` defaults to this repository root. An unlinked worktree,
missing CLI, denied API or unsupported metadata shape produces `unknown`; the tool
never links, logs in or falls back to another credential. Unknown/duplicate flags,
missing arguments and unreadable policy produce exit 2. Blocked or unverified
readiness produces exit 1. Exit 0 is reserved for complete readiness; this
preparation tool always retains manual evidence gates, so cannot issue exit 0 or
certify live acceptance. `localConfigurationReady` is a configuration comparison,
not proof credentials work or authorization to activate.

The audit captures and filters subprocess output. It runs only these read-only
operations, with fixed repository/project targets and an optional validated slug:

```sh
gh api /apps/codepet-zero --method GET
gh api /repos/codepetca/zero --method GET
gh api /repos/codepetca/zero/git/ref/heads/zero-jams-pilot-registry --method GET
gh api "/repos/codepetca/zero/contents/jams?ref=zero-jams-pilot-registry" --method GET
gh api /apps/<reviewed-public-slug> --method GET
gh api /user/installations --method GET
vercel api /v9/projects/prj_b8dDCbuiF8uzVcXYMLghpWTAr4aA --method GET --scope stewarts-projects-cc2722c4 --raw --non-interactive
vercel env ls --cwd /Users/stew/Repos/zero --format json --scope stewarts-projects-cc2722c4 --non-interactive
```

Prefer the preflight's filtered JSON to raw CLI output. Environment metadata output
contains only allowlisted names and production/preview/pilot-branch scope booleans;
unrelated names, values and raw diagnostics are discarded. `/user/installations`
visibility is limited to its returned page/current identity: not seeing an ID is
unknown, never evidence of absence. Even a matching selected-repository installation
needs separate proof that `codepetca/zero` is selected. No token endpoint is called.

The namespace audit accepts at most two exact
`jams/jam-<positive-numeric-id>.json` file entries with valid Git blob IDs; source
files, nested paths, duplicate records and over-capacity listings are blocked.
An explicit structured HTTP 404 for the namespace means empty only after the
branch ref has been verified. CLI denial/unavailable status and unstructured error
text remain unknown; a missing branch is never inferred from them.

## Operator sequence and verification requirements

1. Review and authorize a single stable HTTPS Vercel branch origin for
   `codex/zerojams-controlled-pilot` in the fixed project. Record the exact origin
   in the policy; it must match `https://${VERCEL_BRANCH_URL}` and
   `ZERO_HUB_ORIGIN`. Do not use a transient deployment URL, custom production
   domain, wildcard host, path or arbitrary request-supplied origin. Keep
   `VERCEL_ENV=preview`, the exact project/branch gate and production denial.
2. Inspect the browser App's private callback settings. Add only the exact
   `<approved-origin>/api/hub/github/callback` after authorization; verify wildcard
   matching is disabled for that callback. Preserve existing required desktop and
   production callbacks. GitHub distinguishes user authorization callbacks from
   installation setup URLs and supports an exact-match mode; see
   [GitHub callback documentation](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-user-authorization-callback-url).
3. Separately authorize and create a dedicated registry writer App with only
   Contents write and Metadata read. Install it only on selected `codepetca/zero`;
   verify its App ID, installation ID, owner, active status and selected repository.
   Do not add registry duties or permissions to the broad desktop App. Provision
   the exact `zero-jams-pilot-registry` branch under explicit authorization and
   verify the expected ref. Provision a state-only branch with its own orphan root,
   never a branch copied from `main`: main already contains `jams/*.mjs` and
   `jams/pilot.json`, which the registry listing correctly rejects. Review its tree
   before activation: a minimal root README outside `jams/` is sufficient, and the
   `jams/` namespace must initially be empty (Git need not store an empty directory).
   Only accepted `jams/jam-<positive-numeric-id>.json` state files belong there later.
   No automatic Git write, branch creation or fallback to `main` or
   `zero-jams-registry` is permitted.
4. Supply preview-only, exact-branch-scoped server settings through the reviewed
   secret manager: `ZERO_HUB_ORIGIN`, `ZERO_HUB_GITHUB_CLIENT_ID`,
   `ZERO_HUB_GITHUB_CLIENT_SECRET`, a new unique `ZERO_HUB_GITHUB_SESSION_SECRET`,
   `ZERO_JAMS_APP_ID`, `ZERO_JAMS_INSTALLATION_ID`, `ZERO_JAMS_PRIVATE_KEY`,
   `ZERO_JAMS_MAINTAINER_IDS=4050555`, `ZERO_JAMS_ENABLED=1` and
   `ZERO_JAMS_PILOT_ENABLED=1`. Retain the shared browser App's pinned client ID;
   the dedicated App is the server writer. Do not copy production session keys,
   dump values into logs, pull secret files or configure unscoped preview variables.
5. Preserve Vercel protection. Verify both approved accounts can enter the preview
   through ordinary protected access before testing GitHub sign-in. Vercel access
   and GitHub invitations are separate gates. No bypass link/token, protection
   exception or disabled protection is part of this packet. Vercel documents its
   account/access flow in [Vercel Authentication](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication).
6. After source review and explicit deployment/configuration approval, change the
   policy from `prepared` to `enabled` with the approved origin and deploy only the
   permitted preview. Recheck effective policy, secret scopes, protection and the
   negative cases below. A changed environment affects new deployments; retain a
   rollback plan covering previously active deployments as well.

The two fixed invitations are `35233916` and `4050555`; creator `35233916` may
propose and participate, while maintainer `4050555` reviews/approves. Invitation
alone grants no maintainer authority, and creator self-approval is forbidden.
Caps are 2 events, 5 participants per event, 200 ordinary operations, 7 reserved
safety operations, 10 proposals and 5 entry-history versions. The global event cap
is advisory across simultaneous creations; serialize pilot event admission and
verify the current count. Safety capacity is finite. Only the reviewer can spend
reserved moderation capacity.

The Git repository is public even when Vercel/application access is invited.
Use disposable public test events, handles and public source repositories; never
put private rosters, email, student numbers, secrets or sensitive review text in
records. Withdrawal cannot erase Git history.

## Acceptance record required before any expansion

Record exact deployed revision/origin, effective flags/policy, actor IDs, registry
branch, browser/OS and each observed result. Never record token/key/session values.

- Complete creator template download/customization, source-bound proposal,
  independent maintainer approval, discovery, join/rule acknowledgment, exact-commit
  submission, gallery, update, withdrawal, closure and safety moderation with the
  two approved accounts and disposable public data. Cover both Game Jam and App Jam.
- Confirm signed-out users receive a neutral top-level sign-in link without event
  or proposal reads. Test an uninvited account, removed invitation, creator trying
  approval, forged roles, stale/CSRF requests, wrong parent origin and forged embed
  messages. All must fail closed without durable unauthorized changes.
- Confirm production pages/APIs/panels/template ZIP remain hidden even with flags;
  reject other preview branches/projects/origins, prepared/disabled policy, absent
  writer configuration, missing registry, broad/mismatched App, inaccessible
  installation and unavailable GitHub. Verify no participant-token fallback.
- Exercise duplicate/concurrent actions, timeout after commit and same-operation
  retry, before/at/after deadlines, changed-rule acknowledgment, suspension races,
  quotas and reserved safety capacity. Verify durable state before displaying
  success and preserve drafts on failures.
- Test creator-hosted embeds plus top-level fallback in Safari and another browser,
  mobile/desktop, keyboard and the intended school network. Third-party frames may
  lack SameSite=Lax cookies: retain Lax/HttpOnly/Secure, show neutral official-page
  links and finish authentication/actions in a top-level official page. Do not
  loosen cookies or expose participant credentials to creator HTML. Record where
  Vercel protection blocks framing; do not bypass it to make an iframe work.
- Measure requests and GitHub calls/writes per action, conditional conflicts,
  end-to-end latency, cache freshness, storage growth, failures and maintainer time.
  Agree provider cost/usage stop thresholds before expansion; no free-tier promise.

Passing local tests and preflight presence checks do not satisfy this live record.
The two-account Chrome lifecycle above is verified. The additional expansion
checks listed above, including Safari and provider cost thresholds, remain open.

## Rollback and incident stop

The proposed authorized emergency stop is to disable `ZERO_JAMS_PILOT_ENABLED`
(and `ZERO_JAMS_ENABLED` for the service), deploy the disabled policy, and verify
all pilot endpoints stop reads/writes. Use the deployment platform's authorized
stop/access controls for any older active deployment: changing an environment
variable alone does not revoke an old deployment's captured configuration.
Verify no reachable deployment can still write before declaring the stop complete.
Keep production denied and deployment protection intact. Preserve registry Git
history, exact commits and sanitized incident evidence; do not delete records,
rewrite history or move writes to a different branch. Suspend/cancel an event
through reviewed controls when service access is safe and safety capacity allows.
Credential revocation/rotation or repository changes require their own applicable
authorization. Resume only after cause review, permission verification, fresh
negative checks and owner approval.


## Pending-request reconciliation — 2026-10-25

Owner authorized fixing the lost Join reply → Leave → Join bug, with production
hidden. The client keeps uncertain request details and the original operation ID
in session storage and shares a lock between controls for the same account and
endpoint within a tab. Another payload cannot pass that unresolved request.
“Resolve earlier request” retries the saved payload independently of a disappeared
button/form, then reloads the current event details. Only a confirmed operation
clears its key; a later new action gets a new key. Existing pending keys restore
without migration, one at a time. Requests contain public form fields only; no
credential is persisted. Changing accounts hides the other account's pending
request and feedback immediately. Existing server idempotency is unchanged.

A first explicit application 4xx rejection permits correction. An error while
recovering an unknown result retains the old key: sign back into the same account
or restore service availability and resolve again. There is deliberately no
“discard unknown request” action. If an uncommitted request becomes permanently
invalid (for example a deadline expires), this conservative flow may remain
blocked; stop that pilot action and have the maintainer investigate. A future
durable server rejection/fencing protocol would be needed to abandon it safely
while an old request might still commit. This is a remaining wider-trial limit,
not permission to clear browser keys or claim the unknown request failed.
Session storage and locks are tab-scoped; this does not serialize separate tabs
or devices. Server CAS/idempotency still protects shared records.

The actual participation component and hooks run against the loopback GitHub
HTTP fixture: Join commits but its reply is unreadable, reload reads joined and
removes the Join button, Leave is blocked, the recovery control confirms the old
Join, Leave commits, and the next Join commits with a different operation ID.
There are exactly three commits for the three intents; recovery adds no commit.
Additional cases cover legacy pending keys, queued old unknowns, first rejection
versus uncertain retry, shared locks, actor changes and late confirmation.

Local checks:111 jam tests,264 website tests, typecheck/build pass. The initial
full website run exposed a test synchronization race; one correction now awaits
caller refresh completion rather than the shorter mutation lock. Sol6.1/high
review covers170564eb→671dc0aa and targeted test correction671dc0aa→9dec4f1e,
plus9dec4f1e→d5a60666, with no unresolved findings (3 reviewer turns,2 fix
batches). Original-button retries now explicitly say the earlier request was
confirmed too: another-device Leave remains in force after historical recovery;
a subsequent new Join gets a fresh key and commits. The added HTTP regression
passes. Actual Chrome running
the real React component against the loopback fixture independently completes
the requested sequence, including reload/disappeared Join button, blocked Leave,
exact recovery and final registered state. Receipt:pending-browser/receipt.json
and final-joined.png under ignored .verification/zerojams-pilot. macOS Chrome
desktop was exercised; Safari/mobile/zoom/school networks remain unverified.
Protected preview67221e75 deployed successfully; read-only Chrome smoke restores
a legacy request on official and participation pages without sending it. All13
production jam cases404 and Hub200/no jam link. Registry head remains unchanged.
The recovery notice/revision wraps in a320 CSS px content column (desktop
viewport, not a physical mobile test). Final reviewed source `d5a60666` is deployed in `70de6ba8` as
`dpl_3po4TiFqJSx4JqemyqLm1UnctNTv`. All11 exact-head CI checks pass. Final
hosted read-only smoke and production hold pass again. The registry is unchanged.
Final ignored receipt: `.verification/zerojams-pilot/pending-verification.json`.
Closed live fixtures and registry branch are preserved. No main merge or production rollout is authorized.


## Durable unknown-request settlement — 2026-10-25

Owner authorized safe settlement/recovery with production hidden. Local candidate
adds Close earlier request: accepted result wins or a durable not-applied fence
wins; no uncertain key is simply discarded. Every hosted mutation uses an atomic
Git branch transaction across event records and global rejection ledger. Proposal
requests with no verified numeric event ID can therefore be closed safely.

Migration plan is prepared, not applied: branch zero-jams-pilot-registry at
ce130103b5b84968c83982516104826c88a260a0; event blobs da80b9e90e7ede6fa2b217addda0f8d544e2661f
and4c4d7639b8f3d1637604acfdcaabca77bf4837ec; guard44b8ccc2c1613f96ecc1c434ed0232f32a4c726f.
The explicit operator migration pins that planned head through publication and
aborts on drift/conflict. It copies them unchanged into zero-jams-v2/events,
adds the bounded ledger and replaces the legacy jams directory with an exact
protocol marker. The old namespace never supplies v2 authority. If an unexpected
legacy write recreates that directory, the missing marker halts v2; no data is
imported. Provider-specific parent-file behavior is not claimed as verified.
GitHub [trees](https://docs.github.com/en/rest/git/trees) and
[non-forced ref updates](https://docs.github.com/en/rest/git/refs) define the new
commit mechanism. Its sibling conflicts are exercised by the loopback fixture.

All154 jam/272 website tests and typecheck/build pass locally. Tests include
both race orders, paused proposal/submission source verification, no fake event,
missing events, lost socket/malformed/timed-out close replies, capacity separation,
malformed state, current identity/CSRF, cross-scope key reuse, older-client409
terminal response, and retained close intent after reload. Global event admission
is now atomic in the hosted adapter; the older advisory-cap statements above
belong to the retired per-file implementation.

Actual React/Chrome local fixture: uncommitted Join loses reply, expires, normal
retry409 retains it, Close writes fence but loses reply, reload resumes closing
after eligibility reopens, terminal outcome clears the key, fresh Join commits.
Receipt:1 fence+1 fresh Join,2 commits, final joined; original/recovery IDs match,
new Join differs. Real320/390px viewports have no horizontal overflow; Tab/Enter
reaches/activates Close. Physical mobile/WebKit/zoom/school networks remain open.
Ignored evidence: settlement-browser/receipt.json, screenshots and settlement-*.log
under .verification/zerojams-pilot.

Two independent reviews of5117611d completed: Astra/high correctness/security
and Sol6.1/high compatibility. Three deduplicated P2s were accepted: enforce
planned head through actual migration publication, allow bounded close-wrapper
overhead for valid near16KiB multibyte forms, and persist close mode atomically
with its key (block dispatch on storage failure). One remediation batch adds
regressions for all three. Read-only preflight also recognizes/pins v2 namespace
metadata so migration does not leave a false legacy-layout audit failure.
Astra/high targeted5117611d→04da7ce1 passes all16changed files and8independent
regressions. Corrected full154jam/272website/7preflight/typecheck/build and real
Chrome same lost-close flow pass. No unresolved review findings.
NEXT: protected Preview deployment, explicit migration, settle the existing legacy
test request without changing either closed event, verify production15jam404/
Hub200/no jam link and exact-head CI. No main merge or production rollout.

Integration update —2026-10-26: current main d5c01bb1 advanced while this phase
was in progress, causing CURRENT/EVIDENCE conflicts and withholding PR CI.
Integration10150f20 preserves both evidence histories and incoming approved
legal/beta/Git-flow changes; settlement source is unchanged. Sol6.1/high integration
review is clean (20focused checks). Refreshed154jam/275website/7preflight/
typecheck/build pass. The exact source for the reviewed settlement is still
04da7ce1; deployment/migration/CI receipt follows.
