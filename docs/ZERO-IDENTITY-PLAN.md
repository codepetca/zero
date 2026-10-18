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
all repositories. The new-project flow should collect the scaffold, name,
visibility and location, create under the connected personal account, then clone
and open the verified repository. Existing repositories require explicit access.

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
| Read/update Pages deployment configuration | Pages write; first-time site creation has a separate limit below |
| Star/unstar as the connected user | Starring user write |
| Repository deletion/transfer, organization management, secrets | Not requested |

First-time Pages site creation currently requires both Pages write and
Administration write. Omit Administration from the default grant. Preserve the
existing action-required path: enable GitHub Actions as the Pages source on
GitHub, then return and recheck. This is a deliberate UX/security tradeoff;
initial publication must not silently broaden access or change visibility.

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

Desktop uses GitHub device flow with expiring user access/refresh tokens stored
as one versioned secret in VS Code SecretStorage. Current GitHub supports
secretless refresh for tokens originally issued through device flow. No client
secret/private key ships in the extension. Register Zero's own supported
provider ID; do not repurpose Microsoft's built-in github provider. Replace
Zero's broad repo/workflow OAuth requests and do not fall back to them silently.

Keep the existing capture/assert-current/synchronous-before-dispatch contract.
Invalidate pending operations on account/token/session/installation changes.
Serialize refresh across extension hosts/windows using an owned local lock with
bounded, conservative recovery; a per-window promise alone is insufficient.
Reread the secret after uncertain outcomes before offering reconnection. Do not
blindly retry a consumed rotating refresh token. Sign out clears only Zero's
session and preserves local work and other extensions' accounts.

A pinned, public App configuration must be packaged with Zero and checked against
GitHub's public App metadata. Until owner activation supplies the real reviewed
App ID/client ID/slug, the development connection is honestly unconfigured.
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
shared configuration, device provider, local refresh locking, selected-repository
access, create/clone/recovery and publishing commands are integrated in source.
Focused lifecycle, repository, UI and transport checks pass. The updated website
has148passing tests, typecheck and production build; root configuration checks
pass. The initial full extension suite passed575with one existing skip. Two independent
reviews completed and identified six accepted fixes: request budgeting, immutable
repository/installation binding, numeric publication shortcuts, cancellable project
operations, retrievable sign-in codes and explicit safe lock repair. One batched
remediation is undergoing targeted review and final regression checks. PR102's original four CI checks are baseline coverage only; the new source
has not been pushed. Mac native UI smoke is unavailable while the computer is
locked. No live App, credentials, GitHub write or native release was created.

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
