# ZeroHub interest and adoption — local implementation, 2026-10-24

Owner follow-up authorizes a Free-only Redis setup inside Vercel, with no paid
plan/add-on or automatic upgrade. Native Upstash Marketplace injects the
`KV_REST_API_URL` / `KV_REST_API_TOKEN` pair; source now accepts it, retains
explicit Zero-pair precedence and supports `ZERO_HUB_OPENS_DISABLED=1`.
Owner accepted the Marketplace/Upstash terms. `zero-hub-opens` is provisioned
through Vercel on Free and connected only to Zero Production. Creation explicitly
set autoUpgrade=false, prodPack=false and primaryRegion=iad1. Vercel UI confirms
Free/500K commands, Available and zero Production; credentials were injected by
the integration without copying values. Source230401b3 passed177website tests,
focused15/typecheck/build and independent delta review with no findings.
Configuration is complete; no push, deployment or publisher-pin change authorized.
Sanitized resource/connection/screenshot receipts: ignored
`.verification/zerohub-metrics/vercel-free/`. Retain the worktree for publication.

Owner requested a minimal-cost plan and implementation. Isolated worktree
`zerohub-interest` starts at origin/main bf2083a3; primary funding work and other
Dev worktrees remain untouched. Plan and activation contract: docs/ZEROHUB-METRICS.md.
Aggregate Play opens use optional Redis REST INCR/MGET; dependency observations
reuse the sharing ledger, with no new package, App permission or native telemetry.
Public cards distinguish repeat opens and partial shared-project coverage.

Local checks: 176 website tests, 86 sharing tests (4 environment skips), typecheck/build,
root configuration/syntax/document-link check and whitespace check pass. Controlled
browser QA and independent source review receipts live in ignored
`.verification/zerohub-metrics/`; final verdicts/limits are in docs/VERIFICATION.md.
No push, PR, deployment, publisher-pin change, resource provisioning or credential
change is authorized by this implementation request. Both publisher readers need
the documented compatibility rollout before observations are first written.
Independent Sol/high complete review of67031a42 found one P2 first-twelve cap;
one fix batch and targeted review of76f52630 resolved it with no new blockers.
Code is complete on `codex/zerohub-metrics`; retain the worktree for separate
owner-authorized publication and hosted activation. No extra review wave needed.

## Prior release state — Direct GitHub sign-in, Mac0.5.47, 2026-10-22

Owner authorized native Dev sign-in testing and release after success. Native
acceptance passed the direct device-code prompt without extra host confirmation,
cancel/retry, human GitHub authorization as armorup and persisted account after
reload. Auth PR176 merged3589903d after11CI checks and two clean reviews.

Signed/notarized/stapled Mac0.5.47 is public at
https://github.com/codepetca/zero/releases/tag/setup-v0.5.47.
Anonymous DMG size/SHA256 matches the reviewed sealed candidate. Source/version
PR177 merged3d506bae after11checks. Clean built sourcefc0b8bf1; preparation7c08bcd9;
separate source and candidate reviews clean. One installer build only. Installer
snapshot and exact signed feed47 reflect those immutable bytes. Integration must
pass exact-head CI, then verify deployed feed/download bytes before delivery is
claimed; current external PR/CI/live verdict is in .verification/release47/progress.json.
Website promotion also pins Next16.4.2 after the existing16.4.0 production build
reported security advisories. Patched production audit reports0vulnerabilities;
website typecheck,162tests and production build pass. Native bytes are unchanged.
No installed-Zero update or fresh-machine/physical Intel/Windows trial was done.
Prior immutable assets, kit17 and Windows21 are retained; no separate kit release.

Preserve tutorial-padding Dev checkout/profile/scratch/watcher and its unrelated
uncommitted Explorer/Start Page work, plus primary funding work. Release candidate
and receipts must be retained before archiving the clean release worktree.
