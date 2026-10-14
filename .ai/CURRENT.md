# Current state — Mac 0.5.9 live; arrow-focus patch 0.5.10 in progress

Updated 2026-10-13. Worktree:
`/Users/stew/.codex/worktrees/github-sharing-adoption/zero`, branch
`codex/canvas-arrow-focus`, based on main4d5526785b0458f36fe30005bba2742413b73b25.
Owner authorized Mac testing and release; Windows/student trials remain deferred.
Read PRODUCT/DEVELOPMENT before changes. Normal user projects/accounts preserved.

0.5.9 source PR40 and metadata PR41 are merged. Metadata headc2fe164 passed exact
CI38487839153; independent review32 (Sol/medium) found no issues, including its
own anonymous byte and source-tag checks. Production deployment7053217808 targets
merge4d552678 and succeeded. Real publisher verify-only checked all public kit
assets and live landing/Downloads kit bytes; a separate live Mac anchor/hash check
passed. Native setup tagsetup-v0.5.9 targets preparation3c0ed2e; kitv0.5.9 targets
reviewed buildf7c7335. All frozen bytes/signatures/notary receipts stay immutable.
Native/sealed candidate and logs: `.verification/release-0.5.9/` and
`dist/candidates/mac-0.5.9-3c0ed2e24ae4/`. Old mutable9outputs preserved separately.

Actual isolated editor created three blank local projects, ran all three, reran
edited Greeting and stopped its old process. Local-only/Git-disabled markers passed.
Study/Game reused byte-identical maintainer ScoreDisplay test input. Owner confirmed
all app windows appeared. Later owner reported Down moving focus onto Restart.
That defect is reproduced by a real JavaFX regression: unconsumed canvas Down
traverses to a native control. The framework fix consumes arrow presses only while
canvas-focused; Tab/native text controls retain normal behavior. No new student API.
Local fixed-game source was copied only to the owned test project and relaunched;
owner movement-before/after-Restart question is pending. Local smoke reruns hit an
inactive native window (focus ownerCanvas, window=false); bounded startup focus
wait and virtual-display CI coverage are being checked. Do not claim those passes.

New kit/extension0.5.10 and core0.1.2 are local, not published. Verified9kit now forms
the fallback; published Mac9manifest/README links remain. Source changes are small:
SketchApp arrow consumption, meaningful native-control regression, CI smoke command,
versions/fallback and factual docs. Need checks, independent review33, draft source
PR, exact-head CI/merge, clean kit10package, existing signer/notary/seal, then separate
immutable releases and reviewed metadata integration/live proof. Reuse existing
credentials only; do not rebuild or overwrite any9bytes. Current Mac editor path:
`/private/tmp/zero-059-ui-ucf3zq61/Applications/Visual Studio Code.app`.
Owned patched game `/private/tmp/zero-059-ui-ucf3zq61/zero-project-game` is running.

Cumulative reviews32, source correction batches2 plus preview-test correction1.
Stop waiver remains; no provider/identity bypass. Requested models/efforts recorded;
effective telemetry/tokens/time unknown. Storage321.4GB healthy; no cleanup. DeepSeek
paused. Generic public executor remains held after provider rejections; general game
publication disabled; Neon retained. Full GitHub adoption incomplete. No new goal,
task or automation. Keep this worktree while the patch/adoption scope remains active.
