# Durable unknown-request settlement — local candidate 2026-10-25

Owner authorizes safe settlement/recovery; production remains hidden. DraftPR202,
branch codex/zerojams-controlled-pilot. No live writes/migration yet.

Candidate: atomic Git branch CAS, pinned snapshots, global bounded rejection
ledger, explicit Close earlier request with persisted close intent. Accepted
original wins/recovered, or rejection fence wins/late action cannot apply. Covers
missing events and proposals before numeric ID verification. Old clients receive
409 terminal message. Current actor/Origin/CSRF/role boundaries preserved.

Explicit migration preserves existing bytes/history/guard, moves records to
zero-jams-v2/events, initializes ledger and replaces old jams tree with marker.
V2 never falls back/imports old namespace; marker loss halts service. New runtime
unavailable until migration. Rollback disables pilot; never restore old writer.
Read-only plan headce130103b5b84968c83982516104826c88a260a0,2 closed fixture blobs
unchanged; guard retained. Source deployment stays Preview only, no merge.

154 jam/272 website tests, typecheck/build pass. Actual React/Chrome loopback:
unknown expiredJoin→close loses reply→reload keepsclosing→confirmednotapplied→
freshJoin;1 fence+1join,2 commits, finaljoined.320/390px + Tab/Enter pass.
One Sol6.1/high worker delivered atomic adapter/12tests; coordinator verified.
Initial5117611d reviews(Astra/high security,Sol6.1/high compat) complete:3dedupP2.
One correction batch pinsplannedmigrationHEAD, allowsboundedclosewrapper, persists
closemodeatomically and blocksdispatchifstoragefails. Preflight understandsv2.
TargetedAstra/high5117611d→04da7ce1 passesall16deltafiles/8regressions.
Full154jam/272website/7preflight/typecheck/build +correctedChrome flow pass.
Next: Preview deploy/migrate/livelegacy
close (no event changes),15production404 cases,CI/finalreceipt. Review3turns/1fixbatch complete, no findings.
No secret/invite/protection changes. Local3025/other checkouts preserved.
Packet docs/ZEROJAMS-PILOT.md settlement section. DeepSeek paused.

Main d5c01bb1 integrated for current legal/beta/Git-flow baseline; only CURRENT/
EVIDENCE conflict resolution, both evidence histories retained. Integration
review and refreshed website/jam checks pending before final CI push.
