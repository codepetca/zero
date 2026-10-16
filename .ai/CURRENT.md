# Current state — audio investigation, 2026-10-16

Coordinator: Lead publishing task, 01a13f98-55fc-7471-9038-1198b14d5a98.
Goal: ordinary Java, strict WebFX, browser-first Run, tutorials beside code or in
a browser, and simple student-owned publishing with verified ZeroHub Play links.
Student release is incomplete. User now requests investigating the intermittent
audio issue and archiving completed coordinating chats.

## Accepted milestone

PR78 merged as 1b63ae6ce07f467ab4c4600d78507157ad3bdc7c; tree f33e59fe exactly
matches tested a267d41. Linux38960026817, browser38960026736 and Windows38960026787
passed. Linux included audio/framework, all27examples,16checkpointvariants,
115website tests and package/extracted verification. Hosted Windows install/reopen
and online/offline JavaFX passed; physicalWindows/signedupdate remain deferred.
Production deployment7128623333 succeeded. Root actualChrome checked downloads,
three tutorial template links and setup/browser/Git instructions. Public apps
remain0.5.17; guides label0.5.18 unreleased. Copy showed success but automation
clipboard read empty; two listener-channel console errors had no established cause.
Receipts: .verification/release-readiness-20261016/public-website-1b63ae6/.

Installed Mac0.5.18 all106 authored files match integratede1c3b83; subsequent merged
changes only affect CI/maintainer checks. RealChrome wrong/right/Stop passed,
Study restored. No fresh OAuth/clone/push repeated. Unsignedcandidate4a9e889 DMG is
historical, not final signed distribution. Native receipt: samebase/pr78-native/.

## Current investigation and ownership

Canonical worktree /Users/stew/.codex/worktrees/release-readiness/zero, branch
codex/audio-timeout-investigation, base merged1b63ae6. Coordinator is sole writer.
Completed chats Review verbose action confirmations and Audit Windows install and
updates were archived at direct user request; do not reactivate them automatically.
Root preserves original fundingcheckout, QA app/profile, trial Java/Git and assets.

Prior Linux audio example timed out intermittently; finalCI pass did not establish
a root cause. Diagnostic logging keeps15sdeadline/assertions. Twelve unchanged
Ubuntu24/LinuxARM audio runs now PASS using pinnedJavaFX21.0.12/Java17/PulseAudio.
Twelve unchanged emulated Linuxx86 runs also PASS. Instrumented3runs,60early-close
players and60rapid-control sequences passed. Hosted38979041632 passed native
framework/audio, all examples and every remaining CI gate. No production
change or claimed fix; intermittent risk remains unresolved. Read-only GPT-6.1Sol/high analysis
confirmed secondMusic is closed before its FX READY callback, with native dispose
or rapid controls still unproven suspects. Root completed the isolated container experiments; all own containers exited.
Bounded audio investigation is complete: not reproduced, historical cause remains
unresolved. Do not claim a fix. On a recurrence, inspect the retained phase/FX
thread trace before another correction; no automatic monitoring or rerun scheduled.
Evidence: .verification/audio-investigation-20261016/ (snapshot, logs, analysis).

New local investigation is authorized, not new pushes/deployments or app/game
publication. Prior PR78-specific review-stop waiver completed with that PR;
retain its10fix/10targeted/12reviewturn ledger, do not reset/reuse authority.
DeepSeek remains explicitly paused through2026-12-31. Starting weekly remaining40%,
315.1GB free healthy; shared readings are not per-task usage/cost telemetry.

## Remaining release gates

Five complete public-template updates; trusted publisher/operator pins and real
ZeroHub Play/source acceptance; authorized current-candidate Pages publish and
public-byte parity; final distribution rebuild/seal, Mac signing/notarization and
release assets/feeds; school/novice trial. Physical Windows later by owner choice;
correct its nonblocking browser/native trial wording before that trial. Development
updater OFF does not mean authored production trust configuration disabled.
These publications/activations and live student actions remain separately held.
This recovery handoff is local and unpublished; historical receipts retained in
.verification/release-readiness-20261016/pr78-integration/ and docs/EVIDENCE.md.
