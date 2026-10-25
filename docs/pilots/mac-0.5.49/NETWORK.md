# School IT sheet — Zero 0.5.49

Prepared from candidate 49 source on 2026-10-24. **School-network execution is
pending.** This is a source-derived starting inventory, not a complete firewall
allowlist or a claim that proxies/certificate interception already work.
No network or security settings are changed by preparing this sheet.

The trial uses a normal managed Apple Silicon Mac account, a signed local DMG,
an editor, private Java/Node, Git 2.31+ for clone and local native/WebFX builds.
It does not require an inbound LAN service, global npm/Maven, a database, Docker
or a student installation of the Zero repository's maintainer tools.

## Outbound requests to observe

Ordinary remote traffic below uses HTTPS/TCP443. DNS and the school's normal
certificate/security validation must also work. List actual redirect/CDN hosts
from an approved network trace; do not infer a blanket wildcard rule from this
sheet. Browser GitHub assets, Marketplace CDN hosts and Apple security-validation
endpoints are not fully enumerated in Zero source.

| Layer | Direct source-configured host | Purpose / relevant pin |
| --- | --- | --- |
| Private JDK download | `github.com/adoptium/temurin21-binaries` | Temurin 21.0.12.1+1 Apple Silicon; GitHub release downloads redirect. |
| Private editor download | `vscode.download.prss.microsoft.com` | VS Code 1.141.0, commit2a59476c9bfcb90b3ddc372c36762471b7dfad1c. A compatible existing editor may be reused; record what actually ran. |
| Private Node download | `nodejs.org` |22.21.1, darwin-arm64. |
| Java language support | VS Code Marketplace and its resolved asset hosts | `redhat.java` is installed by ID; its version/CDN is **not pinned** by Zero. Record actual version and download requests. Zero 0.5.49 VSIX itself is bundled locally. |
| Native Maven and JavaFX | `repo.maven.apache.org` | Maven 3.9.11 wrapper, OpenJFX 21.0.12, compiler/clean/JavaFX plugins and dependencies. |
| Web compiler downloads | `repo.maven.apache.org` | Pinned Maven/GWT 2.13.0/toolchain and compatibility dependencies; separate web caches. |
| WebFX artifacts | `central.sonatype.com/repository/maven-snapshots/dev/webfx/` | Timestamped0.1.0 artifacts with checked hashes. `kit`:20260917.143427-1; `platform`:20260917.140147-3. These still use snapshot-directory URLs. |
| Browser-first GitHub sign-in | `zero.codepet.ca/api/desktop/github/`, `github.com`, `api.github.com` | Start/login/callback/exchange/refresh, consent, identity/access checks. Do not collect query strings or tokens. |
| Explicit device-code fallback | `github.com/login/device`, `github.com/login/device/code`, `github.com/login/oauth/access_token`, `api.github.com` | **Zero: Sign in using a code**; record fallback and browser-default results separately. |
| Approved existing-project clone | `api.github.com`, `github.com/<owner>/<repo>.git` | GitHub access checks and guarded HTTPS Git clone. No new repository or push is required by this pilot. |
| Optional ZeroHub/library use — outside core trial | `zero.codepet.ca/api/sharing/catalog/web`, `fdvfhpclefgmg9ks.public.blob.vercel-storage.com` | Catalog and immutable library artifacts/Maven repository. Lesson 11 practice stays local/unsubmitted here. |
| Optional native update check — outside acceptance | `zero.codepet.ca/updates/macos/appcast.xml`, feed-selected GitHub download | Production feed currently serves 47. This pilot does not publish or exercise 49 delivery. |
| Deferred Pages/publishing | `api.github.com`, `uploads.github.com`, workflow services and the final `<owner>.github.io` or configured domain | Only a later explicitly authorized publication test needs this path. |

The three private-runtime archives alone total 578,785,610bytes before Java
language support and native/browser dependencies. This is a planning quantity,
not measured total pilot traffic. Do not prewarm downloads and label that a cold
school-network pass. Installation can select existing tools instead; record it.

## Loopback and browser handoff

- Browser GitHub sign-in listens on `127.0.0.1` at an ephemeral TCP port with a
  nonce-specific callback path. The browser must be able to return to that local
  HTTP address. Listener lifetime is 10minutes; it closes on completion/cancel.
