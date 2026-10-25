# ZeroJams controlled preview pilot

Prepared 2026-10-25; activation subsequently authorized by the owner. Production
remains hidden regardless of flags or credentials. Local policy is `enabled` and
pinned to the approved origin. Preview revision `3c68f391` is active; the
checkpoint below distinguishes verified hosted access from remaining pilot
acceptance.

## Authorized activation in progress — 2026-10-25

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

The reviewed activation revision `3c68f39100f9722fb6c42ae480c0c3fb13a687ce` is READY
as Vercel deployment `dpl_6hfCqZG9HXDKNtZA1fV9tcnz3w8S`, attached to the exact
protected branch alias. In Chrome on macOS, signed-out access shows the invited
sign-in screen and the API reveals no records. Normal GitHub OAuth as `armorup`
returns to the pilot; the hosted API returns `configured:true`, `events:[]`,
`canMaintain:true` and `proposals:[]`. Signing out restores the invitation gate.
Creator `stewchan` is invited in the policy, but its fresh GitHub sign-in requires
owner authentication and remains pending. No forged session or identity was used.

All 251 website tests, typecheck and production build pass. Exact-head CI is
running. Production was rechecked after deployment: all 13 canonical jam
route/method requests return 404, and `/hub` returns 200 without a jam link. Vercel
protection remains `all_except_custom_domains`; production branch remains `main`.
No main merge, production environment change or public activation occurred.

Cost observation: creating the state-only registry branch triggered an automatic
Vercel build attempt, which failed because that branch intentionally has no site
source. Before repeated event writes or expanding the pilot, exclude that branch
from deployment triggers under a separately reviewed configuration change. This
activation did not alter the project's shared build settings or make a free-tier
cost claim.
The fixed public policy is [jams/pilot.json](../jams/pilot.json). The service model
and existing local verification remain in [the plan](ZEROJAMS-PLAN.md) and
[operations guide](ZEROJAMS-OPERATIONS.md). This packet narrows the proposed hosted
pilot to one invited preview; it grants no production release authority.

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
Hosted approver sign-in and registry reads are verified above. The full event
lifecycle, creator sign-in, Safari acceptance and provider cost results remain
unverified.

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
