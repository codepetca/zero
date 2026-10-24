# ZeroHub feedback

ZeroHub offers repository stars, cached site checks and user-submitted issue
reports. Browsing, playing and public counts do not require sign-in. No separate
Zero account, votes database or background monitor is introduced.

Source also includes aggregate opens (Play-link activations) and component adoption from shared
project dependency declarations. See [metrics](ZEROHUB-METRICS.md) for coverage,
minimal storage, optional activation and limits. These metrics do not change
GitHub stars or require new GitHub App permissions.

## Inline stars

Connect GitHub, then press Star or Starred on a card. GitHub remains the source
of truth: one star per account per repository, including entries that share a
repository. Connecting never automatically stars anything. ZeroHub confirms the
button state only after GitHub confirms the write. Public counts are cached and
may take up to about 16 minutes to catch up. Signing out ends the local session;
it does not remove stars or revoke the GitHub App authorization.

The website uses the shared GitHub App user authorization flow with state and PKCE S256.
GitHub shows an account picker; the displayed account must be the one the student
intends to use. This does not silently sign the editor into the website.
Encrypted HttpOnly, Secure, SameSite=Lax cookies contain the short-lived token;
the browser receives only identity and a session CSRF token. Cookies are scoped
to the host and the session lasts at most eight hours, minus a safety margin.
Reconnect after expiry or revocation. There is no refresh-token store. Writes
require the configured Origin and session CSRF token. Tokens never enter the
catalog, shared cache, client storage, or publication environment.

## Provider activation

Implementation can be deployed without credentials: stars stay disabled and
public browsing, site checks and reports remain available. Registering the App
and granting its access is a separate owner action after source/security review.
The owner selected one App for native Zero and ZeroHub. Follow the authoritative
[shared identity plan](ZERO-IDENTITY-PLAN.md) for the full reviewed permission
matrix. Ordinary website user tokens can inherit selected-repository powers;
they must not be described as star-only. Repository credentials stay in the
editor for native development; the website uses its own separate web-token family.

Registered on2026-10-18 with owner approval: [Codepet Zero](https://github.com/apps/codepet-zero),
owned by `codepetca` (App ID5367740, Client ID`Iv23liWzC8OE2WN5f6qV`). Public IDs
are pinned in source. The approved personal-account test installation selects one private repository. No private key or client secret was
generated; no server credentials or production activation exist. Native user
authorization, private clone and guarded upload passed in an isolated Mac profile.
Browser stars and remaining provider acceptance are pending. Registered settings:

- Name: Codepet Zero; slug `codepet-zero`.
- Visibility: **Public** (the registration option allowing any account). A private
  organization App limits authorization to organization members, so it cannot
  serve students outside `codepetca`. Marketplace listing is unnecessary.
- Homepage: `https://zero.codepet.ca/hub`.
- Callback: `https://zero.codepet.ca/api/hub/github/callback`.
- User permissions: **Starring — Read and write**.
- Repository permissions: **Metadata — Read**, **Repository creation — Write**,
  **Contents — Write**, **Workflows — Write**, **Actions — Write**, **Pages — Write**.
  The reviewed recovery source additionally supports **Administration — Write**
  for automatic first-time Pages creation; rollout requires the compatible native
  release before the separately approved registration change. See ZERO-IDENTITY-PLAN.md.
- Device flow: enabled. Test installation: selected repositories. The App automatically
  receives access to repositories it creates. Zero does not select all repositories.
- Organization permissions: none. Webhooks: inactive. No events subscribed.
- User access tokens: expiring. No App private key or installation-token service
  is deployed. Do not request classic OAuth `repo`/`public_repo` or unreviewed
  additional permissions to make a failed test pass.
- Pin the same App ID/client ID/slug in the native reviewed source configuration
  and production website. A configured native client ID mismatch disables web sign-in.

Configure these **server-only**, production-scoped environment variables:

| Variable | Value |
| --- | --- |
| `ZERO_HUB_GITHUB_CLIENT_ID` | GitHub App Client ID (not App ID) |
| `ZERO_HUB_GITHUB_CLIENT_SECRET` | App client secret |
| `ZERO_HUB_GITHUB_SESSION_SECRET` | 32 random bytes, encoded as 43-character base64url or 64-character hex |
| `ZERO_HUB_ORIGIN` | Optional; defaults to `https://zero.codepet.ca` |

Keep secrets out of Git, logs and `NEXT_PUBLIC_*`. Generate the session key with
`openssl rand -hex 32` directly into the approved secret destination. Rotating it
invalidates existing sessions. Remove the client configuration to disable stars;
remove/revoke the App authorization in GitHub to revoke provider access. Never
reuse publisher credentials or a maintainer personal token for visitors.

Verify production anonymously first, then use an owner-approved test account:
Connect, confirm the minimal consent, return to the original Hub selection,
Star, refresh, Unstar, sign out, deny a connection and retry, and revoke access
in GitHub then reconnect. Check that browsing still works with no session.
Local mocked API tests do not prove GitHub registration or real consent works.
Development-only HTTP is allowed solely at an explicitly configured
`http://127.0.0.1:PORT` origin with NODE_ENV development/test and outside Vercel.
Preview deployments must not inherit production credentials or cookies.

## Site checks and reports

The public `/api/hub/projects?kind=game&ids=...` endpoint accepts at most 12 known
catalog/maintained IDs. The UI checks the first 12 current results. Search can
bring another result into that batch. Checks do not block Play or withdraw
projects. Canonical GitHub Pages addresses are checked with HEAD, without
redirects or JavaScript execution. Custom domains are not fetched. Each fetch
has a six-second deadline; a response has a fourteen-second work budget,
including the bounded catalog read. Three projects are checked concurrently.
Successes cache for fifteen minutes; unavailable provider data retries after a
minute. Caches are process-local and bounded; the public response may cache for
one minute. Unauthenticated GitHub API limits can make counts unavailable.

Site reachable means the page responded successfully. Site unavailable means
404, 410 or a server error. Other statuses, network errors and rate limits remain
unknown. These checks cannot detect broken controls, gameplay, stale deployments
or missing in-game assets. Publication checks bind a hosted receipt to source at
sharing time; an author's hosted app can change afterwards.

Report a problem opens a prefilled issue on the source repository when its
issues are enabled, or on `codepetca/zero` when disabled/unknown. It includes the
card's version, shared source and Play link. The user reviews and submits the
report on GitHub. No issue is automatically posted, and no scheduled alert is
promised.

Primary provider references: [GitHub App user tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)
, [App visibility](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/making-a-github-app-public-or-private)
and [GitHub starring API](https://docs.github.com/en/rest/activity/starring).

## Compact project details

Project cards show a filled play triangle with the open count at left and
borderless stars at right. The tooltip and screen-reader text explain that
opens count Play-link activations, including repeats. The single info icon
beside the title replaces the old About question mark; it is
green when the site is reachable and yellow when unavailable or unconfirmed.
It opens a native popover containing the description, check/warning and last
check time, GitHub author, version when available and report flag. Close it with
its close button, an outside tap or Escape. Library cards keep their text layout.
