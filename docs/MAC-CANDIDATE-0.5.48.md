# Mac 0.5.48 candidate acceptance — 2026-10-24

Local candidate prepared, signed, notarized, stapled and installed for testing.
It is **not published or approved for student rollout**. Public Mac download and
production feed remain0.5.47. No push, PR, merge, feed/site/template deployment or
release publication occurred in this phase.

## Exact candidate

- Kit/extension0.5.48, core0.3.0, native build48.
- Built source31c42a481ea7fc1f338775a4db11c6f61203a567.
- Preparation source498d651a5a2329c3031aefeeb6d83b7385c3237f; protected build
  inputs are equivalent and build receipt records clean source.
- Ignored sealed directory: `dist/candidates/mac-0.5.48-498d651a5a23/`.
- DMG `Zero-0.5.48-macos.dmg`:5,915,143bytes;
  SHA256 `3a7e76ba133cfb1828861b72fbf99307d405b75dfcca2b534c46a089e25128ef`.
- Apple Accepted submission6b3a766f-7ef7-4bc5-985d-a6fa10bf9366. Actual app/DMG
  Developer ID, staple and Gatekeeper checks pass. All13sealed files pass their
  checksum manifest; full DMG and appcast Ed25519 signatures pass independently.

## What changed

Mac embedded preview Cmd+A now selects the focused text input/textarea. Only an
exact-token embedded preview URL derives its index response to add this handler.
Validated project snapshots, exported files, external browser bytes and other
assets remain unchanged. Existing project-owned builders benefit without an
upgrade. Clipboard/Ctrl/canvas shortcuts retain their existing handling.

The actual Mac baseline appended Alex to Sam in the embedded field, while Chrome
replaced it. The first fix exposed VS Code URI encoding of `=`; the corrected
unreserved token passes actual source and installed-host tests: Hello, Alex!
Bundled version instructions now agree with the kit, with a consistency guard.
No public Java API changed.

## Actual installed acceptance

- Manual exact-DMG app replacement47→48 triggered native kit/VSIX preparation
  and the idle editor reload. Installed Extensions showed47before and48after.
  An actual unsaved note survived reload and later clean-setup isolation/restore.
- Native Greeting reached App UI ready. A deliberate missing semicolon produced
  a Zero Java compiler Problem at Main.java11:51; clicking navigated there.
  Restored source returned to App UI ready with No Problems. The Java language
  server also reported the same error independently.
- The installed editor freshly compiled Greeting through WebFX. Its embedded
  preview displayed Hello, Alex! after Sam → Cmd+A → Alex. No student framework
  or build upgrade was needed.
- All three original student repositories retain exact tracked source/build
  bytes, HEAD and status. Existing bundled starter bytes and editor settings
  are unchanged by the upgrade.
- With kit and private editor/runtime folders absent, the same installed app
  provisioned fresh Java/Node/editor support and opened Zero Start Page. Browser
  sign-in selected armorup and returned without a code. Code fallback is visible;
  this phase did not complete another device-code authorization. The disposable
  profile was signed out through Zero before being retained privately.
- Fresh starter and a controlled first Run after Greeting initialization reached
  stable App UI ready, No Problems, until explicitly stopped. Native window
  gameplay/input was not available through the automation interface.
- Actual native Check for Updates reports published47as newest available while
  running48. No production feed was changed. This is manual upgrade acceptance,
  not production Sparkle47→48download/install acceptance.

## Checks and review

Root check and diff check pass.27focused preview/runtime/UI tests pass.
Installer/release/update tests:30pass,2conditional skips. Full suite:1,141pass,
3Windows/PowerShell skips,0fail. No new GitHub CI run was triggered without push.

Independent Sol/high source review and targeted closure are complete/clean.
One P2 bundled VSIX filename finding was fixed before the final build. Independent
Sol/high sealed-candidate review is complete/clean, covering metadata,13hashes,
source equivalence, signatures and retained published47metadata. Effective model,
per-turn elapsed time and tokens were not exposed. Two reviewer assignments,
three review turns; one review remediation batch. Separate read-only worker
preflights and the native early-Run investigation are not source review turns.

## Remaining before publication

Two early native Run attempts after folder/profile initialization ended as App
stopped without retained readiness/error output. Repeats and the controlled first
Run after Java Ready passed and stayed ready. The cause is **unproven**. Source
inspection found legitimate generation/cancellation paths, but no evidence
justified a speculative fix. Retain this QA observation and diagnose/reproduce
it with task-start/termination evidence before promoting the candidate.

Fresh setup was on the existing Apple Silicon Mac with existing global tools,
preferences and Maven cache. A separate fresh machine, managed school network,
physical Windows, native-window interaction and production update delivery remain
unverified. Publishing needs separate authorization and the normal source/CI gate.

Evidence is retained in `.verification/mac-student-rc/`: progress and preservation
JSON, source/packaging/test logs, signed receipt, fresh setup/auth/native/error/
WebFX/update screenshots. Private original and clean-test app/kit/editor rollback
state lives outside Git. The installed candidate and restored upgraded editor
session remain available; the old app remains recoverable. The original Zero Dev
watcher/profile are preserved; its editor window was closed normally for isolation.

Follow-up,2026-10-24: the next phase reproduced task discovery stopping an active
game. VS Code automatically invokes the same resolver during startup. The local
0.5.49 change makes discovery side-effect-free and defers preparation to actual
execution; source-host picker regression passes. Historical early attempts had no
trace, so their individual causes remain unproven. The sealed48files stay intact.

Follow-up complete: the corrected local49candidate passes installed upgrade,
first Run, task discovery, configured restarts, rejected retry, compiler recovery
and retained WebFX/select-all acceptance. See [49acceptance](MAC-CANDIDATE-0.5.49.md).
The sealed48artifact remains unchanged; public release remains47.
