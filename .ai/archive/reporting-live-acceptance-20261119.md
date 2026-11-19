# Reporting live acceptance complete — 2026-11-19

[PR386](https://github.com/codepetca/zero/pull/386) merged `c5c2d275a` after all12
checks; [PR390](https://github.com/codepetca/zero/pull/390) merged `baf9fe48a` after
all12 correction checks. Independent reporting, Windows, consent and hosted-body
security/compatibility reviews are clean. Verified runtime deployment
`dpl_6LMsgmHFrhXq9S2xLwEJtYC5t1KR` matches `baf9fe48a` and serves zero.codepet.ca.
Collection is enabled; all9 server variables remain production-only.

Users choose public reporting once on first launch. After Allow reports, eligible
errors send silently; consented manual reports send directly. Sidebar errors stay
concise. Default/decline is off. Turning off cancels queued automatic delivery and
requires renewed public disclosure for subsequent manual attempts. There was no
prior OS installer reporting-consent step.

Actual installed VS Code1.147 sent its retained draft directly, received a receipt
and created bot issue3. Hosted automatic collector acceptance created issue4 with
zero notifications, same-ID deduplication/recovery and strict privacy validation.
All4 synthetic provider-test issues are labelled activation-test and closed.
Reconciliation [44537092433](https://github.com/codepetca/zero/actions/runs/44537092433)
passed on `baf9fe48a`: delivered4, pending0, needsAttention0, attempted4. Hourly
minute17 UTC is enabled with a purpose-specific Actions secret and no token
permissions. This proves manual dispatch; a future scheduled event is unobserved.
The initial empty-stream400 was fixed with a bounded1s read inside the20s budget.

App5827621/installation183555907 remains issues-write/metadata-read only on public
zero-reports1463652567. Vercel-managed Free Neon uses restricted direct TLS runtime;
credentials remain outside Git, with no owner binding. Restore history6h is
separate from report retention until operator removal. Original dirty checkout
and existing project windows remain preserved.

Authorized reporting setup/activation is complete. A reporting-enabled editor
release, physical Windows acceptance for that collector and the AI triage/fix
runner are separate work; no installer publication occurred. See
[operation](../../docs/PROBLEM-REPORTING.md) and [evidence](../../docs/EVIDENCE.md).
