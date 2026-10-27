# Mac 0.5.54 — sealed candidate, publication authorized

Combines bundled Java isolation from [PR217](https://github.com/codepetca/zero/pull/217)
with publishing stage feedback, Open published app below Run and Tutorial docs
wording from [PR215](https://github.com/codepetca/zero/pull/215). The website footer
removal [PR216](https://github.com/codepetca/zero/pull/216) is already live.
Owner explicitly approved source PR/CI/merge and combined Mac0.5.54 publication.

Clean built source:5f5a80d4089679a2645f0ec40df4928b456cec46. Preparation source:
2c7d6692368e0bbb51ccae39a3ddd206172f6ab2. JavaPR217 merged
39e7d32896b78a35f4c8c6fc76145ebf6a449063 after all11checks passed; its source
matches reviewed1936dd3a. The candidate's protected packaged/native sources match
the integrated tree; only version/build staging and measured native metadata are
new in this release PR. Core0.3.0 and verified tutorial scaffolds remain unchanged.

Exact stapled DMG: `Zero-0.5.54-macos.dmg`,5999134bytes, SHA256
`53f2ba45064b22cb232e14cb1b1ae296c4cd81285d7e789a49ef46e5e669725a`.
Apple Accepted submission9bf1ee0c-f932-458b-838a-2b66cfef777a. Developer ID,
arm64/x86_64 signatures, staple, Gatekeeper, exact kit payload/source/licenses,
wrapper modes and extracted Maven compile passed. Build54 archive and feed
Ed25519 signatures are sealed locally; publicMac53 feed/downloads stay unchanged.
Seal: `dist/candidates/mac-0.5.54-2c7d6692368e/`; never rebuild or edit sealed bytes.

Same-Mac installed53→54 preparation reached Opening Zero and final native
readiness reports ready=1, javaHomeBlocked=0. Installed bundle ordinary bytes,
modes and symlinks match the readonly DMG; installed extension135sourcefiles match
source. A separate officialCode1.143.1 QA profile loaded the exactVSIX while its
host carried staleJava17/oldZeroJava markers. An original standalone starter app
using only Zero/Java reached App UI ready and stopped through the sidebar. Actual
new terminal output showed private JAVA_HOME, java21.0.12.1 and javac21.0.12.1.
Installed-module checks also verified inherited JVM/Maven flags are removed,
stale-editor selection recovers, parent environment stays unchanged and a missing
private runtime gives a repair error. All recorded shell/ordinaryVSCode files and
unrelated Zero/terminal preferences are preserved.

Installed StartPage shows Sign in to GitHub while signed out. Tutorial docs
label and opening bundled lesson0 worked. An unpacked tutorial without its student
repository was correctly rejected; no tutorial guard bypass or GitHub repository
recreation. QA used local fixtures and ended with its owned editor window closed.
Fresh device/school network, physicalIntel/Windows, actualSparkle delivery and new
live app publication/historical-link retrieval are not claimed by this smoke.

Version staging independently reviewed clean (Luna/medium). Local release
contracts11passed/1explicit fixture skip; current configuration checks and3template
readiness records passed. Earlier UI/Java reviews and their exact-head CI are
reused for unchanged runtime source. Independent candidate review and this source
PR's final CI/merge remain required before immutable DMG publication and separate
reviewed download/feed promotion. Evidence:ignored `.verification/mac54/`.
Preserve Mac53/older assets, Windows21/manualkit17, student projects and ZeroJams hold.
