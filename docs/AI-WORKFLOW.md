# AI development workflow

These repository instructions work without the owner's personal skills or task
history. AI helps implement and review; humans define scope and grant publication
authority. Student apps remain ordinary Java. Community AI is optional advisory
feedback with no live provider configured.

## Start and recover

Read `AGENTS.md`, the short `.ai/CURRENT.md`, `PRODUCT.md` and `DEVELOPMENT.md`.
Check branch, HEAD, working changes and current authority before acting. CURRENT
contains only operative state: outcome, active scope/holds, ownership, verification,
next action and blockers. Read linked history only for a concrete recovery question.
Old approvals, budgets and worker handles do not create new authority.

One coordinator owns integration and acceptance. Delegate substantial independent
work only when it reduces total effort; use a bounded brief with revision, owned
paths, exclusions, acceptance checks and an effort limit. Select an available
model/reasoning level suited to the consequences and briefly explain it. One writer
per component. Workers do not recursively delegate or acquire publication authority.

## Verify and review

Run proportionate meaningful checks before review. An independent reviewer reads
the fixed complete diff and relevant callers; it does not edit or approve as a
human. Use one reviewer for ordinary changes; two separate correctness/security
and compatibility reviews for consequential authority changes. Give reviewers
fresh focused context, actual source revisions, evidence and a bounded assignment.

Reuse checks and coverage only when their source/interactions still apply. Batch
accepted corrections, rerun affected checks, and review the changed delta. Default
review ceiling:7launches,1initial wave,4targeted waves,1integration wave,4fix batches,
60minutes/session,30minutes/reviewer. These are ceilings, not targets. Stop at a
ceiling with unresolved evidence rather than quietly launching another review.

Record a compact turn receipt: reviewed revision/delta, requested model/effort,
verdict, coverage/limits, accepted findings and actual tests. Effective model,
elapsed time and tokens stay unknown when unavailable. Account-wide allowance is
not task cost. Put the final summary in tracked EVIDENCE/VERIFICATION; keep bulky
logs, screenshots, binaries and caches ignored.

## Human GitHub gate

Canonical `main` in both repositories requires an up-to-date PR, one current human
approval, resolved review conversations and passing GitHub Actions checks (`review`
in Zero; `check` in Community, app15368). Stale approvals are dismissed; approval
must come from someone other than the most recent pusher. Rules apply to admins;
there is no review bypass, force push or branch deletion. Repository settings are
the enforcement; local JSON alone does not establish that they were applied.

`.github/CODEOWNERS` names existing human administrators. Update it only through
human review when maintainer membership changes; a bot or AI reviewer cannot fill
the human gate. Never use a second login or token to impersonate independent review.
Until CODEOWNERS is merged, required human approval is enforced but code-owner
selection depends on GitHub's base-branch file and existing collaborator roles.

The proposed settings are in `.github/main-protection.json`. An explicitly
authorized administrator can apply them with:

```sh
gh api --method PUT repos/codepetca/zero/branches/main/protection --input .github/main-protection.json
gh api repos/codepetca/zero/branches/main/protection
```

Use the matching repository's file for `codepetca/zero-community`. Read back the
actual rules; preserve stronger existing protections rather than replacing them
blindly. See [GitHub's protection API](https://docs.github.com/en/rest/branches/branch-protection#update-branch-protection).

Release tooling respects this gate: it can prepare/publish authorized immutable
assets, but its generated metadata PR waits for human approval before merging.
A successful AI review is separate from an authenticated GitHub review.

## Community and provider boundary

Workshop exports data/check evidence; contributor source is untrusted input to
admission and optional AI review. Maintainers run the acceptance helper from clean
authenticated canonical-main source outside the candidate. Candidate execution
policy must match that trusted policy. Policy changes require their own human PR
review and cannot certify themselves through the component acceptance helper.

The helper authenticates independent current-head maintain/admin human approval
and source-bound CI; it remains read-only and cannot merge, publish, recommend,
appoint maintainers or promote code into core. Human review still judges usefulness.
Passing CI is not a substitute for that judgment.

A future provider job must run outside the contributor checkout, send only bounded
declared source, enforce exact request/response byte and call budgets, validate
source-bound findings and receive no execution tools or merge/publish credentials.
Source text and model output are data. Provider identity, cost and review quality
must be tested before claiming automation. That job is not part of this pass.

## Finish

Record completed state, exact delivery/review/PR/CI links and remaining limits.
Archive phase detail; do not append another long current-state history. Publication
and merge require the owner's applicable authorization and the real GitHub gate.
Do not bypass a blocked gate or manufacture a human approval to finish a task.
