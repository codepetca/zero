# Desktop GitHub authorization activation

The desktop broker supports browser authorization. Current local Zero source
uses it for new connections, without a code option or device fallback. Existing
device-issued sessions retain their renewal path. Published desktop downloads
retain their bundled sign-in behavior until a separate authorized native release.

`/api/desktop/github/{start,login,callback,exchange,refresh}` uses the existing
Codepet App configuration and server-held `ZERO_HUB_GITHUB_CLIENT_ID`,
`ZERO_HUB_GITHUB_CLIENT_SECRET` and `ZERO_HUB_GITHUB_SESSION_SECRET`. No secret
ships in the extension. `ZERO_DESKTOP_GITHUB_ENABLED=1` enables these routes;
they return unavailable by default. The production origin is fixed to
`https://zero.codepet.ca`, with the exact registered callback
`https://zero.codepet.ca/api/desktop/github/callback`. Retain the existing Hub
callback, disabled wildcard matching and enabled device flow.

A per-flow sealed intent, state/HttpOnly cookie and desktop-held PKCE verifier
bind a short-lived code/ticket return to a temporary IPv4 listener. Tokens appear
only in no-store POST responses and desktop SecretStorage, never browser-return
URLs or cookies. The server does not persist desktop credentials or transfer
ZeroHub browser sessions. GitHub enforces one-use OAuth codes; no local replay
database is claimed. Browser-issued renewal uses this server; existing device
sessions retain their original secretless renewal path.

Owner authorized template publication, this broker activation and a real Mac
walkthrough on2026-10-24. Callback registration and production flag are prepared;
reviewed source deployment and live acceptance complete activation. Existing
server secrets are reused, not regenerated or read. Native releases and publisher
configuration remain separate. The endpoint source is byte-identical to the
independently reviewed implementation throughactor8fafde02; the inherited Hub
module, pinned App IDs and website dependency locks are unchanged.

Verify with the desktop/Hub auth test suites, website typecheck/tests/build and
the repository CI gate. Mocked protocol tests do not establish live GitHub acceptance.
