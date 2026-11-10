# Zero Dev

Zero Dev runs the current checkout's Zero extension directly in VS Code. Use it
to test what students will see while you edit. Reload the Dev window after an
extension change. The installed app and its profile stay separate, and ordinary
development requires no new VSIX, installer, signing, or publication.

Install the maintainer dependencies with Node.js 22+ and `npm ci` once per
checkout. The launcher needs VS Code. On Mac it looks for the same local editor
locations as installed Zero and reuses the matching private Java 21 and Node 22
when they are available. Otherwise it uses locally available tools. Set
`ZERO_DEV_CODE` to choose a VS Code CLI explicitly.

## Start with the student flow

```sh
npm run dev
```

On Mac, double-click **Zero Dev.command** in this checkout for the same launch.
Keep the terminal open to watch source. The **Zero Dev · GitHub** window opens
Zero's Start Page. Use Project → New, Clone, or Open as you would in installed
Zero. Sign in through the editor once per checkout's Dev profile. Branch
creation, Commit, Sync, and Merge use the selected project's Git settings and
Zero's usual GitHub account. These are real actions. Use a test repository for
experiments. The launcher clears inherited Git environment overrides, including
file-only test fixture settings.

Use the following to open the same live Dev profile without starting another
watcher. You can also pass the folder of a test project.

```sh
npm run dev:github
npm run dev:github -- /path/to/your/test-project
```

The Dev profile keeps its own sign-in, preferences and local editor state. No
account state is copied from installed Zero. To exercise Java editor completion
in this profile, install **Language Support for Java by Red Hat** in Dev. Zero's
Run button uses Java independently of the language server. Run in Browser
requires a project with its saved browser builder and compatible Node 22 and
Java 21. Existing projects keep their own framework and build files when the
editor reloads.

## Open the isolated Coin Game

```sh
npm run dev:sample
```

This starts the watcher and opens a playable scratch project with Git disabled
and uploads simulated. Open `src/main/java/Main.java` and click **Run**. Click
the canvas and use arrow keys to collect the three coins. **Restart** resets the
score and returns canvas focus. The sample starts from lesson 11 and follows the
current `framework/src/main/java/zero` sources. First Maven use may download
pinned dependencies. Later runs use its normal cache.

The scratch game and generated state live in `.verification/zero-dev/`.
Editor state lives in `~/.zero-dev/<checkout-id>/` (with a `-github` suffix for
the live profile) so VS Code's IPC sockets fit within macOS path limits.
Quit the Dev editor and relaunch it if the selected runtime or launch environment
changes.

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

Ctrl+C stops watching and the preview. The development editor stays open. Use
one watcher per preview port. Without a watcher, run
`npm run dev:prepare` before reloading the editor. A malformed source edit pauses
refresh with its error; fixing and saving a watched source retries preparation.
Generated framework/configuration files have ownership hashes. If one was edited
directly, preparation refuses to overwrite it: move the intended edit to its source,
then restore that generated copy. Your game and profile edits are preserved.

## Commands and checks

| Command | Result |
| --- | --- |
| `npm run dev` | Open live Zero Dev, watch extension assets and serve the preview |
| `npm run dev:sample` | Open the simulated Coin Game, watch its framework and serve the preview |
| `npm run dev:github` | Open the source extension in a dedicated profile for live GitHub testing |
| `npm run dev:ui` | Watch and serve the preview without opening another editor |
| `npm run dev:prepare` | Refresh once without launching any app |
| `npm run dev:game` | Refresh, compile and play the current scratch game directly |
| `npm run dev:smoke` | Check scratch-game behavior, framework/native input/media and UI contracts |
| `npm run test:dev` | Verify preparation, edit preservation, isolation and reload contracts |

**Terminal → Run Task → Zero Dev: Smoke tests** runs the same smoke command from
the sample window. It copies the current game to a disposable build directory, tests
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
`node scripts/verify-project-progression.mjs`. Use an actual release candidate to verify a clean install, bundled runtime
provisioning, Test Installation, signed packages, and updates. Use each target
OS to verify its native behavior. Mac interactive acceptance is recorded in
EVIDENCE.md. Windows and Linux launcher interaction need separate testing.
