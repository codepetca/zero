# Public structured reporting refinement — 2026-11-18

Owner selected public GitHub issues containing structured technical data only.
The student-facing sidebar stays concise. Manual reporting has a short public
submission confirmation and no description field or raw JSON preview.

Branch `codex/automatic-error-reporting`, base `d098d0d2f`. Previous private-source
review and verification through `2aad43a5d4bf` is recorded in
[evidence](../docs/EVIDENCE.md). The public-policy delta is based on `ddbbcc0cc`.
The shared contract now rejects free text for every source. The server revalidates
stored samples, verifies a public destination and authenticates the App-bot issue
author. Public opt-in and queue are separate from the legacy private policy.

Reviewed source `65580f1093661b3d9d62cca4163d99cc3dac2edb` passes both
independent public-policy reviews with no source blockers. All 116 focused
schema/editor/native/browser/onboarding/service cases pass, including actual
isolated PostgreSQL with fake GitHub. Source checks, website typecheck and the
current production website build pass. Native report-dialog and live App-bot
attribution remain unverified activation checks. [Reporting operation](../docs/PROBLEM-REPORTING.md)
contains the current product and activation contract.

The source remains local. The reporting repository/App, credentials, production
service, full hosted CI and an editor release require applicable publication
and activation authorization. The primary checkout and 0.5.81 preparation retain
their work. Public release state is recorded in the
[release ledger](../docs/RELEASE-LEDGER.md#zero-0580--2026-11-18).
