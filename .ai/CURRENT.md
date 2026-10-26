# Durable request settlement live — 2026-10-26

Owner-authorized phase complete; ZeroJams production hold remains. Draft PR202
is unmerged. Reviewed settlement04da7ce1 + main integration10150f20 deployed as
619ca729b5d4844b32c0294706406d3c79183881, Vercel dpl_Gq9Fz6yHtugW3p2ZmwASyTzk7qPC.
All11 exact-head CI pass; final receipt follows deployed source locally.

Atomic branch CAS closes unknowns by recovering accepted outcome or storing a
not-applied fence; missing-event/proposal cases included. Client close mode/key
are one saved value; storage failure blocks dispatch. Lost close/reload continues
closing. Payload/draft/actor isolation and older-client409 handling are verified.

Guarded migration77066b52fcd7367e669ae35f933bac9fef2f923b copied both closed event
blobs unchanged to zero-jams-v2/events and retained deployment guard. stewchan's
two queued Game test requests closed via normal authenticated UI; reload has no
pending control. Current registrydb8a7d2b3a52d84afc523c00b84a31beddf361ec contains
2 fences, event blobs/guard unchanged.4 exact public-ledger service replays return
not-applied with0source/0write calls (read-only audit, not forged web access).

154jam/275website/7preflight/typecheck/build pass.10new-route access cases pass.
Astra+Sol initial reviews, Astra delta, Sol integration clean;4turns/1fixbatch,
3P2s fixed. Real Chrome lost-close/reload/freshJoin,320/390px+Tab/Enter pass.
Production existing13cases +settlementGET404; undeployedsettlementPOST405; Hub200
with no jam link. New handler's production404 guard tested.0deployments for3new
registry commits; historical initial1709d161 error is unrelated. No account,
secret, invitation or protection changes. Local3025/other checkouts preserved.

NEXT: browser/school-network and provider quota/latency/cost acceptance before
wider trial; no extra invite/public rollout without owner scope. Keep v2 fences
and marker; rollback disables pilot, never restores legacy writer. Physical
mobile/WebKit/zoom and retired-path provider behavior remain unverified (marker
loss fails closed). Packet docs/ZEROJAMS-PILOT.md; ignored final receipt
.verification/zerojams-pilot/settlement-verification.json. DeepSeek paused.
