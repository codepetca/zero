# Zero Dev

Use this loop to change the extension UI or framework and play a real game without
building an installer, signing, notarizing, uploading or changing installed Zero.
This is maintainer tooling: Node.js 22+, a JDK 17+ and VS Code are required. Run
`npm ci` once in this checkout. No global Maven or additional npm package is needed.

## Start

```sh
npm run dev
```

On a Mac, double-click **Zero Dev.command** in this checkout instead. Keep its
terminal open for source watching. A separate **Zero Dev** extension development
window opens with a playable Coin Game and the real Zero sidebar. Open
`src/main/java/Main.java` and click **Run**. Click the canvas and use arrow keys
to collect the three coins; **Restart** resets the score and returns canvas focus.
The sample starts from the maintained lesson 11 game, with its Player, Coin,
ScoreDisplay, PlayerInput and CreditsBadge classes. It uses current
`framework/src/main/java/zero` source.

The launcher reuses the installed Zero JDK on a Mac when JAVA_HOME is absent.
Otherwise provide a working JDK through JAVA_HOME/PATH. Set ZERO_DEV_CODE to the
VS Code CLI path if `code` is not on PATH or VS Code is installed elsewhere.
First Maven use may download pinned dependencies. Later runs use its normal cache.

The game and generated state live in `.verification/zero-dev/` within this
checkout. Editor state lives in `~/.zero-dev/<checkout-id>/` so VS Code's native
IPC sockets fit within macOS path limits, even in a long worktree path. Each
checkout has its own user-data and extensions directories, with no
copied credentials or installed Zero extension. Java language-server completion
is optional; Run/build works without it. Git integration is off, the sample is
local-only and uploads are simulated. Live Publish acceptance uses a separate,
explicitly authorized test repository and profile.

## Iterate

- **Framework:** edit `framework/src/main/java/zero/`. The watcher refreshes the
  sample's generated framework copies and prints their source hash. Stop/Run the
  game again to compile. Java classes are not replaced in an already-running JVM.
- **Game:** edit `.verification/zero-dev/game/src/main/java/Main.java` or its other
  game classes in the Dev window. Refresh preserves those edits and added files.
  Move useful completed changes into a maintained source location before retiring
  the checkout; this scratch game is ignored by Git.
- **Extension:** edit `extension/src/` or the shared CSS, then use **Developer:
  Reload Window** in Zero Dev. The source watcher regenerates CSS, starter bundles
  and tutorial reader content. It does not force reloads over unsaved editor work.
- **UI preview:** open <http://127.0.0.1:3153/components?theme=dark&state=ready>.
  The real Start Page/sidebar renderers expose light/dark/high contrast and six
  states. Authored changes restart the preview and refresh the browser automatically.
  Fixture actions remain simulated. Set ZERO_DESIGN_PORT for a second checkout.

Ctrl+C stops watching and the preview; the development editor stays open. Run
`npm run dev` again to reconnect to the same local state. Without a watcher, run
`npm run dev:prepare` before reloading the editor. A malformed source edit pauses
refresh with its error; fixing and saving a watched source retries preparation.
Generated framework/configuration files have ownership hashes. If one was edited
directly, preparation refuses to overwrite it: move the intended edit to its source,
then restore that generated copy. Your game and profile edits are preserved.

## Commands and checks

| Command | Result |
| --- | --- |
| `npm run dev` | Prepare, watch, serve the preview and open isolated Zero Dev |
| `npm run dev:ui` | Watch and serve the preview without opening another editor |
| `npm run dev:prepare` | Refresh once without launching any app |
| `npm run dev:game` | Refresh, compile and play the current scratch game directly |
| `npm run dev:smoke` | Check scratch-game behavior, framework/native input/media and UI contracts |
| `npm run test:dev` | Verify preparation, edit preservation, isolation and reload contracts |

**Terminal → Run Task → Zero Dev: Smoke tests** runs the same smoke command from
the Dev window. It copies the current game to a disposable build directory, tests
movement, scoring once per coin, win and restart using the maintained checkpoint
harness, then runs the existing finite framework checks and focused UI tests. The
native keyboard playthrough then follows the real update/draw loop to collect
all coins, win, activate Restart and collect again. It saves a rendered win image
at `.verification/zero-dev/acceptance/game-win.png`. Events go through the game's
JavaFX canvas input handlers; this is an automated integration check, not a claim
of physical keyboard/mouse acceptance. The game smoke expects the maintained sample's class/field contracts; intentionally
changing those requires a corresponding smoke harness. It does not substitute
for manually playing a substantially different game. Smoke output must contain
`ZERO_DEV_SMOKE_OK`; compilation/errors/timeouts fail the command. Build products
do not touch the playable game's target directory. Close a running game before
smoke tests that move native window focus.

For broader checks use `python3 scripts/verify-examples.py` and
`node scripts/verify-project-progression.mjs`. Packaging and actual installation/
update acceptance remain separate release checks. No version bump is needed to
iterate here; this does not change what students receive. Mac interactive acceptance
is recorded in EVIDENCE.md; Windows/Linux launcher interaction needs separate testing.
