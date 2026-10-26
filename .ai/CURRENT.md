# ZeroJams provider controls ready for protected pilot — 2026-10-26

Owner scope: overhead reduction, provider quota visibility/pacing and cost checks.
Production hidden; Safari/device/zoom paused; sponsor/merch/payments parked.
PR202 remains draft/unmerged. No extra invite, credential, paid service/account
setting, database or registry migration. Current live registrydb8a7d2b untouched.

Reviewed application39364209: fresh-head private CAS-base reuse and pinned lists;
accepted-intent pools ordinary2/min20/h, safety/closures separately2/min10/h;
2CASattempts/jitter; observed headers, process circuits/spacing/body-aware permits,
18scontext deadline; coalesced token setup; maintainer-only provider diagnostics.
These are not a hard fleet-wide outbound quota. Older writers/read floods remain
outside accepted-intent caps. Recovery and fences precede new-admission checks.

Corrected offline252jam/282website tests +typecheck/build pass. Astra/Sol full
initial reviews and Astra targeted correction clean:3turns,1fixbatch,2dedup issues.
Initial test transport isolation and body-failure counter defects resolved; tests
now block external fetches and assert no default-network call in monitor tests.
Live registry remained unchanged after initial unauthenticated test requests.

Actual Chrome/real HTTP loopback proof: lost acceptedJoin recovered despite full
ordinary pool; lostLeave429reply→retry429→reload keeps request/draft→close in
separate pool→freshLeave→freshJoin. Exactly4fixturecommits (3business+1fence),
registered final, draft retained. Default write spacing used; no live write.
Two-event pilot Join14registrycalls,23including warm identity/refresh (was36);
list2events23→9; read/recovery8unchanged. Generic unpaced Join27→13.

Shared Zero7day usage2.4Kinvocations/5m33sCPU/0.36GBh; buildCPU11h42m. Actual
incremental Jam spend unknown (billingAPI404), not zero. No paid settings changed.
NEXT: one source push to existing protected pilot, exact-head CI and read-only
live installation/role/production/state verification. No main merge/wider trial.
Evidence quota-implementation/, quota-design/, provider-acceptance/ optimized run.
