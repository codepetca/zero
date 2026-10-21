# Publish commit/push — Mac0.5.42 release in progress

Owner explicitly authorized merge and release on2026-10-21. Worktree branch
`codex/publish-save-deploy`; current integration base is origin/main5e3dc4dc,
which includes the released native Explorer Mac0.5.40. Source264ebcd7 has complete
initial safety/compatibility and targeted cancellation-fix reviews. Main sync,
new version42, exact-source CI and release candidate review remain pending.

Publish saves files, commits only when needed, pushes unuploaded main, then
deploys the exact version. Change branches get Merge to main guidance. Verified
live results retain Open app/Copy playable link and log the URL.81UI/native upload,
103affected,45publisher+1preflight and50integration checks passed before main sync;
counts overlap. Receipts: `.verification/publish-save-deploy/`.

Next: verify integration/version delta, source PR/CI/merge, signed/notarized sealed
Mac42, verified public DMG and feed promotion. Preserve previous immutable assets,
primary funding work and credentials. No native editor launch after prior Code
Key popup; user will try the release. Physical Windows/provider flows untested.
Prior release evidence remains in docs/EVIDENCE.md.

Main advanced with tutorial/API documentation during41verification. Include it in
42; preserve the sealed41candidate and verified41draft as unpublished evidence.
