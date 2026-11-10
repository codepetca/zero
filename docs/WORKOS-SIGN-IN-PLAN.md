# WorkOS shared sign-in implementation

Goal: require GitHub sign-in on first Zero use, recognize the same managed
account on web and in VS Code, and permit previously connected users to work
locally offline. Installers remain ungated. Existing GitHub App publishing,
Git sidebar and user projects must continue to work.

Work in this branch is local and opt-in until the complete integration is
ready. The separate `shared-signin-main-20261108` worktree contains the earlier
custom approach and must be preserved. The existing tool-backed goal describes
the same outcome but is marked blocked; it cannot be reactivated or rewritten
by this tool. This plan records the selected managed-auth approach.

## Phases and acceptance

1. **Managed identity:** introduce a WorkOS-hosted GitHub-only web session and
   a separate VS Code public-client sign-in with secure local storage. Fail
   closed in enabled mode; preserve current behavior when not configured. The
   staged prototype showed matching WorkOS accounts on both surfaces, and an
   editor reload retained its local record. Integrate and test the real paths.
2. **First-use and offline access:** ensure every student project entry and
   native Run path observes the first-use requirement, without blocking Stop or
   help. After a successful connection, local open/edit/Run must work without
   network even if online sessions expire. Existing GitHub tokens or unverified
   user-entered identifiers must not establish a new WorkOS connection.
3. **GitHub identity and existing services:** keep the current Hub and GitHub
   App operations working while designing a verified binding between WorkOS
   and the immutable GitHub identity. Never link by email or login name. Test
   WorkOS GitHub App token delivery and permissions before connecting accounts
   or migrating any existing user data. Listing and Pro data are future work;
   neither a local receipt nor an unverified pairing grants entitlements.
4. **Validation and cutover:** test first sign-in, account selection and
   cancellation, restart and disconnected local Run, Hub and publishing,
   real browser/editor, and Windows. Review source and dependencies, document
   recovery, privacy and release configuration, and make a coordinated
   production activation plan. Do not publish, deploy, merge, or change
   credentials without the required explicit authority.

## Current implementation boundary

Local implementation (2026-11-09): opt-in website account routes and an editor
first-use gate have been added. When configured, both require WorkOS to report
the GitHub authentication method; if that optional provider field is absent,
the attempt fails closed. The opt-in website callback now uses a server-side
GitHub binding helper and ties Hub, Stars and Jams access to the WorkOS session;
its tests use synthetic provider responses. The website, GitHub App and editor
have not been verified together against the actual GitHub App, and the gate is
not enabled by default. Opening GitHub-account-keyed recent projects remains
online-only until the editor identity binding is established; Open Local is available.

Staging update: the user authorized and the isolated WorkOS staging app now
has the local website callback registered. Local `/zero-account` returned 200
without browser cookies; the existing Chrome profile received HTTP 431. In a
clean browser the user reached GitHub but reported a GitHub error page before
returning to the website. After signing into GitHub in the Incognito browser,
the user reported successful sign-in to the local Zero website. This and the
earlier standalone prototype used WorkOS demo credentials, not the production
GitHub App; no live Hub token binding or publishing is established. Subsequent
focused website tests passed 54/54 and typecheck passed. Four Hub discovery
tests cancelled in an isolated run; they remain unresolved.

The user reported a successful real GitHub sign-in from the actual Zero
extension in an isolated development host. That host used the default VS Code
profile and showed a confusing Copilot sign-in screen. Zero's supplied profile
sets `chat.disableAIFeatures` and `workbench.startupEditor` to suppress that
experience; the user reported that the Copilot screen was gone in a fresh host
seeded with those settings. This was a VS Code development host, not an
installer acceptance test. Native Zero offline Run and actual GitHub App access
remain untested.

The local WorkOS identity is separate from the GitHub App authorization used
for Git operations. Until the account binding is verified live, a WorkOS
login alone does not prove access to a GitHub repository or an existing ZeroHub
account. The staged prototype uses WorkOS demo GitHub credentials. Provider session expiry must not invalidate
the local first-use receipt during an offline session. The local receipt is not
a tamper-proof licence and cannot enforce immediate offline revocation.

## Rollout preparation update

On 2026-11-10 the candidate was integrated onto `cd9d4a621` after the
0.5.67 release; the next local kit is 0.5.68 and the published 0.5.67 kit and
installers remain unchanged. Partner Center showed the 0.5.67 Store package as
live; actual updates on individual devices were not checked. The local editor
candidate binds the WorkOS identity to the numeric GitHub identity for GitHub
operations and retains offline local use for existing receipts. Focused tests
and independent reviews cover the new binding; its shared lock coordinates only
cooperating windows in the same local storage domain. Production delivery of a
GitHub provider token in the WorkOS public-client response remains unverified.
The full website suite passed 768 tests with two skipped. The full extension
suite initially encountered outdated development-host fixtures and is being
updated and rerun. No sign-in candidate has been pushed or deployed.

