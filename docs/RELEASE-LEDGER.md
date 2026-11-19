# Zero release ledger

Last reconciled 2026-11-18 (America/Toronto). This is a dated working record,
not proof of current live status. Before reporting or releasing, check the live
service, exact source revision and applicable release gates. Do not infer
permission to publish from this ledger.

| Surface | Last verified state | What's next |
| --- | --- | --- |
| GitHub manual kit | [Zero 0.5.80](https://github.com/codepetca/zero/releases/tag/v0.5.80) is public. All three anonymous downloads match preparation44339762972. | Audited fixes and current project builder. |
| Website | [PR383](https://github.com/codepetca/zero/pull/383) promotes the verified0.5.80 Mac, signed feed and both Portable downloads. | The Windows button opens the Microsoft Store. |
| Mac installer | [0.5.80](https://github.com/codepetca/zero/releases/tag/setup-v0.5.80) is public. Its DMG and Git source archives match the sealed candidate. | Isolated-home setup installed the exact extension. Interactive Sparkle upgrade remains unverified. |
| Windows Store | [Zero Studio](https://apps.microsoft.com/detail/9mxkd6dqlfgx) submission 13, package 1.5.77.0 x64, was live when preparing submission 14 for package 1.5.78.0. | Store availability follows successful upload and Microsoft certification. |
| Windows Portable | [0.5.80 complete VSCodium ZIP](https://github.com/codepetca/zero/releases/tag/windows-portable-bundled-v0.5.80) and [small staging ZIP](https://github.com/codepetca/zero/releases/tag/windows-portable-pilot-v0.5.80) are public and embed the same published kit. | Complete: extract and open Zero.exe. Small: teacher/IT stages vendor tools. Verify actual school policy under a student login. |
| Windows standalone download | [0.5.77 unsigned preview](https://github.com/codepetca/zero/releases/tag/windows-preview-v0.5.77) and its [matching manual kit](https://github.com/codepetca/zero/releases/tag/windows-manual-v0.5.77) are public. | Hosted setup and JavaFX passed. Physical and school-managed Windows devices remain untested. |

The 0.5.58 Store candidate includes Project Explorer and online Tutorial Docs
updates, recent tutorial changes, and Store Java/VS Code startup fixes. Its exact
package passed a Windows first-run test; WACK reported a DPI warning and an optional
blocked-executables finding, disclosed with the submission. See the
[Windows validation run](https://github.com/codepetca/zero/actions/runs/41134687731).
The candidate source is on a release branch; do not assume its Store fixes are
merged into main. The Store submission does not publish a Mac or standalone Windows
installer.

## Zero 0.5.81 local preparation — 2026-11-18

Owner authorized preparation only. No source push, merge, tag, public release,
website promotion or Store submission occurred. Source branch is
`codex/prepare-zero-081`, based on main `d098d0d2f`. Publishing recovery is
`66ca2c587`; release metadata is `8691ae6bc`; a native-run test fixture correction
is `51808415f`. Core remains 0.3.0. Report a problem is not implemented; that
discussion was handed to the always-on improvements chat.

An explicit browser build/publish can offer **Update Browser Tools**, preserve
old tools, update only `.zero-build` and continue. Java/assets/framework stay
unchanged. Cancelling ends quietly; incomplete full-project recovery still
blocks browser actions. Missing Git revisions receive clearer guidance, without
claiming that all previously reported merge errors have been reproduced/fixed.

Public starter commit `32c4d56a706d8d677db0eecfea5b202ca1bee8ca`, tree
`369608a5d9847148dc801b3b1e2499adcb00a767`, matches the candidate source and modes.
The actual 0.5.81 VSIX passed compatibility, unedited native UI, Sam/Ada native
Greeting and Chrome157 WebFX Greeting checks. It installed in an isolated Mac
VS Code profile. The template did not need an update.

The Mac candidate was built cleanly at `51808415fc3207afd639fa8784c3910e43539335`
and sealed at `60a822be2251a9b086518ba05e230fae9fb9b0fe` after protected-source
equivalence. Apple accepted submission `47226a05-b83b-4792-8c27-d738b5e6c325`.
Staple, actual app/DMG Gatekeeper and Developer ID signature/payload checks passed.
The sealed build80 update feed advances public build79 without changing keys.
Both Portable candidates were built cleanly at `8691ae6bc` and embed the exact
same kit ZIP; the complete archive passed launcher, runtime, editor and Java
extension integrity checks. Its build source precedes only the test fixture and
measured Mac manifest changes.

The ignored, independently checksummed local set is
`dist/candidates/release-0.5.81-60a822be2251/` (25 files), including the canonical
Mac seal and corresponding Git source archives, both Portable candidates,
Project → New receipt and explicit preparation limits. It is not a source-bound
GitHub Actions release run. Preserve these bytes and all published 0.5.80 bytes.
Generated Portable promotion metadata contains intended future URLs, not live
publication evidence.

| Local artifact | Bytes | SHA256 |
| --- | ---: | --- |
| zero-bootstrap.zip | 5,110,868 | `d05df0ee867a057c602fb0084ded92585a83baf7cdc64972b8a931f0b2dd0d4a` |
| zero-starter.zip | 2,778,887 | `a08e667601bf4f6dbcbe1bf2597137503fc641281f373cb82ee81ad778496f60` |
| zero-0.5.81.vsix | 2,307,016 | `d58657241c4492d2d83d485b09eb18920c6f823c03ef698fa310c2226a9e4a4a` |
| Zero-0.5.81-macos.dmg | 12,355,550 | `757ef6a398d62904925d77e65b3974427ddb508c1c4dc6c78d5c81fd510ef0c8` |
| Zero-0.5.81-windows-portable-pilot-staging-x64.zip | 5,419,388 | `aeed8634d3aad2ca47bb37caa7893bb4dcd30a43a78ee1a922365b2a2312e505` |
| Zero-0.5.81-windows-portable-bundled-x64.zip | 605,973,247 | `98f59f4c1c82f388c9f249e4207a3f27b097d138d4a890a411c221b4f8a1e9de` |

Hosted source/release CI and complete-ZIP Windows cold/warm acceptance remain
required before full publication. Windows Store MSIX 0.5.81 is not built or
submitted; retain the separate 0.5.80 submission. Physical school computers,
authenticated Pages upload and live updater delivery remain unverified.
See [evidence](EVIDENCE.md) for checks and review.

## Zero 0.5.80 — 2026-11-18

Owner authorized the full 0.5.80 website release. It includes the reviewed audit
fixes ([PR380](https://github.com/codepetca/zero/pull/380)) and progressive ZeroHub
loading ([PR381](https://github.com/codepetca/zero/pull/381)). Kit and both Portable
packages were prepared at source `7ec896f719e2f4a4c550588d7091f34748556d32` by
[manual run44339762972](https://github.com/codepetca/zero/actions/runs/44339762972).
Kit metadata is promoted by [PR382](https://github.com/codepetca/zero/pull/382).
The full download/feed records and final verification belong to [PR383](https://github.com/codepetca/zero/pull/383).

[Starter PR6](https://github.com/codepetca/zero-starter/pull/6) updates only the
14 generated builder files. Independent Terra/high review verified all97 file
bytes and executable modes. Public starter commit `32c4d56a706d8d677db0eecfea5b202ca1bee8ca`,
tree `369608a5d9847148dc801b3b1e2499adcb00a767`, passed Project → New with this
VSIX: native starter UI, Hello Sam/Ada and actual Chrome157 WebFX output.

The universal Mac candidate was built from the same source and sealed at
`4b79a16a5fc6fe0269ec0b90ce062afeffdb8371` after protected-source equivalence.
Apple accepted notarization `6b6ada03-8433-41c2-b516-f92c549f561a`. Developer ID
signatures, staple and Gatekeeper app/DMG assessments passed. Existing update
build79 advances published build78; no key or credential changed. Sol/high
independently verified all15 sealed hashes,42 protected paths and Ed25519 archive
and feed signatures. An isolated temporary home completed native installation
and readiness with extension0.5.80; no owner app/editor was launched.

| Artifact | Bytes | SHA256 |
| --- | ---: | --- |
| zero-bootstrap.zip | 5,110,365 | `615700e2753bcd56d0bf07b2e9b193634ee2a1a62f712e74289a0b41bd4df43f` |
| zero-starter.zip | 2,778,887 | `b9df3af39aaddde08f950a6cc8b147f532d3c667786590ede28da788a77577f3` |
| zero-0.5.80.vsix | 2,306,597 | `eec09dee6ebccbc2beb6ad5b2658a4123e39675975b56a7e0d10cbcf26210bba` |
| Zero-0.5.80-macos.dmg | 12,353,838 | `a66680ecf6d9b4c502ca764cd62ad3b4911fb2d2d32564a28aa60f87a6992487` |
| Zero-0.5.80-windows-portable-pilot-staging-x64.zip | 5,419,000 | `af4600f1a1d0e45dde4c611340d1193b80126ec1674676eac93035bb74eb19da` |
| Zero-0.5.80-windows-portable-bundled-x64.zip | 605,972,821 | `6b9f50b7d79eadc66730ac3e2c508a8e43e5805d1623c8a8b11f74b9144aa227` |
| Zero-0.5.80-windows-portable-sources.tar | 1,470,730,240 | `b2ac332967bc8044b18ad5f11a913a862dd2d5939bc7b4e094309c12d8fb9fe0` |

Windows and the manual kit use the same exact kit archive. The native Mac
installer embeds its separately built source-equivalent0.5.80 kit; its measured
archive stays in the sealed native receipt. Native asset bytes remain independent
from the Linux kit/Portable run. No old public asset is replaced.

The kit, native and small Portable public downloads match their measured bytes. Complete Portable draft downloads are checked against all five sealed files. Final acceptance on the promotion PR additionally requires all five anonymous downloads, the exact-ZIP Windows cold/warm trial and live download/feed read-back.

The complete ZIP retains bundled third-party notices and a verified0.5.80
source-companion link. All upstream tool pins are unchanged from0.5.79. Independent
Terra/high review verified the reused TAR and all68 source mappings. The adjacent
index explains the original0.5.78 index inside the byte-identical source TAR.

Local full-promotion checks:868 website tests passed,3 skipped, with typecheck,
production build and11 focused published-download tests passing. Exact-head
review, selected CI and the hosted Windows cold/warm trial are recorded on the
full-promotion PR. Final live checks require both Portable links, the Mac link
and the exact signed appcast to match these records. Skipped and physical-device,
school-policy, authenticated-student and interactive Sparkle acceptance remain
explicit limits. Microsoft Store and standalone Windows deliveries keep their
independent publication schedules. Unrelated owner files/staging are preserved.

## Zero 0.5.79 — 2026-11-17

The extension shortens **Publish & open app** confirmation to the visibility
warning and any applicable replacement warning. The exact kit and both
Portable ZIPs were prepared at clean source
`c90bbfc1405b9a5658d6eae3d34f0a1af2cc9811` by
[run 44190436421](https://github.com/codepetca/zero/actions/runs/44190436421).
The public starter, native/browser Greeting, kit and website checks passed.
[PR #379](https://github.com/codepetca/zero/pull/379) promotes the kit and both
Portable manifests. Independent GPT-6.1 Terra metadata review at medium
reasoning covered its exact head `093115dc5b98fb45ea93fc7ce2a644c4baa067d1`.

| Artifact | Bytes | SHA256 |
| --- | ---: | --- |
| zero-bootstrap.zip | 5,070,974 | `1edefe2c174964946594d30ec1ccde3181b1d76fee82e7ef20d32a1162419ca2` |
| zero-starter.zip | 2,773,959 | `f8c79d00a025753eb1150a512c48ef64c90257cb91c744c78a2f189c23c710be` |
| zero-0.5.79.vsix | 2,272,184 | `e247d39e12c97b231e2a3f94078525ea669f5e5bb319d0adea3669a1630e072d` |
| Small staging ZIP | 5,379,330 | `0c814d2639705a305c409f115f31202044348b68aefe10ca2021451cb2d11305` |
| Complete VSCodium ZIP | 605,933,612 | `4b0ff4859dca61b874ebc742a8fc61ebf8d310c03b147bea6b875d29329f3c5a` |
| Separate source TAR | 1,470,730,240 | `b2ac332967bc8044b18ad5f11a913a862dd2d5939bc7b4e094309c12d8fb9fe0` |

Draft and anonymous public downloads matched these measurements. Both Portable
launchers embed the exact kit. Their clean launcher and kit source are the
same preparation commit. Vendor pins are unchanged from 0.5.78, so its verified
source TAR is reused byte-for-byte with an adjacent 0.5.79 index and explanation.
The complete ZIP's notice points to the 0.5.79 companion release.
The exact public complete ZIP passed the
[cold/warm Windows trial](https://github.com/codepetca/zero/actions/runs/44199398168),
including unchanged tools and extension manifests on reopening. That run's
installer lane correctly rejected rebuilding the immutable kit; PR #379 fixes
it to fetch and verify the published assets and reruns the selected gates.
Mac setup, Store delivery and physical school-device acceptance remain separate.

## Zero 0.5.78 — 2026-11-17

Merge reports the local Git command, exit status and recognized error in the
notification and Zero Output. [PR #374](https://github.com/codepetca/zero/pull/374)
merged at `b59aacf4301cfccf585f850afd596d9b8da81a2f` after all 11 checks passed.
The packaged extension reproduced the Tutorial 5 unreadable-tree diagnostic.
Restoring the object allowed the merge to succeed.

[Preparation run 44146602000](https://github.com/codepetca/zero/actions/runs/44146602000)
verified the exact public starter, native and browser Greeting, kit and
Portable candidate. The three kit assets and the Portable staging ZIP matched
their sealed sizes and hashes when downloaded anonymously. The Portable launcher
embeds the exact published kit. [PR #375](https://github.com/codepetca/zero/pull/375)
promotes the kit and Portable metadata.

The Mac build source `62c0edc45257fedaeb49bdee2f58f93249cfb232` has the merged
source tree. The preparation commit is `c6d61d5fc766`. Apple accepted
submission `46164bbc-050b-4095-8f10-6fae065c2350`. Developer ID, stapling,
Gatekeeper and isolated-home setup passed. Independent GPT-6.1 Terra review
at medium reasoning verified the sealed hashes, source binding and update
signatures. The public DMG SHA-256 is
`fbfd6efb0da2275a0d0a04382846d34c57f7a1496ad0a7b415382499339ee960`.
The signed appcast SHA-256 is
`29b43c0c3c04e057509e205af29e9df1081ebf786724c8d0858401ebb517d79b`.

[Hosted Windows run 44144004101](https://github.com/codepetca/zero/actions/runs/44144004101)
passed installer, JavaFX and Store first-run checks. Store MSIX 1.5.78.0 x64
has SHA-256
`3e2eccddf39e798a5e672378926470d96033bd0d744a1a6cbfb7cbb755bc401c`.
[WACK run 44147086127](https://github.com/codepetca/zero/actions/runs/44147086127)
reported a required DPI-awareness warning and optional blocked-executables
failure, matching 0.5.77. Microsoft certification and on-device Store delivery
are separate from these hosted checks.

The [complete Portable ZIP](https://github.com/codepetca/zero/releases/tag/windows-portable-bundled-v0.5.78)
was added as a second distribution of the exact public 0.5.78 kit. Students
extract it and open **Zero.exe**. VSCodium 1.143.17232 and the pinned Java,
Git, Node.js and Java extension are included. The 605,933,593-byte ZIP has SHA-256
`887ef13762f82b1da83e3455a35b64e8a22bd63b5a18f4649add24382c6510f9`.
Its clean launcher source is `cc823f4fecb8a4d9471523bfb9f7d732d02d9659`;
the embedded kit remains from `b59aacf4301cfccf585f850afd596d9b8da81a2f`.
The release also supplies the measured source index and a separate
1,470,730,240-byte source companion. The small staging ZIP stays independently
available. Website integration is tracked in
[PR #378](https://github.com/codepetca/zero/pull/378), with the exact public
bundle and cold/warm Windows handoff checked before merging.
A student trial under the school's actual application policy remains separate.

## Zero 0.5.77 — 2026-11-17

Zero opens modified files for editing. **Compare with Last Commit** moved to
the file's context menu, and **Show All Project Files** appears in the Files
three-dot menu. The macOS editor walkthrough passed. [PR #368](https://github.com/codepetca/zero/pull/368)
merged at `273fa5e0ddc4cc02a7faa390415f7f7972822e2d` after all 11 checks passed.
The [kit preparation run](https://github.com/codepetca/zero/actions/runs/44090942917)
verified the public starter against the packaged VSIX and replayed Greeting
in JavaFX and Chrome. The three public kit assets matched the CI checksums.
[PR #369](https://github.com/codepetca/zero/pull/369) later changed packaged
tutorials on main. The release metadata records 0.5.77 as the public fallback
and advances the newer source to local kit 0.5.78.

The Mac installer was built from the #368 merge and sealed at
`6488b8c785f8677d2ddf8c1e0922f38860c73489`. Apple accepted notarization
`f1a156eb-fb1f-487d-b4ec-a34053903536`. Developer ID, staple, Gatekeeper and
isolated-home setup checks passed. The public DMG SHA-256 is
`29a1a453db139e04a19a711c773471f4c34ba7830241494bddc94a0a09539156`.
The sealed appcast SHA-256 is
`e951e988cb3f3755cd3f4ed03e02eec3dd6d8dc817e2b01b448084ff2723bada`.

[Windows run 44088714289](https://github.com/codepetca/zero/actions/runs/44088714289)
passed standalone setup, editor reopening, JavaFX with a cached offline
rebuild, and Store first run with a test-signed copy. Its synthetic commit
`69fe79578b79702c1494d8749b33eef34bc7adca` has the source merge's tree. The
anonymous EXE and matching ZIP matched the measured assets. The Store MSIX
SHA-256 is `aaf7dfc9fa5bf5e4e8b7c8c4333d3ddce926fbd02aa3608b36994d59965086cb`.
[WACK run 44091134102](https://github.com/codepetca/zero/actions/runs/44091134102)
reported a DPI-awareness analysis warning and an optional blocked-executables
failure, matching 0.5.76. Submission 13 has the validated x64 package and
discloses both findings in its certification notes.

[Windows Portable 0.5.77](https://github.com/codepetca/zero/releases/tag/windows-portable-pilot-v0.5.77)
was built from the same source and exact sealed kit as the public 0.5.77 kit
release. The public staging ZIP is 5,376,857 bytes with SHA-256
`c3d45844ac836fe9d6af8c3bdb63b90e64bf4d5b5d3b4923c61d8fba97b98309`.
The draft and anonymous downloads of both assets matched the local candidate.
PowerShell on macOS staged all five pinned vendor tools. Windows runtime
fixtures passed under Mono. The actual student workflow on a school-managed
Windows desktop remains untested.
The Downloads page uses the verified public manifest. Future full promotions
require the matching Portable ZIP and verify its embedded kit.

## Zero 0.5.76 — 2026-11-16

Zero fills missing Git commit name and email settings after GitHub sign-in in
trusted Zero projects. Existing Git values are preserved. The source merged at
`26d229e35a086faeb1e481cb1ec1f39c9990a810` after all 11 checks passed in
[PR #363](https://github.com/codepetca/zero/pull/363).
[Starter PR #5](https://github.com/codepetca/zero-starter/pull/5) updated the
generated README. [Preparation run 43930769431](https://github.com/codepetca/zero/actions/runs/43930769431)
verified the public starter against the packaged VSIX and replayed Greeting in
JavaFX and Chrome. The [kit release](https://github.com/codepetca/zero/releases/tag/v0.5.76)
and the README download link were verified after [PR #364](https://github.com/codepetca/zero/pull/364)
merged.

The [Mac installer](https://github.com/codepetca/zero/releases/tag/setup-v0.5.76)
was built from source `771fc980f86920e17a01c53e6a0724860d180f93`, whose tree
matches the source merge, and sealed at `9c8dfbea1f172febb0851ecc4343c00c2a403065`.
Apple accepted notarization `8634f916-ee0e-45f9-8271-0345155886db`.
The public DMG SHA-256 is `08bc956b2e95e7bbbded099807a8338af704a1d6e8fed41caddf0e1d5b8eb399`.
The Developer ID, staple, Gatekeeper, isolated-home setup and all three public
assets passed verification. [PR #365](https://github.com/codepetca/zero/pull/365)
merged the reviewed metadata and signed feed. The live homepage download and
signed appcast passed verification. The live appcast SHA-256 is
`828271bd5c16668b991b74243a1e2dba68e8e0a57fcd641eabbd33e75c77897c`.

[Windows run 43927965131](https://github.com/codepetca/zero/actions/runs/43927965131)
passed standalone setup, private Git, editor reopening, JavaFX with a cached
offline rebuild, and Store first run with a test-signed copy. Its synthetic
commit `fb5216be670b507185cad241448a2e62ec29bac8` has the reviewed source tree.
The anonymous preview and matching manual ZIP matched the measured installer
and its embedded kit. [PR #366](https://github.com/codepetca/zero/pull/366)
merged the reviewed preview metadata.

[WACK run 43930502773](https://github.com/codepetca/zero/actions/runs/43930502773)
reported a required DPI analysis warning and an optional blocked-executables
failure, matching 0.5.75. The Store MSIX version `1.5.76.0` x64 has SHA-256
`20c1c0896f0cc2b75031ca5e09ccf2beea9314b4ce1f480f69487ee23ff53dda`.
Draft submission 12 retains the certification notes, publish-after-certification
selection, and as-soon-as-possible release schedule. Submission awaits successful
package validation after retrying the browser and native upload paths.

## Zero 0.5.75 — 2026-11-15

[PR #358](https://github.com/codepetca/zero/pull/358) refined the editor Start
Page and merged at `9e3f70abd23c09d2b63d669f640632ec1b7abc01` after all 11
checks passed. [Preparation run 43759994081](https://github.com/codepetca/zero/actions/runs/43759994081),
attempt 2, verified the public starter tree and replayed Greeting in JavaFX and
Chrome with the packaged extension. The first attempt hit an HTTP 403 during
the starter lookup. The [kit release](https://github.com/codepetca/zero/releases/tag/v0.5.75)
uses the checked source, and the three anonymous asset hashes matched.
[PR #359](https://github.com/codepetca/zero/pull/359) merged the kit metadata and README download link.

The [Mac installer](https://github.com/codepetca/zero/releases/tag/setup-v0.5.75)
uses the same source and preparation commit `219bc1e32bda70a5153709150724bbc5ffda99ef`.
Apple accepted submission `cef8a20d-0f01-4cae-83f5-64924c7156e9`. The downloaded
DMG SHA-256 is `fdcd3b3b3c4fc7e8bc2c7ae31921624ca6551f9cd45c6f658851bb23b38038b9`.
Developer ID, the Apple staple, Gatekeeper and a fresh isolated-home setup
passed. Independent GPT-6.1 Terra review at medium reasoning verified the
sealed checksums and signed appcast. The bundled kit and the public kit contain
identical files and permissions, with different ZIP serialization.
[PR #361](https://github.com/codepetca/zero/pull/361) promoted the Mac installer
and appcast. The live homepage download and exact signed feed bytes passed
verification.

[Windows run 43739536593](https://github.com/codepetca/zero/actions/runs/43739536593)
passed standalone setup, private JavaFX and Store first run with a test-signed
copy. Its synthetic PR commit `94e1a4dff942045ddb22c8e5e3874bff5126eac0`
has the reviewed source tree. The anonymous standalone installer and manual
ZIP matched the measured preview assets. [PR #360](https://github.com/codepetca/zero/pull/360) merged the preview metadata. [WACK run 43760227788](https://github.com/codepetca/zero/actions/runs/43760227788)
reported a required DPI analysis warning and an optional blocked-executables
failure, matching the 0.5.74 findings. The exact 1.5.75.0 x64 Store MSIX has
SHA-256 `becf510c053bceb5f9555c3b799f6d93eb844df4ea080da1fdd786913ce91cf7`.
Partner Center validated the uploaded package and accepted submission 11 for
certification. The submission notes disclose the WACK findings. Publishing is
set to begin automatically after certification, with the release schedule set
to as soon as possible. A Store-delivered 0.5.75 upgrade remains unverified.

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
