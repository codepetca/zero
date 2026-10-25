# Pending-request reconciliation — 2026-10-25

Owner authorized fixing lost Join reply → Leave → Join; production hidden.
Current branch codex/zerojams-controlled-pilot, draft PR202. Source edits only
JamClient/Jam.css and focused tests; no backend authority or service rule changes.

Client shares per-account/endpoint locks, retains unknown payload/key, blocks
intervening changes, and offers independent exact-request recovery after reload.
Matching confirmation clears only that operation; new Join receives a fresh ID.
Actual participation UI + loopback GitHub fixture passes the requested sequence
with exactly three commits. Legacy storage/account/late callback cases pass.
110 jam/263 website tests and typecheck/build pass. Sol6.1/high full review
671dc0aa + targeted9dec4f1e pass; one test timing correction. Actual Chrome
React/loopback sequence passes, receipt3commits/final joined. No live writes.

Conservative limit: unknown requests that never committed and later become
permanently invalid may remain blocked. Durable server fencing would be needed
to abandon them safely; no discard/automatic fresh-key escape is added. Locks
are within a tab; registry CAS/idempotency remains the cross-device boundary.

Next: protected-preview delivery/read-only smoke,
production hold verification, final evidence/PR update. Keep draft/unmerged.
Registry ce130103b5b84968c83982516104826c88a260a0 and two closed fixtures retained;
no live fault injection or invitations. Other checkouts/local3025 preserved.
Use docs/ZEROJAMS-PILOT.md reconciliation section. DeepSeek remains paused.
