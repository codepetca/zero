# ZeroJams provider controls — 2026-10-26

Active owner scope: reduce GitHub overhead, aggregate quota observation/pacing,
hosting cost evidence. Production hidden; Safari/device/zoom paused. Sponsor,
merch and payments parked. Draft PR202 unmerged; no new invite/credential/provider/
paid setting or registry migration. Existing hosted source619ca729 remains until
reviewed protected-pilot update; live registry db8a7d2b is untouched.

Local implementation: private issued-base CAS reuse/fresh snapshots, pinned list,
pilot shared accepted-intent pools (ordinary 2/min20/h; safety/closures separately
2/min10/h),2 CAS attempts/jitter, provider header observation/circuits/process pacing,
18s context deadline, token-mint single-flight and maintainer-only diagnostics.
These do not impose a hard fleet-wide outbound quota. Older writers/read floods
remain outside accepted-intent caps. Unknown outcomes retain keys/close intent.

Final local246 jam/282 website tests, typecheck and build pass. Build retains
existing filesystem-tracing warnings in unchanged updater/template code.
Generic Join 27→13, list 2 events 23→9; enabled two-event pilot Join14,
23 including warm identity/refresh. Recovery 8 unchanged.
Read-only hosting usage: shared Zero7 day2.4K invocations/5m33sCPU/0.36GBh, buildCPU
11h42m. Not isolated Jam spend; billingAPI404, actual incremental cost unknown.

NEXT: complete two independent reviews, then update only
the existing protected pilot and verify actual dedicated-installation observations,
role/production hold and unchanged event state. No main merge/wider rollout.
Docs: jams/CONTRACT.md, OPERATIONS, PRIVACY-DATA and PLAN updated locally.
Evidence .verification/zerojams-pilot/quota-implementation/, quota-design/ and
provider-acceptance/measurements-optimized.json. Start weekly98% remaining,
storagehealthy~225GB; attributable tokens/time unknown. No tool-backed goal added.
