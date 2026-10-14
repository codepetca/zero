# Current state — Study padding follow-up; Mac release remains pending

Updated 2026-10-13. Worktree:
`/Users/stew/.codex/worktrees/github-sharing-adoption/zero`, branch
`codex/simple-app-padding`, based on main7c328667ea50dc5e53cda952168be454c58e5583 (includes upstream PR43).
Owner authorized Mac testing/release and requested padding in the Study app with
simple functionality inside SimpleApp. Normal student projects/accounts preserved.

New opt-in `padding(20)` in settings applies ordinary JavaFX Insets to the app root.
Zero is the default; invalid negative/non-finite values and use outside settings
have useful errors. Study checkpoint3–7 and10/11study retain this setting; the lesson3
instructions introduce it, lesson7 keeps it, and the Study example/API/style guides
use the same helper. Native harness asserts actual content bounds, remaining width,
screen replacement and configuration errors; finite Study checks assert edge bounds.
Local configuration check, finite checkpoints3/7/10study and Study example passed.
Independent source review39 (Sol/medium) found no blockers. Exact head598706e
passed full CI38494195492, including all native padding/input/error cases. PR44
remains draft so new API lesson instructions and compatible published kit links
can merge together. Native editor test hit
locked Mac; do not bypass unlock or claim visible padded app inspected.

Mac/kit0.5.9 remain public and immutable. Arrow-focus fix PR42 is merged4c364367;
reviewed0510source passed full CI38492387823. The owned coin game runs that fix;
owner movement-before/after-Restart question still pending. The previous sealed10
candidate `dist/candidates/mac-0.5.10-775e33daed41/` and metadata branch
`codex/mac-0510-release` remain intact but predate this padding request. Review38
verified that artifact/signature/payload/source/notary hash without findings. Apple
Accepted5c813edd-1aae-4f63-8326-24a5edc4446d, staple/Gatekeeper passed. Preserve those
bytes and receipts as superseded evidence; don't publish them as the updated10release.

Kit/extension0.5.10 and core0.1.2 are still local/unpublished; retaining these versions
is permitted for the updated candidate. Public Mac9manifest and kit9fallback remain.
Fresh kit and signed Mac10built from clean reviewed598706e. Actual Apple submission
f469b2bf-5a39-424e-b29e-a0743b0061ea is Accepted with exact retained input hash;
staple/Gatekeeper, universal signatures and payload bytes/modes passed. Local native
manifest is measured without public URL. Need independent candidate review40 and
clean seal. Then physical Mac walkthrough/coin input result, separate exact native/kit
publication, anonymous byte verification and reviewed promotion in PR44 with final
metadata CI/merge/live proof. Keep new lessons coupled to a kit containing padding;
no API unavailable in the public download should reach the live lessons first.
Never overwrite sealed/published bytes. Logs: `.verification/simple-app-padding/`.

Reviews39 complete; candidate40 planned Sol/medium. No padding remediation batches;
briefing base corrected from4c to7c, with unrelated upstream CODEOWNERS excluded. Existing task stop waiver persists;
no provider/identity bypass. Storage322GB healthy; no cleanup. DeepSeek paused.
Physical Windows/student trials deferred. Generic public executor acceptance remains
held, general game publication disabled, Neon retained; full adoption incomplete.
No new tool-backed goal/task/automation. Keep this worktree and superseded receipts.
