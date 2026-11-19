# AI report triage active — 2026-11-19

[PR396](https://github.com/codepetca/zero/pull/396) merged `8d87dcd3c` after
independent security/compatibility review and all 12 final-head checks passed.
The [maintainer flow](../docs/AI-TRIAGE.md) and reviewed policy/prompt in `triage/`
are implemented. No student runtime or released 0.5.82 artifact changed.

The existing-chat Codex heartbeat `zero-report-triage-and-draft-fixes` is ACTIVE
every four hours locally; Codex and the Mac must be running. Use the dedicated
clean control worktree at `/Users/stew/.codex/worktrees/zero-ai-triage/zero` and
refresh only it to reviewed origin/main. Preserve the dirty original checkout.
Operational state and logs remain private outside Git; use CLI health/scan.

Future proposals remain draft-only: reproduce, preserve existing tests, independently
review and pass selected CI; human decisions control ready/merge/release. Initial
allowlist is four presentation helpers, four files/200 lines, three investigations
and one draft attempt per UTC day. Other changes require owner direction.

First real report6 is classified insufficient-evidence: builder-unavailable has
multiple expected/environment causes, and no actual defect is reproduced. No fix
or issue edit occurred. Its run is ended, with no outbox or active lease. Do not
reinterpret counts as users, a confirmed defect or proof of recovery.

Production privacy disclosure is live. A scheduled wake and real defect-to-draft
publication are not yet exercised. Follow [evidence](../docs/EVIDENCE.md) and
[verification](../docs/VERIFICATION.md); released 0.5.82 remains verified in the
[release ledger](../docs/RELEASE-LEDGER.md). No release work is pending here.
