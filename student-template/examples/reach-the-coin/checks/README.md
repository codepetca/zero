# Reach the coin verification

From the repository root:

```sh
python3 student-template/examples/reach-the-coin/checks/verify.py
npm run check
git diff --check
```

`verify.py` prepares the existing framework, copies a standalone starter to a
temporary folder with spaces in its path, and copies only the game's two Java
files plus the maintainer harness into compiled source. It builds and launches
with that starter's pinned wrapper and dependencies. No test dependency is added.
The temporary project is removed; generated canvas snapshots are stored under
the repository's ignored `.verification/reach-the-coin/` directory.

The harness opens a real native JavaFX window, stops automatic frames, and
chooses held-key state and frame times deterministically. It directly sets the
existing framework's held-key set by reflection; it does **not** prove native
keyboard delivery or canvas focus. The game uses only the existing public
SketchApp API. Do not copy the checks into a student's app.

Checked behavior:

- Arrow movement, elapsed time, diagonal movement, opposite arrows and no input.
- All four bounds with the entire player square inside the canvas.
- Collision from all sides, a corner and overlapping interiors; near misses.
- Two complete wins, frozen x/y after winning, restart with R/arrows held,
  movement after releasing R, and restart before winning.
- Actual canvas pixels for player, coin and background; initial/won snapshots.
- The starter Main still exactly matches the default quiz source.

## Local receipt — 2026-10-09

macOS, Homebrew OpenJDK 17.0.14, starter JavaFX 21.0.12 and Maven 3.9.11:
pinned-wrapper compilation and deterministic native-window checks passed. Initial
and winning canvas snapshots were visually inspected: text is readable, the
gold square stays visible, and the win message appears above the game.
An ordinary `./mvnw -B clean compile javafx:run` launch also succeeded in an
ignored standalone copy. The computer-use tool could not select the standalone
Java process (app name, executable path and JDK bundle ID were rejected), so
manual/native-keyboard interaction and focus recovery remain unverified.

Physical Windows/Linux execution, VS Code Run/Stop interaction for this game,
human keyboard play and novice student trials were not performed. To finish
the manual check, run the two copied files, click the canvas, move in each
direction, reach the coin, try moving after the win, press/release R, and win
again. Switch windows and confirm clicking the canvas restores key control.

## Integration

Base: `185fc78032455b310348b98594cdfddb4c14a9b6`.
Local branch: `codex/reach-the-coin` in the managed `reach-the-coin` worktree.
All changes are confined to `student-template/examples/reach-the-coin/`.
The game consists of Main and an ordinary Player; checks are maintainer-only.
No lesson, default app, framework, dependency, release, website, packaging or
shared handoff files changed. Integrate the local commit when authorized; do
not change the starter default or copy the checks into its source. Adding this
example to any shared shelf/lesson index or global example runner is left to its
owning coordinator. No push, PR, merge, publication or credential action occurred.

Orchestration receipt: handled directly with the configured model; no delegation
or DeepSeek launch. Weekly allowance was 43% remaining at the start (account-wide,
not task-attributable). Implementation and verification took roughly 15 minutes
(manual estimate), with no game-code remediation or integration conflicts.
Native UI selection failed; deterministic rendering evidence was retained.
Token/model-effort telemetry and task-attributable usage are unknown.
