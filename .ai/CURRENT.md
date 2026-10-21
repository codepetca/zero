# Prompt title/hint investigation — local fix

The installed Mac0.5.42 prompt helper still puts keyboard instructions in its title.
The earlier title edits remained only in the dirty primary funding checkout.
Clean local branch `codex/prompt-title-hint` fixes the shared helper and sets
`Commit Message` above the empty input. The keyboard hint appears below via the
stable QuickPick.prompt API, with native InputBox fallback before VS Code1.108.
Fixtures preserve the actual title/prompt/placeholder mapping.

Focused55/55 and isolated recovery16/16 pass; broader167passes/1timeout under load.
Initial independent review found one P2 proposed-API gate issue, corrected with a
stable-version guard and regression coverage. Receipt/check logs are ignored at
`.verification/prompt-title-hint/`; delivery summary is in docs/EVIDENCE.md.
This is local source only. No new release/native visual acceptance/live student
Publish test, student commit/push, credentials or primary dirty files changed.

Previous published release details follow.

# Publish commit/push — Mac0.5.42 publication

Owner explicitly authorized merge and release. Source https://github.com/codepetca/zero/pull/160
merged as f994c178704a553e35e088a383b186dc0b5258e2 with five exact-head CI checks. Publish saves,
commits only when needed, pushes main and deploys the exact version. Change
branches get Merge to main guidance; cancellation/failure stops publication.
Verified results expose Open app/Copy playable link and log the playable URL.
Native Explorer from40 is retained.

Public signed/notarized/stapled Mac0.5.42: https://github.com/codepetca/zero/releases/download/setup-v0.5.42/Zero-0.5.42-macos.dmg
DMG 4601119 bytes SHA256 37316ab8f7f5e9af1134f2140918146a11bd154eedf3849c92cc7a5c92976d45; candidate mac-0.5.42-462166892a0b.
Clean reviewed build 5e877200510fbbc209145c75d8385cd87caac1b0; measured manifest 462166892a0ba937c423e92e952ffae617ad851a.
Apple Accepted 269100f6-79b9-45d6-9a28-a3b2ab8ff719; staple and actual app/DMG Gatekeeper accepted.
85affected source tests,99release/2skip,162website/type/build, exact kit and
candidate checks passed. Source integration/version and candidate reviews clean;
initial cancellation P2 was fixed and independently accepted before release.

Signed feed advances40→42. Final metadata exact-head CI, production download/feed
verification and retirement receipts are retained in primary ignored
.verification/publish-flow-release0.5.42 after completion. Prior public assets,
Windows21/manualkit17 and primary funding work are preserved. No native editor
launch after prior Code Key popup; Mac update and live student Pages acceptance
remain owner smoke tests. No credentials changed.
