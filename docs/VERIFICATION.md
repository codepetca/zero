# Verification

## Lesson 12 full game — source PR, 2026-10-10

Baseline published f8f7829; isolated codex/lesson-12-game. All five stages remain
inside Lesson12: media-demo, scrolling-game, platform-game, level-game, full-game.
Core framework, shared ScoreDisplay, dependencies and published metadata unchanged.

Affected acceptance checks pass: configuration/source-link check; website26tests,
typecheck and production build; in-memory ZIP2tests including new example Java and
README bytes and extracted standalone compilation. No immutable release was rebuilt.
Native macOS JavaFX21.0.12 checks pass for media-demo(3.96s), scrolling-game(2.42s),
platform-game(2.68s), level-game(2.29s), full-game(2.40s). They cover cached media,
camera clamping including small worlds, fixed HUD and drawing transform restoration,
solid floor/wall/head response, frame cap and jump edges, once-only collection,
level score/retry rules, danger, locked exits, win/loss freezes and repeated restart.
The final game also completes both levels twice using synthetic held keys and
1/120second updates without teleporting the player. Other state checks intentionally
place objects to isolate transitions. No physical keyboard/novice play claim.

Coordinator caught and worker corrected two harness defects (early scrolling
contact assertion and JavaFX Platform import shadowing) plus a real physics bug:
floating residual steps cleared grounded on a floor. Integer bounded step counts
fix that bug in all three gravity stages; final native checks above pass.
An earlier platform at80px was reduced to70px to fit the actual discrete jump.

Local production browser checks pass:11→12 navigation, five collapsed stages,
stage→example links, complete8Java/2resource copy lists, current Player source,
actual PNG/WAV downloads with byte parity, no horizontal overflow or error logs.
The example guide links now open runnable pages instead of raw README text.
Ignored evidence: .verification/lesson12-game/lesson12.jpg and game-playing.png,
game-won.png. Game images are native JavaFX scene snapshots from a disposable
renderer running the same complete game check; they are not OS screenshots.
Physical Windows/Linux, audible output, physical editor/keyboard/setup flow and
novice classroom trials remain unverified. Source PR21 is owner-authorized;
no new immutable release or direct deployment is included.
Independent standard-risk lesson12_review/turn1 GPT-6.1-Sol/high accepted
f8f78290e3fd6cc3cae9ddfde9d79534778b9c87..8c9896d53bc3ea2674b640c907a3184555383142:
all46files covered, no blocking findings. Independent focused learning7tests and
full-diff whitespace check pass. Coordinator UTC observations indicate~150seconds (approximate); effective model
and attributable tokens unknown. Ledger:1launch/1initialwave/0fixbatches; no redundant
integration wave. Subsequent receipt/pilot wording changes are coordinator-checked;
reviewed implementation is unchanged. Native Restart only sees canvas-held state:
focusing its button clears that state, so OS repeat after refocus needs a physical
pilot. Synthetic jump-reset coverage does not establish that physical guarantee.