On 2026-11-09 the candidate was integrated without textual conflicts onto
`23b9a1249` (Git workflow PR #299) in worktree `workos-after-sync`, branch
`codex/workos-after-sync`. Four Git-flow test fixtures were adjusted to identify
their mocked host as a development host; installed-mode sign-in remains required.
Focused first-use and UI checks reported 222 passed and 12 skipped; real Git and
ledger checks reported 35 passed and 7 skipped. Configuration and whitespace
checks passed. The changes are uncommitted, not independently reviewed as a
whole, and not release-ready; remaining mocked hosts and the full suite need
verification. Do not ship the required-mode configuration before production
GitHub sign-in and compatibility are verified. A separate release coordinator
reports Windows Store 0.5.66 was submitted and is in pre-processing; this
report has not been independently verified here and delivery is not established.

The full local website suite passed 768 tests, with two skips. Four discovery
tests previously cancelled because of their 30 ms test deadline; after a
test-only timing fix, 20/20 passed locally. The current editor candidate accepts
the additional `email_addresses:read` GitHub App permission, but older installed
versions reject it when validating the App. The live App's permissions have not
been changed. A compatibility release and update plan is required before changing
the permission.
The isolated compatibility change was merged in PR #296 at
`26f151cad805f93dce76525c745c6f8807cbffca`; 33 focused tests, an independent
source review, and the PR checks passed. The 0.5.66 kit is public, and Mac
installer setup-v0.5.66 and its signed update feed were published and verified;
Mac promotion PR #297 merged as `3246f9a85a86c1bd1f4346b6f0330c413c71a9aa`.
Windows Store submission 4 is a draft: the source-bound 0.5.66 package passed
hosted Windows checks but Partner Center's browser upload returned a generic
error before validation. No Store certification or publication is established.
Older installations that have not updated can still reject the new permission;
the live GitHub App permission remains unchanged.

The production WorkOS environment has been created with GitHub as its only
enabled social provider, and the owner entered a new GitHub App client secret
directly in WorkOS. The existing GitHub App retains its prior callbacks and has
an additional exact WorkOS production callback. WorkOS has the production website
callback, the editor loopback callback, and the website sign-out URI. These
settings have not yet been validated by a live production sign-in. The WorkOS
production public client ID is `client_01M70QJARN1KNAAYZS71R3C2HJ`.

The unpublished WorkOS candidate is source-bound and configured for required
first use with the production public client ID; it must not be released until
the GitHub App compatibility and production sign-in steps are ready. Required mode fails
closed if the ID is absent or invalid. A disposable VSIX and focused tests
verified this configuration without publishing; installed Mac/Windows behavior
is untested. An isolated offline Run attempt did not succeed: the test host used
in-memory secure storage on restart and later failed shell/terminal startup. It
neither proved a product failure nor established offline Run.
The owner explicitly deferred the disconnected Run check until after deployment
on 2026-11-09 to prioritize rollout. Online Run was reported successful in the
Zero development host. Offline behavior remains unverified, and a future fix may
be required if the post-deployment check fails.

The candidate was based on `9d0be3899`, while the checked local `origin/main`
had advanced to `188e67c68`. The candidate was copied to isolated worktree
`workos-rollout-main` at that main revision with no conflicts; both earlier
worktrees were preserved. In this integrated candidate, 80 focused extension
and website tests passed and the website typecheck passed, using the prototype
worktree's ignored dependency tree. Live
GitHub App permissions and token delivery, account mapping, sign-out/refresh,
Windows and production deployment remain unverified.

Current verification, 2026-11-10: Zero 0.5.67 is live in the Microsoft Store.
The owner approved the GitHub App's read-only email permission, and GitHub's
public App metadata confirms it. A production WorkOS PKCE sign-in using the
candidate desktop modules succeeded and produced a verified numeric GitHub
identity receipt. Website production configuration was staged in Vercel with
the WorkOS enable flag still absent; hosted website sign-in and the Hub grant
remain untested. The full editor suite passed (2,385 passed, 154 skipped), as
did the website suite (768 passed, 2 skipped). The following older paragraphs
describe earlier snapshots where their status differs from this update.

Local binding candidate: the desktop WorkOS exchange uses the returned GitHub
OAuth token only for the fixed GitHub `/user` lookup, then retains the WorkOS
user ID and numeric personal GitHub ID as a local receipt. Existing receipts
still permit offline local use; GitHub operations require an explicit sign-in
upgrade and a matching GitHub App account. Missing provider proof fails closed.
The production desktop test verified token delivery and the GitHub user lookup;
the website's separate App-grant verification still needs live acceptance.

The local candidate serializes receipt commits with GitHub credential mutations
using the existing local credential lock. Browser and network work remain outside
that lock, and receipt commits reject a changed baseline. This coordinates only
cooperating Zero windows sharing that lock path; it cannot prevent writes from
other processes or extension hosts with a different lock domain.
