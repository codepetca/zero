# Current state — Zero 0.5.16 local review candidate

## Goal and authority

Coordinator: Lead publishing task, thread
`01a13f98-55fc-7471-9038-1198b14d5a98`. Keep ordinary Java, explicit object updates,
strict browser compatibility, locally tested-build publishing in GitHub, and
ZeroHub Play links to student-hosted apps. Source submission in Pika stays separate.

Owner authorized local student-release preparation and testing. Sky Hop's earlier
scoped test Pages publication is accepted. Zero source push/merge, distribution
release, production signing/deployment, new game publication and ZeroHub activation
remain held. Overall goal is incomplete. Finish release gates before rollout.

## Prepared delivery

Work only in `/Users/stew/.codex/worktrees/web-export/zero`, branch
`codex/web-export`. Reviewed preparation source `515c064`; core 0.1.3, kit/extension
0.5.16, native Mac build 3. Game/compiler runtime remains unchanged; profile
`e95aef9311ffb292eb2f64807dfe03fa64af47ab21c1eab6863dd6ca59f3b0b6`.
Original root funding checkout and game project preserved. No source workers remain.

Local immutable review directories (ignored):

- `dist/candidates/zero-0.5.16-local-515c064`: complete kit, starter, VSIX,
  checksums, release notes and local source receipt. Not a GitHub CI preparation.
- `dist/candidates/zero-0.5.16-macos-development-8badf36`: development DMG,
  build receipt and checksum. Unsigned for production, not notarized.

All four artifact checksums pass. Kit 2,871,797 B, starter 2,498,747 B, VSIX 357,322 B,
development DMG 4,371,702 B. See `.verification/student-release-0.5.16/candidate.json`
for exact hashes and revisions. Public kit 0.5.14, signed installer/feed 0.5.15/build 2
and sharing policy pin remain unchanged. Candidate is local review only and must
be repackaged/sealed after policy alignment and final CI. Current installed managed
preview is still 0.5.15; candidate 0.5.16 has not been installed.

## Acceptance and open gates

Root 425 tests: 424 pass/1 PowerShell platform skip/0 fail; website 104 pass/type/build;
configuration, package and verify:kit pass, including extracted Maven compile,
source/license/mode parity. Actual candidate VSIX engine + extracted starter
compiled with real GWT in the managed spaced cache; Chrome displayed Hello World,
zero captured warnings/errors. Compiler profile matches the live-tested Sky Hop.

Local ZeroHub request→trusted offline verifier→immutable release→enriched catalog
fixture preserves the recorded public receipt; legacy projection omits it. Actual
Hub UI Play latest opened the existing public Sky Hop and its ready canvas.
Source download remains separate and commit-pinned. This is local fixture acceptance,
not public registry membership or fresh trusted public verification. Owned test
servers/tabs closed; no new publication or account grant.

The Mac development DMG built and payload verification passed. Native
verify:framework remains incomplete: phase 2 window-focus timeout on default/retry
and explicit ARM JDK17. Logs retained; no assertion weakened. Existing installed
macOS browser/Upload/Publish/Copy/Open acceptance is reused for unchanged runtime.

Before student release, complete [the release gates](../docs/RELEASE-0.5.16.md):

1. Accept/test old 0.5.15→0.5.16 project compatibility or migration. Updates preserve
   older student-owned helpers; strict browser Run rejects their fingerprints.
   New project success does not establish safe upgrades. Preserve customized Java.
2. Coordinate the publicly available trusted-publisher SHA, operator policy,
   kit pin and enriched website rollout; accept a real linked game request/Play.
   Current pin `beaaca4e` rejects web receipts. Library execution remains closed.
3. Resolve native focus acceptance; test fresh GitHub/workflow consent, Windows
   school setup, classroom hardware/network and physical sound.
4. Authorize source integration/final CI, then signed/notarized/stapled Mac build3,
   sealed artifacts/feed and exact verified publication/metadata promotion.

Independent preparation review and targeted upgrade-note review are clean; no
runtime code changed this phase. Receipt `.verification/student-release-0.5.16/acceptance.json`;
reports, logs, checksums and browser fixtures colocated. [Verification](../docs/VERIFICATION.md)
records bounds. No additional review wave needed for these factual evidence notes.

## Prior live proof and effort

Sky Hop <https://armorup.github.io/zero-sharing-proof/> uses source `b3b6591` and run
<https://github.com/armorup/zero-sharing-proof/actions/runs/38789445991>.
All 68 public files/8,208,661 bytes match local build 95dc6665-5860-4674-a5cd-50fcd04a7c7c.
Detailed native/public proof `.verification/live-sky-hop/acceptance.json`; prior
[current-state receipt](archive/sky-hop-live-publication-2026-10-15.md).

Requested worker configuration GPT-6.1 Sol/high; effective model/tokens unknown.
Two reviewer turns, one initial/one targeted wave, one documentation fix batch.
One README packaging-link correction and owned pinned DMG-helper setup; native
focus failures retained, no source conflicts. Weekly remaining 73%→71% is shared
account usage, not task cost. Storage 340.6 GB free/healthy; DeepSeek remains paused.
