# Native-default Run App — local implementation

Owner requests Run App use native JavaFX by default, browser compilation only
for publishing. Branch codex/native-run-default, base64d60a4f (Mac0.5.26 release).
Owner explicitly authorized merge and publication of this reviewed change
on2026-10-20. Local kit/extension/build27 staged; public metadata remains26. Existing live Mac0.5.26 remains browser-default.
Next: sourcePR/CI, signedMac27/candidate, publicbytes and metadata promotion.
No credentials or student profile changes.

Run App/sidebar/configured zero task run now use supported VSCode ProcessExecution
(or Windows ShellExecution) with the same clean compile javafx:run Maven wrapper.
run/native-run tasks both tracked for Stop/error lifecycle; old native command ID
is hidden palette compatibility alias. Queue/generation/project/save guards and
Stop settlement remain; workspace trust guards preserved before save/launch.
Busy upload/export/publication blocks native starts. Browser/API compiler remains
only on explicit Publish/advanced Export; validated output/publishing untouched.
Explicit export-preview command/error wording now identifies web export correctly.

Docs worker Sol/medium updated10operative docs, independently inspected. Initial
Sol/high complete20file review8bcbc5f0 found2P2 blockers: setuphelp still asked for
browser preview and stale-export recovery wrongly saidRunApp. Both fixed in one
batch; UIhelp now nativewindow/Mavendependencies/taskterminal, all browser snapshot
recovery directs Exportforweb/Publish. Validation logic/output guards unchanged.
Final161affected checks pass/1Windowsruntime skip,35website/doc-render checks
pass. Rootcheck passed before fixes; final rerun passed. Fullsuite interrupted
after unrelated Git binary fixtures took150–264s each underMacload265; no full
suite pass claimed. Targeted Sol/high remediation review clean atff4ab587. Release-version delta
review next; no code changes after that reviewed source.

Actual isolated officialVSCode clone /tmp/ZeroNativeQA.app/profile/project:
sidebarRun launched actual wrapper+FX child, terminal9Java/noGWT. Stop restored
Run and bothexactownedPIDs ended. Intentional missingsemicolon producedProblems1
and ShowProblems with Main.java[7,23]. Repaired finiteFXfixture exitednormally,
actualBUILD SUCCESS/Run/App stopped/noShowProblems. Its42.823s total underheavy
hostcontention is not a benchmark. JavaFXwindowtext/OSclose unavailable viaCUA
inventory/JDKbundle lookup; close/exitunitcontracts pass. InitialQAshellenvwarning
dismissed; screenreader mode onlydisposableprofile. PhysicalWindows/freshOS/
realGitHub/signedinstaller remain untested/unbuilt. No publicrelease/realstudent
state changed. Completion receipt will capture finalreview/check/cleanup status.

Weekly78%remaining; storage276GBhealthy. DeepSeek pause honored. One docsworker,
coordinator implementation, independent source reviewer next; effective model/
tokens/savings unknown. Primary dirty funding checkout preserved. No toolgoal,
separate task or automation. Keep owned worktree/ignored QA receipts until decision.

Packaging audit before sealing corrected bundled START-HERE nativeRun/setup/
firstdeps/browser-publishing text and extension/studentREADME27labels; first
unnotarized build cancelled, no bytes uploaded/sealed. Repackage/rebuild from
this clean source. Include this documentation+version delta in candidate review.
