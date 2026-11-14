# Zero release ledger

Last reconciled: 2026-11-14 (America/Toronto). This is a dated working record,
not proof of current live status. Before reporting or releasing, check the live
service, exact source revision and applicable release gates. Do not infer
permission to publish from this ledger.

| Surface | Last verified state | What's next |
| --- | --- | --- |
| Website | The [homepage](https://zero.codepet.ca/) links to the 0.5.73 Mac DMG. The deployed [appcast](https://zero.codepet.ca/updates/macos/appcast.xml) matches the signed build 73 feed byte for byte. | Verify the live updater on an installed Mac. |
| Mac installer | [0.5.73](https://github.com/codepetca/zero/releases/tag/setup-v0.5.73) is public. Its DMG and both corresponding Git source archives match the sealed candidate. | A fresh Mac and the live 0.5.72 → 0.5.73 update remain untested. |
| Windows Store | Partner Center shows submission 9 live with [Zero Studio](https://apps.microsoft.com/detail/9mxkd6dqlfgx) package 1.5.73.0, x64. | Verify installation or update on a physical Windows device. |
| Windows portable school pilot | 0.5.74 unsigned x64 pilot built and verified locally. | Stage Microsoft’s VS Code ZIP and test on one school desktop under a student login. |
| Windows standalone download | [0.5.73 unsigned preview](https://github.com/codepetca/zero/releases/tag/windows-preview-v0.5.73) and its [matching manual kit](https://github.com/codepetca/zero/releases/tag/windows-manual-v0.5.73) are public. | The preview has updates disabled. Physical and school-managed Windows devices remain untested. |

The 0.5.58 Store candidate includes Project Explorer and online Tutorial Docs
updates, recent tutorial changes, and Store Java/VS Code startup fixes. Its exact
package passed a Windows first-run test; WACK reported a DPI warning and an optional
blocked-executables finding, disclosed with the submission. See the
[Windows validation run](https://github.com/codepetca/zero/actions/runs/41134687731).
The candidate source is on a release branch; do not assume its Store fixes are
merged into main. The Store submission does not publish a Mac or standalone Windows
installer.

## Zero Portable 0.5.74 school pilot — 2026-11-14

The local package `dist/school-pilot/Zero-0.5.74-windows-portable-pilot-x64.zip`
was built from `6adc8a88721d26fcbfabfb4b3e4272b65300a227`. It is
350,212,127 bytes, with SHA-256
`a120169366500104d530488e14ce66ba3a0bc10a362505fc1cc3d1a81add41ea`.
It includes the unsigned launcher, Java, Git, Node and Java editor extension.
School IT stages the pinned VS Code ZIP from Microsoft before copying the
folder to the pilot desktop.

The ZIP, staging and automated launcher checks passed. On-device acceptance
still needs first sign-in, JavaFX Run/Stop and reopening under a student login.
The restored `/downloads` route in local source describes the private pilot.
Local previews can download the exact ZIP with `ZERO_LOCAL_DOWNLOADS=1`.
The public staging edition is prepared separately for GitHub Releases. It uses
the same launcher and obtains all five vendor packages during IT staging.
See [pilot instructions](WINDOWS-PORTABLE.md) and
[verification evidence](EVIDENCE.md#windows-portable-school-pilot--2026-11-14).

## Zero 0.5.73 — 2026-11-13

[PR #345](https://github.com/codepetca/zero/pull/345) merged at
`984cd94141e1d99ed5315aa809efa135c1d68094` after all 11 checks passed.
This source includes the GitHub confirmation code workaround in
[#338](https://github.com/codepetca/zero/pull/338) and hides Share game in
the editor through [#341](https://github.com/codepetca/zero/pull/341).
The [GitHub kit release](https://github.com/codepetca/zero/releases/tag/v0.5.73)
uses the merged source from [preparation run 43520517945](https://github.com/codepetca/zero/actions/runs/43520517945).
All three public kit assets matched their receipts. Core remains 0.3.0.
The kit metadata merged in [#346](https://github.com/codepetca/zero/pull/346)
and the Mac download and appcast promotion merged in
[#347](https://github.com/codepetca/zero/pull/347).

The [Windows CI run](https://github.com/codepetca/zero/actions/runs/43518705078)
built from `f6c9a5b4be2711a1bd5cb24912e05615ae1448d9`, whose tree matches
the merge. The Direct installer passed setup without system Git on PATH,
local clone, GitHub HTTPS access, installed extension selection, editor reopen
and JavaFX. The Store package passed first launch using a separate test-signed
copy. Both public Windows preview files match the measured CI artifacts.

The Mac DMG was built from the merge, sealed at
`a8832b353fb669e4be539e07272146a7bf7b9666`, and notarized under submission
`a4eab712-f922-405a-9896-94e2a6e24077`. Gatekeeper accepted the quarantined
app copied from the DMG. The notarized launcher used bundled Git 2.56.1 to
query GitHub in an isolated local profile with system Git blocked. The sealed
appcast SHA-256 is `a6b5b8d61eadbaa87cdbd951668c39a595aa78806a9010086a1d28d611ad32a9`.
Authenticated student GitHub workflows remain untested on the released builds.

## Zero 0.5.72 — 2026-11-11

[PR #329](https://github.com/codepetca/zero/pull/329) merged both fixes at
`7abbc446847d94c5b138d7d6f19d1eac4740a7bb` after all 11 checks passed.
The [kit release](https://github.com/codepetca/zero/releases/tag/v0.5.72)
contains the three anonymously verified assets from
[run 43071603930](https://github.com/codepetca/zero/actions/runs/43071603930)
at `d6ba1b8fecec5887805b24c2ad7aa5953184fbfb`. Core remains 0.3.0.

The [Mac installer](https://github.com/codepetca/zero/releases/tag/setup-v0.5.72)
is built from `873c05a7a1f9574c2c4bcf27593c9f14ea60b313` and sealed at
`3c5559a2d21ea3498247d418cf560c12c134b6be`. Apple accepted notarization
`64978c27-3d75-44f8-9805-97c2dd6f9cd4`. The public DMG matches the sealed
copy. Independent Terra/medium review verified the 13 checksums, the
signed build 72 appcast and the packaged extension source for both fixes.
The later source correction updated only the website's published-kit test.

Live WorkOS sign-in and the JavaFX launch from **Run Java** passed on Mac.
The owner waived live Windows sign-in. The automated Windows installer
checks passed. Verify the website download and appcast after promotion.

## Zero 0.5.71 — 2026-11-11

[PR #323](https://github.com/codepetca/zero/pull/323) merged the desktop
one-trip sign-in, progress indicators and browser return pages at
`e1e45391752920e7ee898a3df1af62d6941b8176`. All 11 PR checks passed.
[Preparation run 43049037546](https://github.com/codepetca/zero/actions/runs/43049037546)
produced the three public [kit assets](https://github.com/codepetca/zero/releases/tag/v0.5.71).
All three anonymous downloads match the reviewed bytes.

The [Mac release](https://github.com/codepetca/zero/releases/tag/setup-v0.5.71)
contains the single Developer ID signed DMG from the merge commit. Apple
accepted submission `de9e9690-b765-4d2f-b45f-d353d7a79374`. Staple,
Gatekeeper and bundled payload checks passed. The sealed candidate targets
`70be6e6f767482b6f2230254ca4fce4bbb33769c`. Its 13 checksums and signed
build 71 appcast passed independent Terra/medium review. Both the authenticated
draft and anonymous public download match the sealed DMG. The packaged VSIX
installed into an isolated Mac editor profile. Verify the deployed download
and appcast after this promotion merges. Installed app sign-in and fresh
physical Mac installation remain separate checks.

## Zero 0.5.69 — 2026-11-10

[PR #320](https://github.com/codepetca/zero/pull/320) merged release source
`9deca492aceedb95a0027e33f60966beb97988a2`. The core remains 0.3.0. The
[kit release](https://github.com/codepetca/zero/releases/tag/v0.5.69) contains the
three verified assets from [run 42926162175](https://github.com/codepetca/zero/actions/runs/42926162175).
The exact release VSIX installed into an isolated Mac VS Code profile. The same
source tree passed [WebFX browser checks](https://github.com/codepetca/zero/actions/runs/42922047896).

The [Mac release](https://github.com/codepetca/zero/releases/tag/setup-v0.5.69)
contains the single Developer ID signed, Apple-notarized and stapled DMG. The
sealed candidate targets preparation commit `6dc6592bf4193a8780dfa80c4867b220ef6538cb`.
Gatekeeper and payload checks passed; the draft and anonymous public download
match the sealed candidate. Independent review verified the seal, provenance
and signed update feed. This change promotes that exact DMG and feed; confirm
the website download and feed after deployment.

[Windows run 42926162250](https://github.com/codepetca/zero/actions/runs/42926162250)
built the source-bound x64 Store MSIX `1.5.69.0`. A separately test-signed copy
passed installation and first run. The Windows development installer separately
passed editor reopening and an offline JavaFX rebuild. Store certification,
physical-machine acceptance and live updater delivery are separate checks.

## Zero 0.5.67 — 2026-11-09

The release source is `00b6e3d2d2ef964887774c27d350eb4177eaef50`.
[PR #300](https://github.com/codepetca/zero/pull/300) merged that exact tree,
including the simplified Git workflow and updated tutorials. The new-project
guidance from [PR #295](https://github.com/codepetca/zero/pull/295) is included.

The [Mac DMG](https://github.com/codepetca/zero/releases/tag/setup-v0.5.67)
was signed with the existing Developer ID, notarized, stapled and accepted
by Gatekeeper. Its anonymous download matched the sealed candidate byte for
byte. This change promotes the verified DMG and signed appcast. The exact VSIX
installed in a disposable Mac editor profile. Fresh-machine and physical
Store installation remain separate checks.

The [Windows release-source run](https://github.com/codepetca/zero/actions/runs/42756254744)
built the exact unsigned Store x64 MSIX (version `1.5.67.0`) and passed the
test-signed first-run check. Microsoft Store certification and public
availability are tracked separately from that test.

## Setup Help simplification

A concise version-free guide and platform-specific instructions passed 36 focused tests, website build and a Mac/Windows browser check. Independent Terra/medium review identified broken links and missing Git identity help; both were corrected and the targeted review was clean. Deployment is verified separately after merge.

## Mac 0.5.60 verification

The signed candidate from `c431f824` was Apple-notarized and stapled. Its
anonymously downloaded DMG matches the sealed candidate. The exact bundled VSIX
installed into a disposable VS Code profile and reports 0.5.60. The existing Mac
installation was preserved; launcher, upgrade delivery, fresh-Mac and physical
Intel acceptance remain untested.

## Mac 0.5.59 verification

The 0.5.59 candidate was signed, Apple-notarized and stapled. The existing Mac
launcher was replaced after backing up 0.5.55; the installed app, managed kit
and extension reported 0.5.59. The existing Coin project reached its first game
frame when launched from the candidate. Automatic update delivery and a fresh
Mac remain untested. The public DMG hash matches the sealed candidate.

## Updating this record

- When app changes merge, record their PRs and affected surfaces as pending until
  the corresponding release includes them. Website deployment can happen separately.
- When building or releasing, record version, full source commit, artifacts,
  checks and live status; link to detailed evidence instead of duplicating it.
- Distinguish built, submitted, certified and publicly available. Preserve dates,
  uncertainty and explicit publication holds. Verify GitHub, the live website or
  Partner Center as applicable; do not rely on a previous chat alone.
- Update this file in the same source change when practical, or leave an explicit
  handoff if the release state changes after the source PR is merged.
