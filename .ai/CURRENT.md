# Reporting production activation — 2026-11-19

[PR386](https://github.com/codepetca/zero/pull/386) merged as `c5c2d275a` after all12
hosted checks passed at `9d355e147`. Independent reporting, Windows and consent
reviews are clean. First-run public consent is implemented; eligible automatic
errors are silent and consented manual reports send directly. No OS installer
consent existed before this change. No reporting-enabled editor release is included.

Production `zero.codepet.ca` now serves exact-source deployment
`dpl_CvgbyzHMQ3vpVHgp43G5vtn5ZDLL` with collection enabled. The prior disabled build
returned503/disabled; the enabled build rejects invalid payloads400. Actual native
VS Code sent its retained manual draft without another confirmation, received a
receipt and produced bot-authored public issue3. Hosted automatic collector
acceptance produced issue4 with zero notifications, deduplication, recovery and
strict privacy validation. Both are labelled activation-test and closed.

Live reconciliation run44533868904 exposed Next/Vercel's empty request-body
stream versus the handler's null-only check (400). Scheduler variable is disabled
while the bounded empty-stream correction is implemented and reviewed. Collection
and inline delivery work; durable pending records remain available for recovery.
The correction at `672177b5a` has15passing focused cases (including actual PG),
plus clean independent Sol/high security and compatibility reviews. Root owns
integration. Next: pass final hosted gates and merge, deploy exact source, rerun
authenticated reconciliation,
then enable hourly minute17 execution. No installer publication is authorized here.

Dedicated App5827621/installation183555907 remains issues-write/metadata-read only
on public zero-reports1463652567. Vercel-managed Free Neon uses a restricted direct
TLS runtime role; all9 server variables are production-only, secrets outside Git.
Restore history6h is distinct from report retention until operator removal.
Original dirty checkout/project windows remain preserved. Physical Windows for the
new collector and actual future scheduled events remain separate evidence.
See [operation](../docs/PROBLEM-REPORTING.md) and [evidence](../docs/EVIDENCE.md).
