# Zero release ledger

Last reconciled: 2026-11-11 (America/Toronto). This is a dated working record,
not proof of current live status. Before reporting or releasing, check the live
service, exact source revision and applicable release gates. Do not infer
permission to publish from this ledger.

| Surface | Last verified state | What's next |
| --- | --- | --- |
| Website | The Mac 0.5.71 download and exact signed build 71 appcast are live and verified. | Verify the installed update on a Mac. |
| Mac installer | [0.5.71](https://github.com/codepetca/zero/releases/tag/setup-v0.5.71) is public and matches the sealed, notarized DMG. | A fresh install and sign-in in the installed app remain separate checks. |
| Windows Store | [Zero Studio](https://apps.microsoft.com/detail/9mxkd6dqlfgx) 0.5.69 was live at submission. Partner Center accepted 0.5.71 as Submission 7 for certification. | Verify 0.5.71 after certification and test the Store-delivered update on Windows. |
| Windows standalone download | The [0.5.71 unsigned preview](https://github.com/codepetca/zero/releases/tag/windows-preview-v0.5.71) and [matching manual kit](https://github.com/codepetca/zero/releases/tag/windows-manual-v0.5.71) are public and verified. | Physical Windows and school-device acceptance remain outstanding. Preview updates are disabled. |

The 0.5.58 Store candidate includes Project Explorer and online Tutorial Docs
updates, recent tutorial changes, and Store Java/VS Code startup fixes. Its exact
package passed a Windows first-run test; WACK reported a DPI warning and an optional
blocked-executables finding, disclosed with the submission. See the
[Windows validation run](https://github.com/codepetca/zero/actions/runs/41134687731).
The candidate source is on a release branch; do not assume its Store fixes are
merged into main. The Store submission does not publish a Mac or standalone Windows
installer.

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
installed into an isolated Mac editor profile. After
[PR #326](https://github.com/codepetca/zero/pull/326) merged, the production
download links and exact signed appcast passed verification. Installed app
sign-in and a fresh physical Mac installation remain separate checks.

[Windows run 43048691959](https://github.com/codepetca/zero/actions/runs/43048691959)
tested the source tree merged in PR #323. The
[unsigned x64 preview](https://github.com/codepetca/zero/releases/tag/windows-preview-v0.5.71)
and [matching manual kit](https://github.com/codepetca/zero/releases/tag/windows-manual-v0.5.71)
match the reviewed Windows artifacts byte for byte. The kit is the ZIP embedded
in that installer. Hosted setup, reopen, private JavaFX and cached offline
rebuild passed. Automatic updates are disabled for the preview.

The same Windows run built the original x64 Store MSIX `1.5.71.0` and
verified a separately test-signed copy through install and first run. Microsoft
validated the original package. The
[Partner Center overview](https://partner.microsoft.com/en-us/dashboard/products/9MXKD6DQLFGX/overview)
showed Submission 7 in certification and set to publish after certification
passes. WACK, physical Windows installation and Store update delivery remain
unverified for this build.

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
