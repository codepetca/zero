# Zero0.5.82 full release — 2026-11-19

Owner explicitly authorized the full release after reporting acceptance. Prepare
from main `c9cc6c431`; isolated branch `codex/prepare-zero-082`, core unchanged0.3.0,
kit/extension0.5.82 local, Mac build81. Preserve all0.5.81 published bytes, feeds,
installer/kit fallbacks and original dirty checkout. No new credentials or account
settings are required. Reporting backend and hourly reconciliation remain enabled.

Release scope: canonical three-file kit, signed/notarized Mac setup and signed
update feed, small and complete Windows Portable with source companions and exact
hosted cold/warm proof, plus normal Microsoft Store0.5.82 rollout. Source, candidate
and promotion reviews/checks remain required. Store certification is external.
One coordinator owns version/source changes and Mac; a bounded read-only worker
maps current Windows/Store steps. No installer publication has happened yet.

Next: local configuration/focused release checks, independent source review and
stable-head hosted CI; merge source, prepare canonical manual artifacts; sign,
notarize and seal Mac candidate; verify exact candidates, publish immutable assets,
promote matching download/feed metadata, and verify public downloads/Store state.
See docs/RELEASING.md and docs/RELEASE-LEDGER.md. Reporting acceptance is archived
at .ai/archive/reporting-live-acceptance-20261119.md and in docs/EVIDENCE.md.