Original-head [PR21](https://github.com/codepetca/zero/pull/21) Actions
[38101600157](https://github.com/codepetca/zero/actions/runs/38101600157) passed:
full extension/kit tests, release guards, all finite Linux JavaFX examples under
Xvfb/virtual audio, website tests/types/build. Main PR20 changed only policy and
documentation; integration preserves the exact reviewed game/site/runtime source.

## Current published delivery — 2026-10-10

Zero0.5.3 and Community0.1.3 are published. The complete source/review/CI/PR/release
index is [EVIDENCE.md](EVIDENCE.md); [release/kit.json](../release/kit.json) and
[release/community.json](../release/community.json) preserve actual asset metadata.
Historical local-only status below the old handoff is superseded by this delivery.

144extension/kit tests,24site tests,types/build, configuration/link checks and
finite native examples passed for publication. Linux CI used Xvfb plus virtual
PulseAudio/ALSA for real AudioClip playback/finish state; this did not test speakers.
Community had two reproducible builds,6JavaFX checks and4actual consumer apps.

All3Zero and9Community public downloads matched exact sealed/source-bound bytes.
The real live-page Download Zero click matched the canonical ZIP. New-cache,
empty-settings public Maven gateway consumption passed native segmented-health-bar
checks. Historical0.5.2/0.1.2 artifacts remained byte-identical.

Independent reviews covered the source release delta, two CI/media corrections,
public catalog/provenance/legacy compatibility and final two-file kit metadata.
The evidence index records exact revisions; AI reviews are not GitHub human approvals.

## Limits

Synthetic macOS actions and virtual Linux CI do not establish physical editor
setup/input, Windows/Linux classroom machines, native chooser interaction,
audible device output, school restrictions or novice usability. No live AI
provider, public student acceptance or automatic Community approval is claimed.

## AI workflow audit/remediation

Audit:43Zero release tests plus48Community admission/acceptance tests passed.
Reproductions exposed CI-policy identity and two AI interface boundary gaps.
Remediation:39admission and25acceptance/release tests pass, including no-op
workflow, policy changes/modes, main/head drift, exact outbound-byte boundary and
invalid schema cases. Zero43release tests,24website tests, types/build and
configuration/link checks pass. Two initial independent scopes and the targeted correction review are complete.
Both accepted P2 authority-snapshot/publisher-doc findings are resolved; no new
blockers. Five reviewer race checks passed in2.173seconds. Runtime source matches
the reviewed Community6be28609; Zero1d37a702 is documentation only. Final receipt
edits are coordinator-checked. GitHub main protection was independently read back
after review, then removed at the owner's explicit request. Source changes and
CODEOWNERS are in owner-approved PR20/PR5; recover actual merge status from GitHub.
No kit/library/extension version changes or new immutable releases are included.

## Historical verification

[Earlier checks and phase receipts](history/verification-through-2026-10-10.md)
retain prior trial evidence and limits. They describe their recorded revisions,
not current published state or new authorization. Full logs, screenshots and
archives remain ignored under `.verification/`; the tracked index is sufficient
for a fresh agent to locate durable public evidence.

## Guided setup — local 0.5.4

`8032789`: full npm test passed178tests in127.901seconds. Launcher12tests use
macOS Bash3.2 fake tools/disposable kits (8.594seconds); Windows script execution
was not performed. Release publisher/review43tests and kit3tests pass.
`61025bf`: 46 affected setup/editor/onboarding/workflow tests passed in0.171seconds;
unchanged full-suite coverage reused. Both accepted independent-review P2 findings
are resolved. A reviewer independently confirmed task-env drift blocks Run handoff.

Final configuration/syntax/command/documentation-link and whitespace checks pass.
Regenerated complete ZIP/starter/VSIX pass exact source/license/metadata/permissions
checks and a standalone extracted Maven compile. The complete kit includes the
pre-existing merged Lesson12 game stages. The website's published0.5.3 download
was not changed. Artifact sizes/hashes and logs are in the ignored guided-setup
receipt and local dist/release.json. No further runtime change after61025bf;
final README wording/receipt edits are coordinator-checked.

Read-only checks use fixed bounded version probes. Tests cover missing/old/mismatched
JDKs, invalid JAVA_HOME, quoted paths, optional Git, profile-specific extensions,
cancellation/blocked repair, missing files and POSIX wrapper permissions. Relevant
terminal environment overrides (including null/interpolation/Windows mixed case)
leave readiness unverified rather than changing settings or assuming the task JDK.

No real installer, host extension/profile/account mutation or system-policy change
was executed. Native Windows PowerShell/cmd, physical Linux, fresh-machine macOS
installs, actual permission prompts, school proxies/policies, native picker use and
novice setup remain unverified. Version checks do not establish a working app window;
Run first app and visual confirmation remain explicit student steps. No publication.

## Setup reliability follow-up

At e2fad4b,27launcher tests passed in20.367seconds; at corrected a6078be,
34passed in28.067seconds. Fake-machine tests cover old/minimum/new/unknown VS Code,
known app fallback, path selection, invalid metadata, managed install/upgrade,
cancellation, current package/configuration guidance and selected JAVA_HOME.
Correction cases model Homebrew's named-outdated status1 and explicit auto-update
cask filtering; unnamed inventory filters exact names. Real inventory failure,
unrelated/prefix names, failed installation/update with recheck, Git formula
handling and read-only checks are covered. No real package-manager mutation.

4kit tests passed in4.019seconds, including metadata/engine policy agreement,
unsupported range rejection and standalone extracted Maven compile. Configuration,
syntax, documentation links and whitespace pass. Regenerated ZIP verification
passes exact bytes, licenses, canonical sources, executable permissions and
standalone build. Metadata/extension policy is not duplicated in script constants.
Unchanged editor/framework source retains prior checks; the full suite was not
repeated for this shell-only correction. Independent initial and targeted source
reviews are accepted; final receipt-only changes leave runtime unchanged.

macOS Bash3.2 fake-tool execution is verified. PowerShell/native Windows, actual
Homebrew/winget installers, clean-machine profile/editor interaction, school
network/policies and novice usability remain unverified. Known-location discovery
is bounded, not an exhaustive machine inventory. No native EXE/app/DMG is claimed.
