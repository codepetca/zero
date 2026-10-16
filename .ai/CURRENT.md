# Current state — Windows release readiness, 2026-10-16

Owner requested Windows installer/automatic updates, then signing/feed setup,
feasible tests and Windows trial requirements. Owner has no signing account and
prefers free or very cheap. Local feed-key provisioning/integration authorized.
No paid resource, account enrollment, push, publication or merge performed.

Working branch codex/windows-auto-setup, base e268b93; original implementation
reviewed3a4fe7a2, release-readiness source reviewedf5209e224125d74e0cd9f29e5046d23971ccb172.
Worktree /Users/stew/.codex/worktrees/windows-auto-setup/zero retained. Original
dirty funding checkout and separate web-export work untouched. Public0.5.17
assets remain immutable. Coordination note received from web-export publishing
chat: its tutorial/editor work continues in its separate checkout; no overlap.

Implemented per-user Velopack Setup/Start shortcut, automatic private Java/editor
support, isolated profile, saved-session open and authenticated background updates.
Release-readiness adds explicit Azure Artifact Signing/existing certificate paths,
actual signature/publisher/timestamp checks, upstream Newtonsoft signature
preservation, private feed-key provisioning and disposable real-install CI smoke.
Production RSA3072 public key/stable URL configured; private key outside Git at
~/Library/Application Support/Zero/ReleaseKeys/windows-update-private.pem (0600,
parent0700). Owner encrypted backup is still needed before public release.

Verified native834/updater11 Mono fixture checks;18signing/key/package tests with
actual PowerShell7.5.3 mocked verifier;11website feed tests/prep/typecheck;3portable
PowerShell backend tests;kit bytes/source/extracted Maven;config/docs checks.
Actual provisioned key Node-sign/.NET-verify challenge/tamper proof passed.
Independent new20-file Sol/high security and compatibility reviews completed.
Three compatibility P2s (PS5.1 UTF8 decoding, hosted Java21 selection, Windows
batch quoting) fixed together; full7-file targeted review passed. Review3turns,
1fix batch, no unresolved P0-P2. New Windows-only batch execution test remains
skipped onMac and is included in CI. Prior unchanged root/website/build checks
reused; details/limits in docs/EVIDENCE.md. Weekly remaining52%,storage327GB.

Unsigned development candidate rebuilt from cleand420e63; exact EXE/package bits
match prior3a4fe7a2 (corrections affect verification/test/docs only). Artifacts in
dist/installers and ignored evidence preserved. Development updater forced off.
Local feed503/Retry-After3600 verified; production URL currently404 because local
branch is unpublished. No production signed descriptor/accepted metadata authored.

Remaining owner decision: free Store MSIX (new packaging/Store updates), selective
free SignPath (upstream/reputation eligibility unresolved), or direct EXE Microsoft
Artifact Signing aroundUS$10/month. No Windows VM/host/peer or signing account is
available here. Real Windows install/JavaFX/SmartScreen and signed A-to-B trial,
actual Azure signing (upstream1045), remote CI and publication remain pending.
See docs/WINDOWS-SIGNING.md and docs/WINDOWS-TRIAL.md. DeepSeek remains paused.
