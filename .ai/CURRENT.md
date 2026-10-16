# Current state — Windows automatic setup/update implementation, 2026-10-16

Owner now requests release readiness, signing/update-feed setup, feasible tests
and the requirements for a Windows trial. This authorizes local feed-key
provisioning and signing integration. Owner has no signing account and prefers free/very cheap. No paid Azure account
is selected/configured; identity validation needs the owner. No push, publication or merge performed.
Existing safe filesystem boundaries remain; preservation/migration is not required.

Prior local implementation complete on codex/windows-auto-setup, base e268b93;
reviewed source3a4fe7a2ac04512e4a25d97aad7de19ea2622487. Managed worktree
/Users/stew/.codex/worktrees/windows-auto-setup/zero retained for owner review.
Original dirty funding checkout and separate web-export work remain untouched.
Published0.5.17 assets/feed immutable; public Windows manual ZIP remains available.

Local0.5.18 implements per-user Velopack Setup/Start shortcut, verified private
Java/editor setup, isolated editor support, first starter/subsequent saved-session
open, background authenticated launcher updates and editor update controls.
Source includes signing/package tools, optional verified website feed/download
metadata and Windows fixture/package CI. Development updater is forced off.

Verified: native834+updater11 fixture checks on Mono, zero build warnings/errors;
root279pass/1skip, Windows tooling8pass, website102/typecheck/build, kit/config,
actual vendor ZIP hash/extraction and rebuilt vpk installer/package verification.
Two independent full-diff Sol/high reviews found one shared JSONC P2; corrected
once and targeted review passed. Review3assignments/1fix batch within budget.
No remaining source-review blocker. Account-wide weekly remaining54%; storage327GB.
DeepSeek remains paused; requested/effective worker telemetry in docs/EVIDENCE.md.

Release-readiness phase in progress: coordinator owns feed-key/config/release
metadata tools and account instructions; Sol/high cloud-signing worker owns package
helper/production CLI/tests; Sol/high trial worker owns disposable Windows smoke
script/workflow/trial guide. No overlapping writers or recursive delegation.
No Windows VM/host/peer or Azure signing credentials found. Production RSA3072
feed key provisioned outside Git at ~/Library/Application Support/Zero/ReleaseKeys;
production config has public key/stable URL, development updater stays off. Account
options researched: SignPath free/selective with upstream/reputation constraints,
Store MSIX free but different packaging, direct EXE Azure aroundUS$10/month.
New delta enters independent security and compatibility reviews, two Sol/high
workers (cap7launches/4fix batches/60min,2initial launches planned,zero fixes).
Local affected checks pass; actual Windows/paid service remains untested.

Local artifacts: dist/installers/Zero-Setup-0.5.18-windows-development.exe,
Zero-0.5.18-full.nupkg and build-windows.json (clean source3a4fe7a2).
Unsigned development candidate only. Real Windows interactive install/tool/JavaFX,
SmartScreen/locking and signed A-to-B update remain untested. Production needs a
selected publisher-signing service/account, Windows acceptance and publication. No
production signed feed/publication or remote CI run claimed. docs/WINDOWS-INSTALLER.md contains
release and acceptance steps. Keep this worktree/branch and ignored evidence.
