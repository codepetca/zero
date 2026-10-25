# Zero GitHub identity plan

## Goal and decisions

Owner authorized planning and orchestration on 2026-10-18 after reviewing the
ZeroHub stars draft. Zero uses GitHub as its identity provider and one public
Codepet-owned GitHub App. Owner explicitly chose **one App** after the tradeoff
between one authorization relationship and separate website permissions was
explained. There is no new student password or second identity vendor.

Students sign in for GitHub development features. Existing local projects keep
Run/edit/files available offline. Browsing lessons, downloads and ZeroHub games
remains public. Students own their repositories and submit links separately in
Pika. Ordinary Java, the current minimal sidebar and deliberate Publish remain.

Installation defaults to **selected repositories**, with the App automatically
receiving access to repositories it creates. Never require or silently select
all repositories. The new-project flow collects the scaffold, name and location,
creates a public repository under the connected personal account, then clones
and opens the verified repository. The created source and included files are public.
Existing repositories require explicit access and keep their visibility.

One App does not mean one reusable token or automatic shared browser/editor
sessions. Both surfaces bind to the immutable GitHub numeric user ID; usernames
are display data. Desktop and browser have separate credential families so that
one surface's token rotation does not invalidate the other.

## Trust and permissions

| Capability | Proposed App permission / boundary |
| --- | --- |
| Read identity and public metadata | Implicit public access; Metadata read |
| Create personal repositories and tutorial copies | Repository creation write, not Administration |
| Clone, commit/push and temporary release staging | Contents write on permitted repositories |
| Install/update Zero's publishing workflow | Workflows write on permitted repositories |
| Dispatch and inspect the existing publishing workflow | Actions write on permitted repositories |
| Read existing Pages / create a missing workflow site | Pages read / Pages write + Administration write for first setup |
| Star/unstar as the connected user | Starring user write |
| Repository deletion/transfer, organization management, secrets | No Zero operation; Administration grants broader repository capability but Zero exposes no such mutation |

First-time Pages site creation currently requires both Pages write and
Administration write. The owner requested automatic first-time setup on2026-10-21
and allows the required permission change. The source accepts the previous exact
grant or that grant plus Administration write, and checks installation approval
only when creating a missing workflow site. It never converts an existing site,
changes a custom domain or changes repository visibility. Permission approval
remains GitHub's native installation flow.

Rollout order: review and release the compatible native source first, then
explicitly approve changing the App registration to Administration read/write.
Mac0.5.43 and older pin the former exact permission set and require updating
before that registration change. Existing installations must approve GitHub's
new grant before automatic setup works; existing-site deployment can continue
without it on the new client. The live App permission has not yet been changed
by this source implementation. Administration is a broad GitHub permission even
though Zero uses it only for first-time Pages creation.

An ordinary web-flow user token can carry the App/user intersection of these
repository permissions after the user installs the App. The owner selected this
one-App trust boundary. Restricting routes limits current ZeroHub behavior, but
does not make those credentials star-only against a malicious website owner.
Do not keep the draft's star-only credential claim once native permissions are
configured. GitHub selected-repository access limits unrelated private-repo
exposure; it does not prohibit misuse within the granted projects. App owners
can also mint installation keys later. No App private key or installation-token
service is needed or deployed for the planned local user-token implementation.

Explicit GitHub permission-scoped user tokens exist, but cross-owner starring
and descendant-token refresh/revocation need real proof before using them as a
boundary. OAuth scopes and an unchecked repository_id parameter are not a
substitute. Downscoping is optional later hardening, not a prerequisite used to
claim that the initial design has narrower authority than GitHub grants.

## Architecture

### Browser-only new desktop sign-in — local implementation, 2026-10-25

New desktop connections use browser authorization: click Sign in to GitHub,
open GitHub's authorization page, then return to Zero automatically. No code
option or device fallback is offered. Browser failures leave sign-in available
to retry and local running usable. Existing device-issued sessions retain their
renewal path; published downloads keep their bundled behavior until the next
authorized release. GitHub may still require account selection, password/passkey
or two-factor authentication.

Implemented locally with a separate first-party desktop broker. GitHub's App web
flow requires a server-held client secret for code exchange and refresh, even with
PKCE. A per-flow sealed intent, state/HttpOnly cookie and desktop-held PKCE verifier
bind the handoff to a temporary IPv4 listener. The return contains only an OAuth
code and two-minute sealed delivery; GitHub enforces one-use codes. The server
returns tokens only through no-store POST responses and does not persist them.
SecretStorage records the issuing flow; existing device sessions retain their
secretless renewal route and browser sessions renew through the broker.
Cancellation, account/session drift and multi-window refresh guards remain.

