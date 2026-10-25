# Recovery verification — candidate reviewed, wider trial blocked

Owner authorized failure recovery/concurrent-write testing; production hidden.
Candidate code791a8482:24 loopback HTTP cases using real service/source/store/
transport, plus client hooks.105 jam/258 website tests, typecheck/build pass.
One Sol6.1/high audit worker reused for independent review;41 focused tests pass.
Review corrections resolved: test timeouts, exact subject scopes, late clears.

Fixed public review/moderation/entry reason drafts across reload. Bound to actor
and exact review context; clear only on confirmed success. Read-only gallery
entry revision added and CONTRACT synchronized. No auth/mutation-rule changes.

OPEN wider-trial blocker: unknown join commits, later leave, later new same-payload
join reuses old key -> historical joined confirmation while actual state remains
left. Characterization test confirms existing UI gap, not a readiness pass.
Next work needs explicit pending-request/new-intent reconciliation; never blindly
replace uncertain keys. No broad queue/UI workflow was added in this test phase.

Hosted before this phase: f50942b0, dpl_4r7w2mfNCkGhJx7PQHBmU8rDEXkZ, draftPR202.
Protected branch URL unchanged; reviewed candidate Preview update/CI still to be
published/verified. No main merge/public rollout. Registry ce130103b5b84968c83982516104826c88a260a0
holds the two closed fixtures; fault tests did not write live data. Registry-only
website/vercel.json guard remains; no extra invites, secrets or provider changes.

Next: publish bounded reviewed fix only to protected preview, verify UI draft
restore without submitting, exact-source CI, live production hold and unchanged
registry head. Finish receipt/PR description; keep trial blocker prominent.
Packet docs/ZEROJAMS-PILOT.md; ignored recovery verification.json/logs under
.verification/zerojams-pilot. Other checkouts/local3025 preserved. DeepSeek paused.
