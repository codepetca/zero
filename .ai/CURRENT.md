# Publish saves source before deploying — local implementation, 2026-10-21

Local branch `codex/publish-save-deploy`; reviewed source `264ebcd7` based on
`9ad376d9`. Publish saves files, commits only when needed, pushes unuploaded main,
then deploys the exact verified version. Already uploaded main skips upload.
Change branches get Merge to main guidance; cancellation/failure stops deployment.
Verified live results retain Open app/Copy playable link and log the actual URL.

Checks and independent review complete; see docs/EVIDENCE.md and
`docs/VERIFICATION.md`. Final81 UI/native upload tests, prior103 affected tests,
45 publisher regression +1 new preflight,50 integration checks, configuration and
whitespace pass. Counts overlap. Independent Sol/high initial safety/compatibility
reviews plus targeted remediation review:3turns,1accepted P2 fixed,0open findings.

Local source only; no push, merge, installer release, deployment or account change.
Native VS Code interaction, live GitHub Pages and physical Windows remain untested.
Task receipts: `.verification/publish-save-deploy/`. Original checkout preserved.
Earlier released-state evidence remains in docs/EVIDENCE.md.
