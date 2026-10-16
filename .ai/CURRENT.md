# Current state — Windows CI passed, 2026-10-16

Owner authorized pushing the Windows branch, opening a draft PR and running CI.
[Draft PR77](https://github.com/codepetca/zero/pull/77) is open and attached.
Signing, production publication, merge to main, accounts and paid services remain
deferred. Public downloads/feed were not promoted. DeepSeek remains paused.

Branch codex/windows-auto-setup; implementation worktree
/Users/stew/.codex/worktrees/windows-auto-setup/zero retained. Original dirty
funding checkout and other chats untouched. Main456b490 was merged into this
feature branch; incoming tutorial source and both evidence histories preserved.
Independent source coverage includes original installer/readiness, flow polish,
main synchronization and all3CI correction deltas through7ed8cda.

[Windows CI38935344735](https://github.com/codepetca/zero/actions/runs/38935344735)
passed source7ed8cdab5ce6a205ea1632e6f0982b3d66e737f5. Tested merge commit
02e20a5dfda1678c7dad7172f54820775c24c5b3 has an identical tree. Actual hosted
Windows Server2022 build20348/PowerShell5.1:968native checks,11updater checks,
15package/key/signing checks with3POSIX-onlyskips; actual Setup packaging/install,
Start shortcut, private Java/compiler/extensions, graceful editor close/reopen
passed58.5sec; automatic online/offline clean JavaFX rebuild/window/update/close
passed26.6sec. This is not interactive Windows11/SmartScreen/signed A-to-B proof.
Linux release checks also passed final source7ed8cda in38935344780, alongside
earlier9c625e0 and3a3cf80. Evidence-only documentation may have a newer head.

CI corrections: canonical LF checkout with CRLF .cmd, real Git checkout regression,
fail-fast native PowerShell steps, explicit pinned cross-host reference-assembly
graph with locked restore preserved, visible build stdout diagnostics, and a
bounded wait for Electron's window before the graceful reopening smoke. Sol/medium
integration plus3targeted reviews passed;4turns/3fix batches/no findings, within
7/4/60min limits. Earlier reviews reused unchanged. Native product code unchanged
by CI corrections. Tokens/effective configs unknown; no writer conflicts.

CI-tested unsigned Setup10692831bytes/SHA256
789025e9d7b90344efbb9872fb9e823c3f3193c67f3c7cf2599cecc8183eccdf.
Latest self-contained packet dist/installers/Zero-Windows-0.5.18-trial-7ed8cda.zip
10745997bytes/SHA2567f9e4d724377adbfae3dbe2aca6ed0f085771ea75bca285c2ceb8cadd0ca3fc8.
It includes the exact CI-tested Setup/receipt, reviewed automation/pins, small CI
receipts and START-HERE. Production updater deliberately disabled. Earlier local
candidates remain preserved. Ignored proofs: .verification/windows-auto-setup/
ci-38935344735 and ci-*-failed/full logs. No credentials or keys in the packet.

Next: ordinary-account interactive Windows11x64 Run/Edit/Stop, saved project,
offline/retry/cancel, keyboard/DPI/Narrator and school policy trial. Signing and
real authenticated signed A-to-B trial remain later release gates. Production
feed key already outside Git; owner encrypted backup still needed before release.
See docs/WINDOWS-TRIAL.md, WINDOWS-INSTALLER.md and docs/EVIDENCE.md.
