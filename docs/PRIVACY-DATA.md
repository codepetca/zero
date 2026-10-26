# Zero privacy data inventory

Source snapshot:2026-10-25, base010ae629 plus this task's local policy UI.
Public notice: `website/app/privacy/page.tsx`; separate terms `/terms`. Old `/legal` redirects to Privacy.
This inventory verifies source behavior, not live provider settings or legal
compliance. No new collector, consent record or data store is added by the pages.

| Data / purpose | Storage and lifetime / control | Source |
| --- | --- | --- |
| GitHub numeric ID/login, user access token, CSRF; browser connection | Authenticated encrypted HttpOnly cookie, Secure on HTTPS. Maximum min(8h,token life) minus1minute. Sign-out clears cookie. | `website/lib/hub-github-auth.mjs` |
| Browser OAuth state/verifier | Encrypted flow cookie,10minutes; callback clears it. | `website/lib/hub-github-auth.mjs` |
| Desktop browser authorization and refresh | Broker processes codes/verifiers/access+refresh credentials; no credential DB. Flow10minutes, delivery2minutes; no-store responses. | `website/lib/desktop-github-auth.mjs` |
| Desktop account/connection/access+refresh tokens | VS Code SecretStorage; validity limits do not delete stored expired records. Desktop sign-out clears credential record. | `extension/src/github-app/credential-store.js`, `provider.js` |
| Recent desktop projects | Up to20paths/timestamps/optional repository URLs per numeric account in local editor state. No age-based expiry. Sign-out retains projects/history. | `extension/src/recent-projects.js` |
| Appearance preference | Browser localStorage `zero-learn-theme`; no coded expiry; user clears site data. | `website/app/learn/LearnTheme.jsx` |
| Aggregate Play activations | Browser sends only project ID, credentials omitted; server increments Upstash per-project Redis counter. No account/IP/visitor log in counter payload; no TTL. Hosting request metadata separate. | `website/lib/hub-metrics-client.mjs`, `hub-opens.mjs` |
| Library adoption summaries | Declared dependencies in public sharing snapshots; not private/unshared code or runtime surveillance. | `website/lib/hub-metrics.mjs`, `sharing/adoption.mjs` |
| Stars and operational diagnostics | GitHub user token authorizes read/write. Allowlisted stage/method/status/error reason/permission/quota logs; do not claim no logs. | `website/lib/hub-stars.mjs` |
| Public requests/releases/artifacts | Public GitHub issues, catalog source/contributor metadata, artifacts and Git history. Delisting is not erasure of history/distributed licensed copies. | `website/components/HubPrepare.tsx`, `extension/src/sharing/contracts.js`, `sharing/editor.js`, `website/lib/sharing-catalog.mjs` |
| Avatar / external destinations | Browser loads signed-in avatar from GitHub with no-referrer; Play/source/demo links go to external creators/GitHub/Pages. | `website/components/AccountMenu.tsx`, `HubProjectCard.tsx` |
| Public reachability status | Server checks GitHub/public Pages; process caches15m success/1m failure/catalog1m. | `website/lib/hub-project-status.mjs` |
| Local-only Jam preparation | Session-storage drafts/retry IDs; sandboxed preview. Production Jams pages/API remain hidden regardless of service credentials; no activation authorized. | `website/components/JamClient.tsx`, `JamPreparation.tsx`, `website/lib/jams-visibility.mjs`, `jams-runtime.mjs` |

Current website source has no ad/session-replay/marketing analytics integration
identified by the source audit. This does not verify dashboard-injected analytics,
provider logging, external websites or future code. No privacy notice may infer
no tracking/no logs/no collection from the absence of a source SDK.

## Unknown deployment/operational facts

Provider logging fields/retention, active dashboard analytics, region placement,
backups/deletion, deployed Redis/artifact settings and private contractual
school/child arrangements have not been independently verified here. Vercel
hosting and optional Upstash integration are documented in website/README.md;
normal connection metadata and provider processing are disclosed without a
fabricated retention deadline. Do not promise universal deletion or Canadian-only
processing. Privacy contact is the owner-confirmed corporate info@codepet.ca.
Human request handling and legal/retention procedures need operational follow-up;
no automatic request/deletion or guardian-verification service is claimed.

A new purpose or collector requires updating this inventory/notice and obtaining
appropriate consent where required; a page visit or GitHub grant is not proof
of policy/terms acceptance. Relevant primary guidance: [OPC meaningful consent](https://www.priv.gc.ca/en/privacy-topics/collecting-personal-information/consent/gl_omc_201805/),
[OPC retention/accountability principles](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/pipeda-compliance-help/pipeda-compliance-and-training-tools/pipeda_sa_tool_200807/).
These support policy design, not a compliance certification.