- Web preview uses `http://127.0.0.1:<ephemeral-port>` with token-scoped URLs.
  Both embedded and external browsers must reach it. No fixed port or LAN-facing
  listener is required. Do not expose these listeners to the school network.
- Device fallback avoids the OAuth browser-to-loopback return. It does not remove
  loopback requirements for WebFX preview. Never copy a full callback or preview
  URL into shared diagnostics: redact its path/query/fragment tokens.

## Proxy and certificate limits to test

A successful Safari/Chrome request does not prove the extension, Git, private
Java or Node can use the same school proxy/trust configuration.

| Layer | Current behavior | Pilot implication |
| --- | --- | --- |
| Setup | System `/usr/bin/curl`, verified TLS, HTTPS redirects/retries; no dedicated proxy UI. | Observe actual signed runtime/Marketplace preparation under the standard account. |
| Auth/catalog | Native fetch; redirects rejected; no configured school proxy agent/CA integration. | Record failures separately from browser consent success. |
| Guarded clone | TLS verification on; redirects off; system/global Git config and credential helpers suppressed. | A global Git proxy or sslCAInfo setting does not prove Zero clone works. |
| Saved web builder | Environment allowlist excludes proxy variables and NODE_EXTRA_CA_CERTS; generated empty Maven `-s`/`-gs` settings, own cache, Java option injection cleared. | Do not assume HTTP_PROXY, user Maven proxy settings or an injected Java truststore configure WebFX. Test actual fresh export. |

If an approved institutional proxy/CA setup is required and these paths fail,
retain the failure and hold that target. IT/maintainers decide the supported
configuration or a future candidate fix. Do not disable TLS/Gatekeeper, strip
quarantine, install unreviewed certificates or switch to a hotspot as an unnoticed
workaround. An approved alternate-network diagnostic is a separate labeled run.

## First failure evidence and recovery

Capture only the failing check ID, time, layer, actual host, HTTP status or TLS
error, tool versions and sanitized error text. Use a neutral device/run ID.
Do not dump environment variables, whole browser profiles or credential stores.

1. Installer: open **Details…** if setup fails; copy the relevant progress stage,
   action exit/error and readiness fields. Details are window-held; preserve the
   useful excerpt before closing. There is no promised durable installer log file.
2. Editor/native: run **Zero: Troubleshooting**, inspect the **Zero** Output channel,
   actual Run App task terminal and source-linked **Zero Java compiler** / **Zero
   native runtime** Problems. Preserve the first useful error before retrying.
3. Browser compilation: use the exact diagnostic/log path shown by the error.
   The host normally uses global-storage `web-compiler/logs/<project-hash>.log`;
   standalone tooling defaults to `~/.cache/zero/web-export/logs/`. Record the actual
   path rather than guessing the extension's version-specific directory.
4. Review excerpts/screenshots before sharing: redact personal names/emails,
   repository identities if private, auth codes, passwords, tokens and complete
   callback/preview URLs. Keep evidence in the school's approved location.
5. After an approved correction, rerun that layer on the same target. Preserve
   the first failure and retest separately. A fallback success does not erase it.

## Source trail for maintainers

These paths identify the reviewed candidate source; they are not commands for
students to run or files school IT must install:

- `setup/mac-downloads.json`, `native-installer/macos/MacRuntime.swift` — runtime
  URLs/hashes, editor selection, Java-support installation and download behavior.
- `student-template/pom.xml`, `.mvn/wrapper/maven-wrapper.properties` — native build.
- `extension/src/web-export/toolchain-lock.json`, `compatibility/contract.json`,
  `compatibility/maven-artifacts.json`, `compatibility/maven-distribution.json` —
  browser build pins (compatibility paths relative to that web-export directory).
- `framework/project-builder/run.cjs`, `extension/src/web-export/index.js` — isolated
  environment, web Maven settings/cache and process behavior.
- `extension/src/github-app/browser-flow.js`, `device-flow.js`, `provider.js`,
  `repositories.js`, plus `extension/src/clone.js` — sign-in and guarded clone.
- `extension/media/sharing-config.json`, `release/mac-updater.json` — optional
  catalog/artifact/update endpoints. Redirect destinations require observation.
