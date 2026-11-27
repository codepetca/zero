# Zero release ledger

Last reconciled 2026-11-26 (America/Toronto). This is a dated working record,
not proof of current live status. Before reporting or releasing, check the live
service, exact source revision and applicable release gates. Do not infer
permission to publish from this ledger.

| Surface | Last verified state | What's next |
| --- | --- | --- |
| GitHub manual kit | [Zero 0.5.90](https://github.com/codepetca/zero/releases/tag/v0.5.90) is public. Its three anonymous downloads match preparation run 45923064395. | Preserve immutable assets. |
| Website | [Toast to the Moon](https://zero.codepet.ca/hub/jams/jam-zero-50cc218f35e96640eba5685118e3c2dd) and its older participation URL show Open in Zero and no student forms. [PR #435](https://github.com/codepetca/zero/pull/435) and [PR #436](https://github.com/codepetca/zero/pull/436) select the measured 0.5.90 downloads and Mac feed. | Verify the production download links and feed when reconciling releases. |
| Mac installer | [0.5.90](https://github.com/codepetca/zero/releases/tag/setup-v0.5.90) includes the signed, stapled DMG and both corresponding Git source archives. | The signed build 89 feed references the verified public DMG. |
| Windows Store | The Canadian [Zero Studio catalog](https://apps.microsoft.com/detail/9mxkd6dqlfgx) still reports 1.5.89.0 x64. The test-signed 1.5.90.0 candidate passed installation and first run. | Partner Center's product overview did not load the submission controls. |
| Windows Portable | The [0.5.90 Complete ZIP](https://github.com/codepetca/zero/releases/tag/windows-portable-bundled-v0.5.90) and [staging ZIP](https://github.com/codepetca/zero/releases/tag/windows-portable-pilot-v0.5.90) both embed the canonical kit from run 45923064395. | The school stages its preferred ZIP under its existing device policy. |
| Windows standalone download | [0.5.77 unsigned preview](https://github.com/codepetca/zero/releases/tag/windows-preview-v0.5.77) and its [matching manual kit](https://github.com/codepetca/zero/releases/tag/windows-manual-v0.5.77) are public. | Hosted setup and JavaFX passed. Physical and school-managed Windows devices remain untested. |

## Zero 0.5.90 release — 2026-11-26

[PR #433](https://github.com/codepetca/zero/pull/433) merged the editor-first
Game Jam flow. A disposable PostgreSQL trial confirmed that a student could
replace a deleted repository and submit after registration closed while
keeping the original membership. The [Windows installed-app trial](https://github.com/codepetca/zero/actions/runs/45923102772)
opened the exact jam and rules in the test-signed Store package and stopped
at the sign-in step.

The release source at [PR #434](https://github.com/codepetca/zero/pull/434)
includes the Windows Portable Java fix. Both Portable ZIPs
pin Red Hat Java 1.56.0 so editor diagnostics and completion can start on the
bundled Java 21. The [exact Complete ZIP trial](https://github.com/codepetca/zero/actions/runs/45925391165)
verified cold and warm launches from a profile seeded with Java 1.57. The
editor reached **Java: Ready** without a JDK download prompt. Canonical
[preparation run 45923064395](https://github.com/codepetca/zero/actions/runs/45923064395)
sealed the kit and both matching Portable ZIPs and verified Project → New.

The Mac installer was built from `29aa1dfb2` and sealed at `b1355381e`.
Apple accepted notarization `467a4d40-8b21-48aa-aff9-a6829e0b3ddc`. The
stapled DMG and both source companions matched their public downloads.
The signed feed uses build 89.

The public Complete ZIP, staging ZIP, checksums and the Complete ZIP's
source companions matched their sealed bytes on anonymous download. The
Complete source archive contains 68 measured source archives and a Java
inventory built from the actual 1.56 VSIX. The
[Windows run against the public Complete ZIP](https://github.com/codepetca/zero/actions/runs/45925391165/job/140265393025)
verified the bundled Java 21 language server on cold and warm launch.

The [Windows package job](https://github.com/codepetca/zero/actions/runs/45923243051/job/140258716954)
produced the original unsigned Store package 1.5.90.0 x64 and verified first
run and cleanup on a separately test-signed copy. The original MSIX measures
5,776,663 bytes with SHA-256
`d60d2850f6220b12374b98abbf3e55ee0d5b7c593143f08856085d9f39e53fcd`.

## Zero 0.5.89 kit and Portable release — 2026-11-25

[Starter PR #7](https://github.com/codepetca/zero-starter/pull/7) refreshed the
public project builder once the Store update was available. The public starter
tree `0711c0c4ace8ba33459037ea675a483327bc7264` matches the generated files
and modes. [Preparation run 45749824787](https://github.com/codepetca/zero/actions/runs/45749824787)
verified Project → New with that public tree and the release VSIX. It used
`d8afc8a61e50784db94d2fa1f35001cddb4f3159`, as did the [Windows checks](https://github.com/codepetca/zero/actions/runs/45741794960).
The complete Portable bundle's source companion has 68 verified archive entries.

[Public Windows run 45750654270](https://github.com/codepetca/zero/actions/runs/45750654270)
installed Store-signed package 1.5.89.0 through WinGet and passed first-run
setup. Collision Helper Pilot 0.2.0 passed the lesson's overlap and gap checks
with the installed JDK and the refreshed starter's geometry code. The editor
exercise reached Zero's GitHub sign-in prompt and awaits a signed-in session.

| Artifact | Bytes | SHA256 |
| --- | ---: | --- |
| zero-bootstrap.zip | 5,463,372 | `1e042eb70490f03c5c785c5dc290728fb06010dd7ddebc277af766a53640912e` |
| zero-0.5.89.vsix | 2,660,204 | `bfcbb453be624a89a0f2eeacc5598d1832f34400eefb87e26c32f4110230d0ac` |
| zero-starter.zip | 2,779,460 | `d511e795ca2fb9fcaa992421b0e69e30522733ef8a69040fee774fc736f91145` |
| Zero-0.5.89-windows-portable-pilot-staging-x64.zip | 5,771,797 | `9f401e6e4bd0a45e56dc4544af58ba1d7aefc2ccc732a7a0bbbcb7a50970bba7` |
| Zero-0.5.89-windows-portable-bundled-x64.zip | 606,326,024 | `d020780aea3e27166ea1ebabf5b05ce692c567f62cf354bfda6b95fde5a18fa8` |

## Zero 0.5.89 Mac release and Windows certification — 2026-11-25

[PR #428](https://github.com/codepetca/zero/pull/428) passed all 12 source checks
and merged as `d8afc8a61e50784db94d2fa1f35001cddb4f3159`. The signed Mac DMG
uses the identical reviewed source tree at `1b734a634`. Apple accepted notarization
`f314afb8-9e65-41e3-b47c-4ea1820055c6`. Seal `a60ead371` binds the stapled
installer, both Git source archives and signed build 88 appcast. All three
public assets matched the seal. The Mac VSIX built and verified a WebFX bundle
with Finder metadata in two resource folders and excluded both files.

The [Windows preparation run](https://github.com/codepetca/zero/actions/runs/45741794960)
passed Store package installation and first run with a separately test-signed
copy, private JavaFX checks and Portable cold and warm opening. Partner Center
validated and accepted the original unsigned 1.5.89.0 x64 package for submission
23 with automatic publication after certification. The browser builder refresh
for the public starter is ready for the Windows upgrade path before kit preparation.

| Artifact | Bytes | SHA256 |
| --- | ---: | --- |
| Zero-0.5.89-macos.dmg | 12,707,096 | `0c3684f5dc447e2dd5a327f1fd3a03cb11f3ca83c05a9638e3d92fcb56ed5b4d` |
| Zero-0.5.89-msix-store-x64.msix | 5,765,831 | `2f60fb987cce88c81dec6af0ec9b4be5eef1c182dfcf762ad83beb086db1a4cf` |

## Zero 0.5.89 release preparation

The candidate includes the sidebar and Start Page version display from
[PR #426](https://github.com/codepetca/zero/pull/426) and the Finder metadata fix
for web publishing from [PR #427](https://github.com/codepetca/zero/pull/427).
Windows and the standalone kit pick up the ZeroHub library and Lesson 11 changes
already released on Mac in 0.5.88. Mac update build 88 is reserved for 0.5.89.

## Zero 0.5.88 Mac release — 2026-11-25

[PR #423](https://github.com/codepetca/zero/pull/423) merged the release source
after Astra high review and 12 checks. Production deployment 8066026546 served
the revised Lesson 11 and ZeroHub library guides. Apple accepted notarization
`1bcdc14a-bacf-4dad-902c-18caca4a29ed`. Seal `e7d8d530dac07bd1a6454e2212702caecdb06bd1`
binds the exact signed DMG, Git source companions and build 87 signed appcast.
The anonymous Mac DMG was 12,706,475 bytes with SHA-256
`39b851431d25ee43d8d0eed89fe40f2f2f3b0cc613d49bb96244efbb19002b91`.

The public installer provisioned 0.5.88 in an isolated profile on an Apple
Silicon Mac. In a fresh local copy of the public starter, the editor added
Collision Helper Pilot 0.2.0 from ZeroHub and all three artifact hashes matched.
The exact example from the live lesson displayed “Collision Helper Pilot works”
in JavaFX and in the editor’s WebFX preview after approving the browser-tools
update. The trial ran signed out. Hosted Windows installation, JavaFX and
Portable cold/warm launch tests passed in
[run 45675175020](https://github.com/codepetca/zero/actions/runs/45675175020).

## Zero 0.5.88 release preparation — 2026-11-25

This candidate ships the ZeroHub request status, hosted library support and new
`zero.lib` packages from PRs #418, #420 and #421, with updated Lesson 11
instructions. Reserve Mac update build 87. Public 0.5.87 downloads and the
signed build 86 feed remain in use while the new artifacts are prepared.

## Zero 0.5.87 release promotion — 2026-11-24

[Source PR #416](https://github.com/codepetca/zero/pull/416) passed all 12 checks.
Its reviewed head `26eba2705508eaf936b7c41e3405b4197f2ad914` has the same tree
as release source `546746786b225a60c45724774658dc96db105872`. This tree includes
editor-first Game Jams, schedule editing, and the Windows classroom fixes from
PRs #413, #414 and #415.

[Canonical kit preparation](https://github.com/codepetca/zero/actions/runs/45543668597)
passed Project → New from the public starter with the exact release VSIX,
including native and WebFX builds. [Hosted Windows CI](https://github.com/codepetca/zero/actions/runs/45543668338)
passed first run, JavaFX and Portable cold/warm starts. The
[targeted Windows run](https://github.com/codepetca/zero/actions/runs/45544003892)
passed the Merge and command quoting regressions and the actual Lesson 11 badge
check and both examples. A separately test-signed copy of the exact Store MSIX
passed install, installed payload comparison and cleanup.

Apple accepted notarization `4f99afbb-2723-487a-9953-e6a1d66b925d`. Seal
`590af6550d69b0957ff6993437a87d67e4fa854d` verifies the signed, stapled DMG,
Gatekeeper assessment and signed build 86 appcast. The isolated Mac editor
loaded the matching packaged VSIX and displayed Zero 0.5.87 on its Start Page.
The profile was signed out. An installed Mac automatic upgrade and a physical
or school-managed Windows install remain outside this evidence.

Partner Center submission 22 (`1152921505702499853`) used the unchanged original
MSIX and was set to publish after certification. The Canadian catalog listed
`Codepet.zerostudio_1.5.87.0_x64__g62pw1js6rhjp` at 11:28 p.m. Toronto time.
The Mac and Portable releases passed authenticated draft and anonymous public
asset checks. The complete Portable release retains the measured prior source
TAR for byte-identical third-party tools and a matching source index.

| Artifact | Bytes | SHA256 |
| --- | ---: | --- |
| zero-bootstrap.zip | 5,149,430 | `ba834f9340d07f10a8518703233ac7058e244c894bceea4993d01b6463bd1575` |
| Zero-0.5.87-macos.dmg | 12,415,181 | `1efca69ea64934ff76febdac068ea3e2bc3554fb2f264e6e5af9a9cd0e0c4fbd` |
| Zero-0.5.87-windows-portable-pilot-staging-x64.zip | 5,457,953 | `a1dbc1f1f3d00dfb5e7ff63d12567d0a9ccdcf612e2fe00cc8ca482e1520a208` |
| Zero-0.5.87-windows-portable-bundled-x64.zip | 606,012,025 | `7271c97dcac66e34ccf241439c484b5d05b1152540e5b5b95073c694696093ae` |
| Zero-0.5.87-windows-portable-sources.tar | 1,470,730,240 | `b2ac332967bc8044b18ad5f11a913a862dd2d5939bc7b4e094309c12d8fb9fe0` |
| Zero-0.5.87-msix-store-x64.msix | 5,451,499 | `2a0160a2887ce088e752798a8dd956ca9f72f444a5cc3de842603945254e00cb` |

## Zero 0.5.87 release preparation — 2026-11-24

The 0.5.87 source includes [editor-first Game Jams](https://github.com/codepetca/zero/pull/413),
[organizer schedule editing](https://github.com/codepetca/zero/pull/414) and
[Windows Merge and Check Library fixes](https://github.com/codepetca/zero/pull/415).
Mac update build 86 is reserved for this candidate. The verified 0.5.86 kit,
Mac installer, signed feed and Portable downloads remain the public defaults
until the new release passes its platform and publication checks.

## Zero 0.5.86 release promotion — 2026-11-24

[PR #405](https://github.com/codepetca/zero/pull/405) added the sidebar and
Start Page changes. [PR #406](https://github.com/codepetca/zero/pull/406) corrected
the Windows compiler path mapping and scoped a read-only fallback for the public
starter API. Both source PRs passed all 12 checks. The final reviewed head
`a13e9999dc70aae125c18fd9dd62186a4a2277d2` has the same tree as source merge
`98fba40f51031f666de9e9a3da6fff02355e39b5`.

[Canonical preparation](https://github.com/codepetca/zero/actions/runs/45410523444)
passed Project → New with the public starter and exact VSIX, including native and
WebFX builds. The [hosted Windows run](https://github.com/codepetca/zero/actions/runs/45410523186)
passed package installation, first run, private JavaFX and Portable cold/warm
opening. The [exact Store editor trial](https://github.com/codepetca/zero/actions/runs/45412895310)
used the package payload in an isolated Development Host, alongside separate
first-run package checks. Physical and school-managed Windows devices and a
real Mac automatic upgrade remain outside this release's evidence.

The Mac and hosted Windows editors displayed **Zero 0.5.86** on Start Page and
one **Show Problems** action for a deliberate Java compiler error. On Mac the
action focused the exact diagnostic. On Windows, the editor recorded one compiler
diagnostic for the synthetic source after the fix. Both editor sessions used the
packaged extension and an isolated test workspace with no student account.

Apple accepted the signed installer under submission
`9577b114-f124-4805-b130-7815978a9c14`. The stapled DMG and its app passed
Gatekeeper. Seal `ee384cffa63cc239ea316ca775c4f678a0348f3a` records its measured
installer and signed build 85 feed. The published DMG and both Git source
companions matched the authenticated draft and the local seal byte-for-byte.

Microsoft Partner Center submission 21 (`1152921505702493592`) used the original
MSIX from Windows run 45410523186 and was set to publish after certification.
The Canadian Store catalog listed `Codepet.zerostudio_1.5.86.0_x64__g62pw1js6rhjp`
at 2026-11-24T14:43:04Z. Both Portable archives, their checksum files and the
complete bundle's corresponding source files matched their authenticated drafts
and anonymous public downloads. The complete bundle reuses the verified source
TAR for unchanged third-party programs and retains its matching source index.

| Artifact | Bytes | SHA256 |
| --- | ---: | --- |
| zero-bootstrap.zip | 5,134,997 | `240c94429f447362eed94061e490533b27bb668f44418d1c638268f4c2b37108` |
| Zero-0.5.86-macos.dmg | 12,391,468 | `53e4f4fa813591e4a5ee3e61c60381c56e91c15873ca323834d2ebb602efc74e` |
| Zero-0.5.86-windows-portable-pilot-staging-x64.zip | 5,443,620 | `b973c743d01b6aae6cdfe3c43d33df3c91701df94aeec76db5a0d446e2a5742a` |
| Zero-0.5.86-windows-portable-bundled-x64.zip | 605,997,605 | `17952cd96f5c23730b013569adf2cfcc5080effd437c8dd13848da3c2581028e` |
| Zero-0.5.86-windows-portable-sources.tar | 1,470,730,240 | `b2ac332967bc8044b18ad5f11a913a862dd2d5939bc7b4e094309c12d8fb9fe0` |
| Zero-0.5.86-msix-store-x64.msix | 5,437,020 | `f41c34d2a9a12ff4b862019bf52d12715d400a2c333ecbef8a4476aef4bbd6ce` |

## Zero 0.5.86 release preparation — 2026-11-24

The candidate includes the error action changes through `39047838dd57018473f4eee1a81dd6cd5ef41725`.
It prepares kit 0.5.86 and Mac update build 85. The verified 0.5.85 kit,
native download metadata and signed build 84 feed remain the published
fallbacks. Complete source review and hosted checks before publication.

## Zero 0.5.85 release promotion — 2026-11-23

[PR #403](https://github.com/codepetca/zero/pull/403) merged the classroom fixes
after all 12 checks passed. The [canonical kit run](https://github.com/codepetca/zero/actions/runs/45317559051)
and [hosted Windows run](https://github.com/codepetca/zero/actions/runs/45317559369)
passed on `b51a113d7e7094c1d5df45cbbf7d000c9996dbb0`. The production reporting
reconciliation run [45319248175](https://github.com/codepetca/zero/actions/runs/45319248175)
passed on that merge. Nine of thirteen listed coding lessons linked to complete
final Java source on the live site.

Apple accepted the signed installer. The stapled DMG passed validation and
provisioned the 0.5.85 editor on the release Mac. Seal
`e2d93c65c2fc0e24fbadd8155f1a5ecf83d2cdb6` records the measured installer. This
promotion uses the sealed, signed build 84 appcast. In the installed editor,
updating older browser tools, committing and syncing a synthetic project, and
publishing with a signed-in GitHub account succeeded. The
[Pages run](https://github.com/armorup/zero-pages-publish-check-20261114/actions/runs/45318850298)
passed and the resulting site responded anonymously.

The [exact Store package check](https://github.com/codepetca/zero/actions/runs/45316979400)
used a separately test-signed copy of the original MSIX on hosted Windows. Zero
restored a missing runtime lock, kept a backup, and completed a fresh browser
build with the packaged Node and JDK. Partner Center submission 20
(`1152921505702488907`) used the measured original MSIX. The Canadian Store
catalog listed package `1.5.85.0` x64 at 2026-11-24T03:43:13Z. Physical school
devices and an installed Mac auto-update remain outside this evidence.

The kit, Mac installer and source companions, small Portable ZIP, and complete
Portable ZIP with source companions passed anonymous download size and SHA256
verification. The native and Portable drafts were verified before publication.
Promotion CI opens the exact public complete ZIP on Windows.

| Artifact | Bytes | SHA256 |
| --- | ---: | --- |
| zero-bootstrap.zip | 5,134,463 | `df48eecb04aaa51940a6f5852ee90d5b3d13c7cceac1627387c8ecfbfdfc4759` |
| Zero-0.5.85-macos.dmg | 12,387,375 | `c49dc82e4576018ee1d19cfbc7aa793f981eba7c014fa1bc4da9f67ba6b75bfd` |
| Zero-0.5.85-windows-portable-bundled-x64.zip | 605,997,051 | `f8e8958a32c94d16f8b5d30841eee1f691f9d3177c19a97167efed396cf76c6b` |
| Zero-0.5.85-windows-portable-sources.tar | 1,470,730,240 | `b2ac332967bc8044b18ad5f11a913a862dd2d5939bc7b4e094309c12d8fb9fe0` |
| Zero-0.5.85-msix-store-x64.msix | 5,436,575 | `005e2f1d25c9d94b1f13ecdd091e9a31dd087ed8dbb1dec903bfc3c4660f6773` |

## Zero 0.5.85 release preparation — 2026-11-23

The candidate includes the classroom rollout changes and verification through
`343251549`. It prepares kit 0.5.85 and Mac update build 84. The verified
0.5.84 kit, native download metadata and signed build 83 feed serve the
published downloads during preparation. Complete source PR review and hosted
checks before publishing the candidate.

## Zero 0.5.84 release promotion — 2026-11-19

[PR399](https://github.com/codepetca/zero/pull/399) adds Trash and Recycle Bin
deletion for editable Files rows. [PR401](https://github.com/codepetca/zero/pull/401)
prepares the release. All 12 checks passed on each source PR. The
[canonical kit run](https://github.com/codepetca/zero/actions/runs/44652490676) and
[hosted Windows run](https://github.com/codepetca/zero/actions/runs/44652494517)
passed at `3e83a67914eb8e463313edab320af0575d20010f`. The packaged Project → New
trial used the public starter and the release VSIX.

Apple accepted the signed Mac installer and the stapled DMG passed validation.
Seal `3ab5262fc55529f8f0ffa3c9749586be7d7af5e9` captures the measured installer.
The promotion copies the exact signed build 83 appcast. The three kit assets,
three Mac assets and seven Portable assets passed anonymous download size and
SHA256 verification. Native and Portable drafts were also verified before
publication. Promotion CI opens the exact public complete ZIP on Windows.

The original MSIX passed a hosted installation and first-run trial using a
separately test-signed copy. Partner Center submission 19
(`1152921505702454884`) uses the measured original package and is set to
publish as soon as certification passes. Physical Windows testing remains
outside this release's hosted evidence.

| Artifact | Bytes | SHA256 |
| --- | ---: | --- |
| zero-bootstrap.zip | 5,127,265 | `084537553e72f2a04b8c96af812d1184e31398d1b4e2c42abaee8010d19fe255` |
| Zero-0.5.84-macos.dmg | 12,371,605 | `98bcfddca7a9ffa4b154aa932f8fa615a7412a385d118f78df9ebc6df0368460` |
| Zero-0.5.84-windows-portable-bundled-x64.zip | 605,989,726 | `e91f4290af79ecff8e441d0f748e81439d05338958cd4e9bada39aba8957a205` |
| Zero-0.5.84-windows-portable-sources.tar | 1,470,730,240 | `b2ac332967bc8044b18ad5f11a913a862dd2d5939bc7b4e094309c12d8fb9fe0` |
| Zero-0.5.84-msix-store-x64.msix | 5,429,174 | `28cce4e9f0c30eb7601f437d083a1e0cf20df283770baaec5729d4808469f158` |

## Zero 0.5.84 release preparation — 2026-11-19

[PR399](https://github.com/codepetca/zero/pull/399) adds Delete to the Files
context menu and merged after all 12 checks passed. [PR401](https://github.com/codepetca/zero/pull/401)
prepares kit 0.5.84 and Mac update build 83. The published 0.5.83 records remain
the active downloads during preparation. Manual Windows testing of the Files
feature was skipped at the owner's direction. Hosted release checks remain required.

## Zero 0.5.83 release promotion — 2026-11-19

[PR395](https://github.com/codepetca/zero/pull/395) fixes Git merges and sync, and
preserves the underlying browser publishing error. [PR398](https://github.com/codepetca/zero/pull/398)
sets the kit version and Mac update build. Both exact-head CI sets passed.
Canonical [preparation](https://github.com/codepetca/zero/actions/runs/44600431774)
and [Windows installation verification](https://github.com/codepetca/zero/actions/runs/44600431275)
passed from `50931e77a8f52e8bc8769264049d6f53c6529be8`. The packaged Project → New
check exercised the starter in both the native app and a browser.

Mac build 82 was signed, notarized and stapled. The native build from
`b7908f77e` has the same source tree as the canonical preparation. The website
feed uses the exact signed XML from seal `173b254f9`. The Windows Store version
`1.5.83.0` matches the measured original submitted package. The Canadian retail
catalog included this version at 2026-11-20T00:16:27Z. The Store package also
passed installation and first launch on hosted Windows with the separate test
signature. The promotion CI opens the public complete Portable ZIP on Windows.

| Artifact | Bytes | SHA256 |
| --- | ---: | --- |
| zero-bootstrap.zip | 5,126,058 | `267e001d04386e997d41644d6c930e298d6dd855dca50c06f41af28839016b3d` |
| Zero-0.5.83-macos.dmg | 12,375,012 | `57af5dff3c2635b7b2582855333f32c05a260bfb8906f297ba07b15adfd8d501` |
| Zero-0.5.83-windows-portable-bundled-x64.zip | 605,988,504 | `de73a60c162727c0ee8460b40d2fec010059dbef53739f5c4950e15a687f7b2b` |
| Zero-0.5.83-windows-portable-sources.tar | 1,470,730,240 | `b2ac332967bc8044b18ad5f11a913a862dd2d5939bc7b4e094309c12d8fb9fe0` |
| Zero-0.5.83-msix-store-x64.msix | 5,428,029 | `6636260cf83ef7ff991b8193b42404c2cc8e4e354031d65d98db0314238781df` |

## Zero 0.5.82 release completed — 2026-11-19

Promotion [PR393](https://github.com/codepetca/zero/pull/393) merged as
`6638d24d266449c9fd09060f1c941bcf08709998`, with all 12 checks passing at
`1b7cf8995`. Source/browser/Windows runs 44572656577 / 44572656487 / 44572656551
passed; the exact public Portable ZIP passed cold/warm opening with canonical
kit `79101796…`. Two initial Sol/high reviews and one targeted fixture re-review
are clean after one correction batch. All public assets, including complete
Portable checksum/index/README/source TAR, passed anonymous size/hash verification.
Store submission 17 / 1.5.82.0 is live. Exact-merge production deployment
`dpl_BqrdVB6pyBEi6fiSG5ZhdENcimGz` reached READY with the canonical alias. Live
Mac/Store/Portable links, DMG bytes and the 1179-byte signed build 81 feed were
verified at 2026-11-19T17:22:23Z. No previous asset was replaced; standalone preview stays 0.5.77.

| Additional verified artifact | Bytes | SHA256 |
| --- | ---: | --- |
| Zero-0.5.82-windows-portable-bundled-x64.zip | 605,983,321 | `74f2de321cf8f9fe3ba6248ea2fc9cf08fe6a089e37d1c711f00f5d633da027b` |
| Zero-0.5.82-windows-portable-sources.tar | 1,470,730,240 | `b2ac332967bc8044b18ad5f11a913a862dd2d5939bc7b4e094309c12d8fb9fe0` |
| Zero-0.5.82-msix-store-x64.msix (submitted original) | 5,422,548 | `fa792d2bdff33769ba8991ecd8fa783b2cb9ce6659dfb3ebd4c26a16df07fe52` |

See [final evidence](EVIDENCE.md). The dated preparation checkpoint below preserves
its earlier pending observations; this completed receipt supersedes them.

## Zero 0.5.82 release in progress — 2026-11-19

Source PR392 merged `8e754368a6f23c36dc20111b3015c55ed68fc108` with all 12 checks.
Canonical preparation 44550447823 and Windows preparation 44550453843 passed.
The public [kit](https://github.com/codepetca/zero/releases/tag/v0.5.82) contains:

| Asset | Bytes | SHA256 |
| --- | ---: | --- |
| zero-bootstrap.zip | 5,120,661 | `7910179675f575d931aa31e465f25fc55a82929e1379897842deaa9e2f7c9bca` |
| zero-starter.zip | 2,778,887 | `0ef38f86a4b83b038e663cf7342ac90b0d6fca1eafb566de7066acb7d363b66b` |
| zero-0.5.82.vsix | 2,317,248 | `63000d5c0cbf1bed0b48cee6cb220c791b5718f2e3b5fb027607d52de75af4d0` |

The [Mac release](https://github.com/codepetca/zero/releases/tag/setup-v0.5.82)
and both source archives passed anonymous verification. Its DMG is 12,362,920
bytes, SHA256 `186370fce89e577404330c6e33abbbff4cb5171ee1c8877ae7f65d6ec3ce84ab`;
built source `a37ba4a22`, seal `5ca6a5489`, update build 81. The public
[small Portable ZIP](https://github.com/codepetca/zero/releases/tag/windows-portable-pilot-v0.5.82)
is 5,429,096 bytes, SHA256 `b3b1a0fd93f1e8ff14bfddbba38929ceb995ebff3c89b0a44e2d2786130dbc71`,
and passed anonymous download verification. The complete Portable release is public
after all five authenticated checks; anonymous ZIP/source-TAR and exact public ZIP
cold/warm acceptance remain pending. Its
source TAR preserves all 68 verified mappings and SHA256
`b2ac332967bc8044b18ad5f11a913a862dd2d5939bc7b4e094309c12d8fb9fe0`; its adjacent
index identifies 0.5.82.

Store submission 17 (`1152921505702451016`), package 1.5.82.0, was submitted for
normal ASAP release and is awaiting certification. The original unsigned package
SHA256 is `fa792d2bdff33769ba8991ecd8fa783b2cb9ce6659dfb3ebd4c26a16df07fe52`.
It is not yet verified live. Actual installed VSIX reporting acceptance and the
first scheduled reconciliation passed; see [evidence](EVIDENCE.md). Promotion
review/CI, live website/feed read-back, physical school devices and interactive
updater acceptance remain pending. The AI investigation runner is separate.

The 0.5.58 Store candidate includes Project Explorer and online Tutorial Docs
updates, recent tutorial changes, and Store Java/VS Code startup fixes. Its exact
package passed a Windows first-run test; WACK reported a DPI warning and an optional
blocked-executables finding, disclosed with the submission. See the
[Windows validation run](https://github.com/codepetca/zero/actions/runs/41134687731).
The candidate source is on a release branch; do not assume its Store fixes are
merged into main. The Store submission does not publish a Mac or standalone Windows
installer.

## Zero 0.5.81 — 2026-11-18

Owner-authorized source merge, download publication and Store rollout are complete.
[PR385](https://github.com/codepetca/zero/pull/385) merged source at
`b61d160d3057f381da2a83c442a152548ba9a5e8`; all 12 final-head checks passed.
[PR387](https://github.com/codepetca/zero/pull/387) merged kit/Portable metadata
at `2e71daf03f0c04e20277445c755e5267c1a63073`; [PR388](https://github.com/codepetca/zero/pull/388)
merged Mac/feed/snapshots at `c0bdc93800272192bfccaa7f947c1efedb63e83f`, also
with all 12 checks green. Core stays 0.3.0. No previous public asset was replaced.

Explicit browser build/publish offers **Update Browser Tools**, backs up the old
`.zero-build`, updates only those tools and resumes. Java/assets/framework stay
unchanged; Cancel ends quietly. Incomplete full-project recovery still blocks
browser actions. Missing Git revisions receive clearer guidance without claiming
every previously reported merge error was reproduced. Report a problem remains
proposed in the separate always-on improvements chat.

Canonical [manual preparation 44447511514](https://github.com/codepetca/zero/actions/runs/44447511514)
uses reviewed ancestor `ae18259ca607d7ce464e21a21d83ecf60182ac9b`, with packaged
inputs unchanged on merged main. Its kit/starter/VSIX and both Portable archives
are exact source-bound release bytes. Full hosted tests: 2557 passed, 163 skipped;
website: 867 passed, 4 skipped, with successful build. Native/game/framework,
27 GUI examples and lesson checks passed. [Browser44447460456](https://github.com/codepetca/zero/actions/runs/44447460456)
passed 414 contracts (4 skipped) plus actual WebFX compiles/browser behavior.
Public starter 32c4d56/tree 369608a5 matched source and modes; native UI_READY/Sam/Ada
and Chrome 157 Sam/Ada passed with the exact VSIX. No template update was needed.

The Mac was built at `0984de1e5ac101470d9f87141da81b590d77f1c4`, sealed at
`965b8438e0c9b2459e8c37e2093acb2a4197ff69`, and independently reviewed. Apple
accepted notarization `0694438f-9894-4643-885f-aa9c3192e743`; Developer ID,
staple, app/DMG Gatekeeper and protected-source equivalence passed. Its measured
source-equivalent local kit remains distinct from the canonical Linux kit.

All native, kit, small Portable and complete Portable draft assets and anonymous
public downloads passed exact size/hash checks. The complete release includes
its checksum, source index/README and source TAR; all 68 source mappings were
verified. Source TAR bytes are reused unchanged from 0.5.80 because upstream pins
are unchanged, with an explicit 0.5.81 association. [Windows44457509540](https://github.com/codepetca/zero/actions/runs/44457509540)
passed cold/warm reopening of the exact published ZIP/ad702aa9… and kit c7e85483…,
superseding the separately built same-source preparation trial. Promotion data
review 23baa99fa and targeted published-kit fixture review 35e2977e7 were clean
(Sol/high). Local promotion validation: 868 website tests passed, 3 skipped;
configuration/typecheck/build/bundle/runtime checks passed.

Live read-back at 2026-11-19T04:38:15Z (Nov18 America/Toronto) verified homepage
Mac 0.5.81, both Portable 0.5.81 links and exact public DMG 12355557bytes/06ff83d7….
The served appcast matches all 1179 signed bytes/feba5d35…, build 80. Ed25519
feed and DMG signatures pass, and production deployment status is successful.
Operational receipts are ignored under `.verification/release-081-publication/`
in the publication worktree. Historical preparation files remain retained.

Microsoft Partner Center confirms submission 16 (`1152921505702445603`) is live
in Microsoft Store, with validated Zero Studio 0.5.81 / package 1.5.81.0 x64.
Certification and publishing completed with normal ASAP settings. Original
unsigned MSIX and separately test-signed hosted install/first-run receipts remain
distinct. The earlier certification/publishing and submission 15-live snapshots
are superseded. Physical school devices, authenticated Pages upload and live
interactive updater delivery remain untested.

| Verified artifact | Bytes | SHA256 |
| --- | ---: | --- |
| zero-bootstrap.zip | 5,110,853 | `c7e854839fd11090d5b35e723ba1763400bb5a7862cf3e913811dd7792aa541e` |
| zero-starter.zip | 2,778,887 | `60ffe9a8733743aaaf33d4664f3bed208926fd4daf8393bae7d56143c4b68c7e` |
| zero-0.5.81.vsix | 2,307,016 | `8d95490afe89d78e7e307cbdb5a37d3d44dbedd277dc6d501f3ee203afa967a7` |
| Zero-0.5.81-windows-portable-pilot-staging-x64.zip | 5,419,460 | `413b18fc0db4ecb9220659c524e524a68ac901254d482390fd27cfafa5799723` |
| Zero-0.5.81-windows-portable-bundled-x64.zip | 605,973,305 | `ad702aa9391ceb175d1150140ea5f003342acd991d1c88e55ed4d868a4f652ab` |
| Zero-0.5.81-macos.dmg | 12,355,557 | `06ff83d79f41543b81c624b33270cac319414e8a8bce53940bd451bb15b13ab5` |
| Zero-0.5.81-msix-store-x64.msix | 5,412,784 | `835b0013c901a96320831077406cb49f21ab428e1aacf12ea98f9b223942c9d8` |
| Zero-Setup-0.5.81-windows-development.exe | 15,477,196 | `f2d92625a5553f8d27ec6bfaecc7a546ecbe28710a2c84c40048601035b2586a` |
| Zero-0.5.81-windows-portable-sources.tar | 1,470,730,240 | `b2ac332967bc8044b18ad5f11a913a862dd2d5939bc7b4e094309c12d8fb9fe0` |

The development EXE is a retained CI candidate, not a newly published preview.
Current website Windows choices are the Store and both Portable ZIPs. Native,
Windows and canonical Linux kit archives are source-equivalent but independently
measured; do not substitute their bytes. See [evidence](EVIDENCE.md).

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
Terra/high review verified the reused TAR and all 68 source mappings. The adjacent
index explains the original0.5.78 index inside the byte-identical source TAR.

Local full-promotion checks:868 website tests passed, 3 skipped, with typecheck,
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
