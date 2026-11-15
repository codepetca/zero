# Zero release ledger

Last reconciled: 2026-11-15 (America/Toronto). This is a dated working record,
not proof of current live status. Before reporting or releasing, check the live
service, exact source revision and applicable release gates. Do not infer
permission to publish from this ledger.

| Surface | Last verified state | What's next |
| --- | --- | --- |
| GitHub manual kit | [Zero 0.5.75](https://github.com/codepetca/zero/releases/tag/v0.5.75) is public. All three anonymous downloads match the release preparation receipts. | Native distributions have their own publication records. |
| Website | The 0.5.75 Mac installer and signed appcast are promoted in source. | Verify the deployed homepage link and appcast bytes. |
| Mac installer | [0.5.75](https://github.com/codepetca/zero/releases/tag/setup-v0.5.75) is public. Its DMG and Git source archives match the sealed candidate. | Isolated-home setup passed. The interactive Sparkle upgrade for 0.5.75 remains untested. |
| Windows Store | [Zero Studio](https://apps.microsoft.com/detail/9mxkd6dqlfgx) submission 10, package 1.5.74.0 x64, passed certification and began publishing on November 15. | Verify the Store-delivered upgrade on a Windows x64 PC. |
| Windows portable school pilot | [0.5.74 unsigned x64 staging ZIP](https://github.com/codepetca/zero/releases/tag/windows-portable-pilot-v0.5.74) is public. | Stage the vendor tools and test on one school desktop under a student login. |
| Windows standalone download | [0.5.75 unsigned preview](https://github.com/codepetca/zero/releases/tag/windows-preview-v0.5.75) and its [matching manual kit](https://github.com/codepetca/zero/releases/tag/windows-manual-v0.5.75) are public. | Hosted setup and JavaFX passed. Physical and school-managed Windows devices remain untested. |

The 0.5.58 Store candidate includes Project Explorer and online Tutorial Docs
updates, recent tutorial changes, and Store Java/VS Code startup fixes. Its exact
package passed a Windows first-run test; WACK reported a DPI warning and an optional
blocked-executables finding, disclosed with the submission. See the
[Windows validation run](https://github.com/codepetca/zero/actions/runs/41134687731).
The candidate source is on a release branch; do not assume its Store fixes are
merged into main. The Store submission does not publish a Mac or standalone Windows
installer.

## Zero 0.5.75 — 2026-11-15

[PR #358](https://github.com/codepetca/zero/pull/358) refined the editor Start
Page and merged at `9e3f70abd23c09d2b63d669f640632ec1b7abc01` after all 11
checks passed. [Preparation run 43759994081](https://github.com/codepetca/zero/actions/runs/43759994081),
attempt 2, verified the public starter tree and replayed Greeting in JavaFX and
Chrome with the packaged extension. The first attempt hit an HTTP 403 during
the starter lookup. The [kit release](https://github.com/codepetca/zero/releases/tag/v0.5.75)
uses the checked source, and the three anonymous asset hashes matched.
[PR #359](https://github.com/codepetca/zero/pull/359) records the kit metadata.

The [Mac installer](https://github.com/codepetca/zero/releases/tag/setup-v0.5.75)
uses the same source and preparation commit `219bc1e32bda70a5153709150724bbc5ffda99ef`.
Apple accepted submission `cef8a20d-0f01-4cae-83f5-64924c7156e9`. The downloaded
DMG SHA-256 is `fdcd3b3b3c4fc7e8bc2c7ae31921624ca6551f9cd45c6f658851bb23b38038b9`.
Developer ID, the Apple staple, Gatekeeper and a fresh isolated-home setup
passed. Independent GPT-6.1 Terra review at medium reasoning verified the
sealed checksums and signed appcast. The bundled kit and the public kit contain
identical files and permissions, with different ZIP serialization.

[Windows run 43739536593](https://github.com/codepetca/zero/actions/runs/43739536593)
passed standalone setup, private JavaFX and Store first run with a test-signed
copy. Its synthetic PR commit `94e1a4dff942045ddb22c8e5e3874bff5126eac0`
has the reviewed source tree. The anonymous standalone installer and manual
ZIP matched the measured preview assets. [WACK run 43760227788](https://github.com/codepetca/zero/actions/runs/43760227788)
reported a required DPI analysis warning and an optional blocked-executables
failure, matching the 0.5.74 findings. The exact 1.5.75.0 x64 Store MSIX has
SHA-256 `becf510c053bceb5f9555c3b799f6d93eb844df4ea080da1fdd786913ce91cf7`.
Store submission and certification for 0.5.75 are pending.

## Zero 0.5.74 GitHub kit — 2026-11-14

The [release](https://github.com/codepetca/zero/releases/tag/v0.5.74) is tagged
at `bd68da42e7c3737a46d1ff4e8510bab86e32fcd7`, the independently reviewed
source of [PR #352](https://github.com/codepetca/zero/pull/352). The tag's tree
matches the source merge `f885144e386f63b0c9648fe714988dd57064c77f`.
[Preparation run 43651559253](https://github.com/codepetca/zero/actions/runs/43651559253)
checked the public starter against the packaged VSIX and replayed the Greeting
tutorial with native JavaFX Run and WebFX in Chrome. All three anonymous
downloads match the sealed candidate. Core remains 0.3.0. The README link and
kit manifest are tracked in [PR #353](https://github.com/codepetca/zero/pull/353).

The public starter tree was `13861f37d5afb4cec9c325b770dea35f6c06e801`.
Project → New now checks starter compatibility before repository creation and
offers update guidance if the editor and starter do not match.
[Live scratch Pages run 43651392133](https://github.com/armorup/zero-pages-publish-check-20261114/actions/runs/43651392133)
used the GitHub App and published the expected source in one dispatch, despite
a simulated failure on the first run lookup. The public page greeted Sam and
Ada. This was a Mac source test with ZeroHub listing omitted. The separate
Mac and Windows installers were prepared and tested separately.

The [Mac installer release](https://github.com/codepetca/zero/releases/tag/setup-v0.5.74)
uses source `bd68da42e7c3737a46d1ff4e8510bab86e32fcd7` and
preparation commit `6a8bd3866eed562bfe16bd737340428f286e142a`. Apple accepted
submission `b676c666-1bf1-412c-a6c2-cd407645bc2e`. The final notarized DMG
SHA-256 is `4b73e991d65eeaeb84ce6d26804945a296efb47232e7c25123c02ddb05b69a8e`.
Clean-home setup and editor launch passed. A copied 0.5.73 app fetched the
production-signed appcast through a process-local staging URL, installed the
public 0.5.74 DMG through Sparkle, and preserved a test project. The updated
editor passed setup and opened from the same test home. The production site
and feed are promoted separately in [PR #355](https://github.com/codepetca/zero/pull/355).

[Windows CI run 43651552124](https://github.com/codepetca/zero/actions/runs/43651552124)
built the standalone and Store packages from `68ccb79503cfcd0d61eb2ad253f08cc4353f4a30`,
whose tree matches the 0.5.74 tag. The unsigned standalone passed hosted
setup, Git and JavaFX checks, and its public downloads match those bytes.
The Store MSIX SHA-256 is
`508460506e8d9db5b4cbe847c7b7ec7f38c2377bf76a67d8930029d13042e03e`.
[Certification kit run 43672375962](https://github.com/codepetca/zero/actions/runs/43672375962)
passed first launch on a test-signed copy. The required DPI test reported an
analysis warning and the optional blocked-executables test failed. Store
certification passed, and Partner Center confirmed that submission 10 entered
publishing after **Publish now** on November 15. The Store-delivered upgrade on
a Windows x64 PC remains unverified.

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
The [GitHub prerelease](https://github.com/codepetca/zero/releases/tag/windows-portable-pilot-v0.5.74)
publishes the separate staging ZIP. It uses the same launcher and downloads
five checksum-pinned tools from their vendors. The staging ZIP is 5,368,402
bytes with SHA-256
`f74e2f31b56d36ea335031e7a19dff601de8065f91ed29cc508c5fa61ea096dc`.
The public ZIP and checksum matched the reviewed bytes in anonymous downloads.
The website `/downloads` source links that release asset. The original ZIP
remains in local pilot storage.
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