The broker is disabled unless explicitly enabled with matching server credentials.
The fixed callback needs a separately approved App configuration change. See
[activation requirements](DEVELOPMENT.md#desktop-browser-sign-in-activation-separate-from-publication).
Controlled local tests do not establish deployed GitHub/editor acceptance. No
deployment, App configuration change, new permissions or release is authorized.

References: [GitHub App authorization](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)
and [refresh requirements](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens).

### Current implementation

Desktop uses browser authorization for new connections, without a code option,
with expiring user access/refresh tokens stored as one versioned secret in VS Code
SecretStorage. Browser-issued tokens use the server for refresh; device-issued
tokens keep GitHub's secretless refresh route. No client
secret/private key ships in the extension. Register Zero's own supported
provider ID; do not repurpose Microsoft's built-in github provider. Replace
Zero's broad repo/workflow OAuth requests and do not fall back to them silently.
Zero's first-party commands call their owned provider directly, retaining the
shared guarded authentication facade. This avoids the host's redundant request
to share Zero's own session with Zero. Keep provider registration for Accounts
and third-party consumers; never change host trust or consent settings. Silent
reads cannot start device authorization, and only explicit sign-in can create a
session. Both authorization methods use the same secure credential lifecycle.

Keep the existing capture/assert-current/synchronous-before-dispatch contract.
Invalidate pending operations on account/token/session/installation changes.
Serialize refresh across extension hosts/windows using an owned local lock with
bounded, conservative recovery; a per-window promise alone is insufficient.
Reread the secret after uncertain outcomes before offering reconnection. Do not
blindly retry a consumed rotating refresh token. Sign out clears only Zero's
session and preserves local work and other extensions' accounts.

A pinned, public App configuration must be packaged with Zero and checked against
GitHub's public App metadata. The owner-approved public registration is now pinned: App5367740, client
`Iv23liWzC8OE2WN5f6qV`, slug`codepet-zero`, owned by`codepetca`. The approved test installation selects one private repository. Native user
authorization, private clone and upload passed; remaining acceptance and
production/native release gates are pending.
Workspace settings cannot redirect credentials to another App or origin.

Zero's explicit clone/new-project commands use guarded authenticated Git clone.
Reuse exact-destination transient headers, helper/hook/trace isolation, no URL
rewrites/redirects, no token URL/argv/logs, and a newly reserved destination.
Preserve partial work and a remote repository when creation succeeds but cloning
fails. Built-in Git remains useful for local status/conflicts; its general
network commands must not be described as automatically sharing Zero credentials.

Website retains the reviewed OAuth state/PKCE, fixed callback, CSRF/Origin and
HttpOnly/Secure cookie boundaries from PR102. It uses the same App and immutable
user identity. The current draft has an eight-hour reconnect policy. Persistent
browser refresh needs a defined cross-instance rotation/session design and is
its own phase; do not add a speculative database or promise indefinite login.
The first shared-identity milestone does not transfer native tokens through the
website or put bearer credentials in URLs. A seamless browser/editor pairing
would need a separate one-use, challenge-bound, atomic exchange design and proof.

## Execution phases and exit evidence

| Phase | Work and ownership | Exit evidence |
| --- | --- | --- |
| 1. Freeze contracts | Coordinator integrates native/security investigations, owner one-App choice, permission matrix and source config/session contracts. | This plan, exact file ownership, no unresolved authority assumptions. |
| 2. Native connection foundation | Auth worker: device flow, secure storage, refresh locking and Zero provider; coordinator integrates pinned public config/API façade. | Focused lifecycle/security tests: cancellation, slow_down, expiry, restart, multi-window refresh, uncertain outcomes, account switch and no secret leakage. |
| 3. Projects and publishing | Repository worker: create/template/access/clone; publishing worker: capability-based authorization; coordinator owns extension UI wiring and docs. | Selected/denied/new repository contracts, safe clone, creation response loss/retry recovery, existing upload/merge/share/publish regressions; no repo/workflow fallback. |
| 4. Website integration | Website owner/coordinator: shared App terminology/config, identity consistency and usable session recovery; decide persistent refresh separately from the native foundation. | Public browse/Play, inline stars/reporting, same numeric account, errors/logout/expiry; no unproven shared-session claim. |
| 5. Integration and review | Coordinator plus two independent high-risk reviewers, security/correctness and compatibility/UX. | Fixed-head relevant full checks; actual Mac/editor/browser evidence; explicit Windows/Safari gaps; bounded remediation; no unresolved blockers. |
| 6. Owner activation and acceptance | Present exact public App permissions/config/source and release/production changes for owner approval, then perform only the approved setup. | Actual selected-repo install incl. first-time empty account, create/private clone/upload, token refresh/revocation, two-account drift, Pages fallback/repeat publish and ZeroHub stars. Verify CI, merge/deploy and any separately authorized native release. |

Phases 2 and bounded phase3 modules can proceed independently after the shared
interfaces are frozen. One writer per component; coordinator owns extension.js,
configuration, docs and integration. No later milestone is complete merely
because a module or PR passes tests. Provider-dependent behavior stays unproven
until the owner-approved sandbox/real acceptance.

The one-App decision supersedes the earlier pending star-only App activation
proposal. PR102 remains draft and unactivated. Source edits/local commits and
mocked tests are authorized by this goal; new external permissions, secrets,
production changes and publication require the concrete approval gate above.
No new chat, scheduler or tool-backed goal is created merely to orchestrate.

## Current state and receipts

Planning investigations and native modules completed from base4fbcfe2. The
shared configuration, device provider, refresh locking, selected-repository
access, create/clone/recovery and publishing commands are integrated. Two initial
reviews found six accepted issues, fixed in one batch; targeted security and
cumulative compatibility reviews found no unresolved source blockers at1548a0e.
The public registration pin a11d982 passed a separate targeted review.

Live Mac acceptance found current desktop VS Code exposes local extension
storage as authority-free vscode-userdata. Fix8ed733a accepts its absolute host
path while preserving the same filesystem locks and rejecting remote authorities
and relative locations. A cross-scheme contention regression and26focused tests
pass; independent targeted compatibility review is clean. Full extension tests:
598total,597passed, one existing skip. Root checks pass. Unchanged website tests
148passed, typecheck and production build remain valid. Six reviewer launches and
two fix batches completed within the original source review budget.

Owner-approved registration and selected installation completed. After explicit
confirmation of the final user grant, Chrome reported the device connected and
Zero showed the expected account. Real guarded private clone opened the expected
repository/main branch, and Zero Commit & push uploaded an acceptance-test file;
GitHub confirmed the commit and the local tree is clean. This used a separate
Mac development host/profile, not a released kit. No production credentials,
client secret, private key, merge, deployment or native release was created.

PR102 remains draft. All five checks passed at a11d982; CI for8ed733a is running.
Remaining acceptance includes empty-account initial installation/App-created
repositories, refresh/revocation, account drift, Pages/browser stars and physical
Windows/Safari. Source review, registration and native transport evidence do not
complete production activation or release acceptance.

Runtime receipts and worker/review budgets: `.verification/zero-identity/plan.json`.
The coordinator updates the operative state in `.ai/CURRENT.md`. Weekly allowance
56% remaining at phase start is account-wide, not this task's usage. Storage
check healthy~310GB. DeepSeek automatic delegation is paused through2026-12-31.

## Primary capability references

- [GitHub App permissions](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app)
- [Repository creation improvements, 2026-10-13](https://github.blog/changelog/2026-10-13-github-app-improvements-for-least-privilege-and-management/)
- [Device and web user-token flows](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)
- [Refresh rotation and device-flow exception](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens)
- [Permission-scoped user tokens](https://docs.github.com/en/rest/apps/apps#create-a-scoped-access-token)
- [Pages creation permission](https://docs.github.com/en/rest/pages/pages#create-a-github-pages-site)
- [VS Code authentication and SecretStorage](https://code.visualstudio.com/api/references/vscode-api)

## Registration acceptance — 2026-10-18

Owner approved registration and draft publication, then explicitly approved a
private test repository and installation limited to it. Chrome owner confirmation
completed as`armorup` (numeric4050555). Registered public Codepet Zero under
`codepetca` (owner116690057); public API and the real verifyApp implementation
confirmed exact App identity and all seven reviewed permission entries. Callback
is the exact production URL; wildcards/hooks/events disabled, expiring user tokens
and device flow enabled. The registration banner mentioned a private key, but
installation completed without generating one. No client secret, private key or
production credentials were created.

One private template repository was created with owner authority. The test
installation selects that repository alone; exact IDs remain in ignored receipts. The
installer explicitly requires at least one repository for selected access, so
empty-account onboarding remains an acceptance gap. No all-repository grant.

Native source configuration now uses the verified public IDs. Unit activation
fixtures inject supported providers instead of relying on an unconfigured
release. Config/website tests pass; full extension597pass/1skip and website148pass
remain green after the pin. The pin passed independent review and was pushed to draft PR102. Native
device authorization, private clone and upload subsequently passed as recorded
above; remaining acceptance and activation gates still apply.
