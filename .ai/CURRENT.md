# Current state

Updated 2026-10-12. Read docs/PRODUCT.md and docs/DEVELOPMENT.md before edits.

## Active public-hosting phase

Owner now authorizes orchestrating public ZeroHub, chooses Neon PostgreSQL and requires Vercel Marketplace provisioning/connection (no separate Neon login). Earlier local-only publication hold is superseded for this phase; primary funding changes remain protected. Existing Vercel Zero project prj_b8dDCbuiF8uzVcXYMLghpWTAr4aA, team_jKbtHZ7k3VeEdJKdqf2GOToE. Free Neon resource zerohub store_7SDARpYdaZmRY4z3 was provisioned through Vercel. Separate expired Neon CLI sign-in cancelled at owner's instruction. No hosted migrations or candidate execution yet.

First deployment target is read-only public catalog via Vercel + Neon, with authoring closed until the existing checker gate and hosted execution/operations are resolved. Prepare restricted DB/runtime roles and immutable storage; Vercel owner credentials stay development/migration only, production gets a distinct limited login. See docs/ZEROHUB-HOSTING.md. Do not claim catalog-only staging completes the full upload goal.

Hosting source reviewed at72598039d768a6b5ae0fd56f3ba137e99a7cb630. Initial Astra/high authority and Sol/high compatibility reviews completed at5437ee2; one deduplicated permission-guard blocker fixed in one batch. Astra/high targeted review completed the9-file correction and immediate callers, closed the blocker with no new findings. Earlier unchanged coverage retained. Hosting review3turns/1initial wave/1targeted wave/1fix batch; cumulative reviewer turns14. Old checker review remains separate, no retry/bypass.

Verified20 actual local PostgreSQL tests,43website passes/2optional skips, website types/build, staging7focused reviewer checks and whitespace. Actual Neon18 direct TLS connection succeeded; schema/immutable storage installed and SQL-created zero_hub_api_runtime verified with only hub_api membership. Result/release/object writes and RESET ROLE elevation denied. Database currently0submissions/0releases. Production Vercel contains only ZERO_HUB_API_DATABASE_URL (restricted sensitive direct URL), ZERO_HUB_EMBEDDED and ZERO_HUB_ORIGIN; administrator integration variables remain development-only. Private credentials stay ignored and are never printed. No public deployment yet. Next: reviewable feature PR, trusted maintained starter-library bootstrap, then read-only deployment and actual public checks. Do not enable candidate uploads/checking to populate the catalog.

The earlier separate-Neon sign-in question is obsolete. Owner input is not currently needed; Codex app status readback active. A recurring needs-input badge has not been confirmed cleared. Storage322GB healthy, weekly68% remaining at recovery; account-wide readings are not task cost.

## Delivered

ZeroHub consolidation is locally complete and independently reviewed: code19eaad7, tutorial clarity3d21d0b. Brand ZeroHub, frontend /hub and /hub/prepare, backend /api/hub. Everything is maintained in codepetca/zero; old Community catalog/Workshop/admission/editor actions and extra ZIP are removed without compatibility redirects. Useful libraries live in libraries/ with ordinary Java, explicit updates, MIT and source provenance. Student uploads remain database/artifact storage, not source folders in Zero.

Whole local flow passed: prepare/download/edit/upload/check/automatic list with authenticated contributor credit; exact Maven imports/pins; actual extension Add/Update/Revert; two native consumers through direct hub and production website gateway; edited downloaded preview on this Mac. ZIP/VSIX rebuilt and extracted compile verified. See docs/EVIDENCE.md and docs/VERIFICATION.md for receipts/check counts.

codepetca/zero-community was deleted under owner-approved retirement; subsequent authenticated lookup404. Complete local history backup /Users/stew/.codex/archives/zero-community-20261012.bundle verified. Old local checkouts are recovery material only; Zero has no dependency on them.

## Repository and authority

Worktree /Users/stew/.codex/worktrees/kit-integration/zero; branch codex/app-game-tutorials. Primary /Users/stew/Repos/zero contains unrelated funding work, preserved. No Zero push/PR/merge/deployment, live OAuth/account provisioning or public component publication in this phase. Owned browser/test servers/databases stopped; all23existing Pika/Supabase services remain running/healthy where configured.

Orchestrate used2bounded Sol/high source workers and1independent Sol/high reviewer with2turns,1small docs fix, no conflicts. Consolidation standard-risk review complete0blockers. Cumulative reviewer ledger11turns including3earlier failed security-review attempts. Effective model/tokens/cost/time telemetry unknown. Account weekly70% remaining at start; storage301GBcached/322GBfresh healthy. Owner task-scoped budget waiver persists without bypassing execution/correctness. DeepSeek remains explicitly paused. No new tool goal/task/automation.

## Next and public readiness

Obtain the still-missing independent checker-security review through a permitted path before public acceptance/activation; prior provider rejection remains, no bypass or equivalent repeated assignment. Checker policy/module/security source unchanged by consolidation.

Then separately authorize/configure hosted GitHub OAuth, managed database, durable storage and dedicated isolated checking workers with operational quotas/backups/monitoring/removal. Vercel hosts Next, not Docker checks. Local demo identity is not GitHub. Physical Windows/Linux/Intel, novice input and manually installed VS Code hub flows remain untested. Installer rebuild/signing/release outside this phase.
