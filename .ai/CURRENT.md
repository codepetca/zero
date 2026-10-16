# Current state — Windows automatic setup/update implementation, 2026-10-16

Owner authorized implementing Windows installer and automatic updates to match
the Mac flow; preserving existing student work/settings is not required. Existing
filesystem boundaries remain. No publication, push, merge, production signing,
credential provisioning or account changes authorized or performed.

Local implementation complete on codex/windows-auto-setup, base e268b93;
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

Local artifacts: dist/installers/Zero-Setup-0.5.18-windows-development.exe,
Zero-0.5.18-full.nupkg and build-windows.json (clean source3a4fe7a2).
Unsigned development candidate only. Real Windows interactive install/tool/JavaFX,
SmartScreen/locking and signed A-to-B update remain untested. Production needs a
separately authorized key/certificate, Windows acceptance and publication. No
production feed/key or remote CI run claimed. docs/WINDOWS-INSTALLER.md contains
release and acceptance steps. Keep this worktree/branch and ignored evidence.
