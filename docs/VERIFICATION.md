# Local verification — 2026-10-08

## MVP 0.3.0 delivery checks

This local implementation separates event-driven SimpleApp from animated
SketchApp, starts with a quiz, and includes six examples plus a reusable
ScoreDisplay and student exercises. The extension adds native GitHub session
onboarding, website repository creation and transient authenticated Git transport.
No real authentication, GitHub upload trial, publication or account change was
performed for this milestone. The previous publication is recorded below.

Checks performed before independent review:

- `npm run check`: configuration, syntax, command/task contracts and local
  documentation links passed.
- `npm test`: initially 30 tests passed (~15 seconds); after remediation, 32
  passed (33.1 seconds). New coverage includes silent/native
  sign-in cancellation, session/account changes, sidebar states, upload-session
  capture/revalidation, destination/rewrite guards, transient credential config,
  hook cleanup, trace suppression and sanitized transport failures. All sessions
  and network operations were mocked/intercepted; local disposable Git staging
  and commits are real.
- Clean Java compile passed on Mac arm64/JDK 17. Finite GUI smoke passed (3.784
  seconds Maven time): shared startup, actual layout resize, canvas pixels,
  canvas/control focus, held-input release, useful configuration/setup failures,
  one-error animation shutdown and cleanup.
- Six finite real GUI example checks passed (21.95 seconds): quiz, practice,
  animation, keyboard, mixed-control counter and drawing. Canonical shared
  ScoreDisplay and default quiz copies match. GUI input was synthetic.
- Coordinator tried exercises in disposable copies: changed quiz question,
  accepted answer and points; added caption constructor retaining the default;
  used “Completed” in the tracker while quiz retained “Score”; changed Player
  to immediate movement. Three finite behavior checks passed in 9.55 seconds.
  These checks verify the exercise instructions, not novice comprehension.

Two independent GPT-6.1 Sol/high reviewers completed the initial change set at
`353c3cb4082aa8b406f479de4dcc50f5bfd70993`. The credential review found two P1
gaps: persistent Git Trace2 config could record runtime credentials, and a session
removed during asynchronous preparation could still dispatch credentials. Both
were fixed in one batch: explicit trace-disable environment values and final
native-session validation immediately before dispatch. Actual local Git probes
with fake credentials test trace files; removal/account-switch probes at three
preparation boundaries require zero dispatch and temporary-directory cleanup.
Targeted auth/transport tests passed 10/10 (~4 seconds).

The framework review found two nonblocking corrections, also accepted in this
batch: historical credential guidance now has explicit historical scope; failed
animation calls outer app shutdown to clear held inputs. Updated GUI smoke passed
(2.506 seconds Maven time). A disposable mutant restoring the old stop call failed
the new assertion, confirming it detects the cleanup bug.

Initial local packaging/source-byte checks passed. Scripted extraction into a
path with spaces checked and honored Unix wrapper permission metadata and Windows
wrapper CRLF; extracted GUI smoke passed (4.402 seconds Maven time). The local
0.3.0 VSIX installed through VS Code's CLI into an isolated extensions directory.
The running new editor reported VS Code 1.141.0. Computer-use tooling selected
the older editor process, so new-version physical sidebar/keyboard interaction
has not been verified; earlier 0.2.0 interactive evidence below remains historical.
Final remediation review and regenerated package checks are in progress.
Physical Windows/Linux, actual authentication/network upload and student pilots
remain unverified. Use [CLASSROOM-PILOT.md](CLASSROOM-PILOT.md) before adoption.
The original Zero code's public license remains undecided.

## Earlier 0.2.0 evidence — 2026-10-07

Zero 0.2.0 is a locally packaged prototype. Initial verification ran before any
kit publication. The owner subsequently authorized creating the public
`codepetca/zero` repository and publishing through a PR into main. Disposable
upload-engine test repositories used test-only identities and intercepted every
transport; these tests did not upload student code. No account credentials changed. The earlier Processing template and its
teacher verification record were inspected and preserved before bootstrapping Zero.

Environment: macOS 26.6.2 arm64, OpenJDK 17.0.14, Node.js 22.21.1,
Git 2.53.0 and VS Code 1.138.0. Pinned JavaFX 21.0.12, Maven 3.9.11,
Maven Wrapper 3.3.4, compiler plugin 3.14.0 and clean plugin 3.2.0.

### Automated checks passed

- `npm run check`: source syntax, JSON/exported profile envelope, command/task
  contracts, matcher references and source documentation links.
- `npm test`: 21 passing tests. Covers project/root and URL guards; simulation;
  queued Run/Stop and configured task saving; folder-scoped upload settings;
  upload cancellation and Connect/upload serialization; real disposable Git
  staging/commits with intercepted upload/confirmation; source drift, conflicts,
  nested repositories, ignored staging, renames/deletions, identity failures and
  sanitized errors. Upload regressions preserve leading-space paths and bind the
  reviewed commit SHA and HTTPS destination. Git URL rewriting is refused.
- `python3 scripts/verify-examples.py`: three isolated starter copies compiled and
  opened finite real JavaFX windows. Keyboard checks key movement, bounds and
  pixels; counter checks native buttons/label; drawing checks painting and clear.
  All printed `EXAMPLE_OK` and exited successfully.
- `./mvnw -B -Psmoke clean compile javafx:run`: finite real window checks lifecycle
  order, elapsed time, canvas pixels, held keys and a native control, prints
  `ZERO_SMOKE_OK`, then exits. Packaged starter extraction into a path with spaces
  also passed this check; wrapper executable permission survived extraction.
- Local VSIX packaging/installation passed. Starter ZIP source bytes, excluded
  build/Git directories and combined-kit members were checked. No Marketplace
  publication occurred. Dependency audit reported no vulnerabilities.

### Interactive Mac evidence

A settings-only profile was actually imported through the VS Code Profiles UI.
The export envelope was corrected after an initial import failure. Zero VSIX,
Red Hat Java and Debugger for Java were installed in that test profile. A standalone
starter copy outside the kit repository was opened in a path containing spaces.

The actual light sidebar, ordinary Main/Player editor, simple files tree and Java
language support appeared. Run App launched a Maven task and a separate JavaFX
process. Stop terminated both. Cmd+Shift+B launched the configured default task,
and the sidebar Stop button owned and terminated that task too.

A deliberate Java syntax error produced a Maven error in Problems. Double-clicking
it navigated to the correct source line and column (line 8, column 22). The disposable
source was restored. Testing exposed Java language-server output in Maven's class
folder; Run now uses `clean compile javafx:run`, and automatic Java background
builds are disabled. This prevents a stale editor-generated class from masking a
compiler error. Extra editor buttons, inlay hints and empty AI panels are hidden
by the profile/extension settings.

The Mac initially locked during final verification. After access returned, a fresh
standalone copy in a path with spaces passed Cmd+Shift+B launch and repeated
shortcut restart. The first Maven/app processes ended and one replacement pair
remained. Sidebar Stop then terminated both replacement processes. An editor
comment persisted to disk without a Save command, verifying autosave; the test
source was restored. The actual dark-theme sidebar/editor screenshot is saved at
[actual-zero-editor.png](design/actual-zero-editor.png). Both light-profile import
and a user-selected dark theme have now been observed in the real editor.

### Independent review and remediation

Two GPT-6.1 high-reasoning reviewers covered the upload engine and IDE/configuration
in one initial wave. Three P1 and two P2 findings were accepted: trimmed NUL filenames,
mutable HEAD/destination transport, provider-returned tasks bypassing the resolver,
and missing resource URI for upload settings. All were corrected in one fix batch.
One targeted high-reasoning follow-up reviewed the combined delta and accepted it;
four added engine regressions plus two delayed URL-rewrite probes passed.
No remaining concrete blocker was found in that delta. The later native repeated-shortcut check also passed, as described above.

Review ledger: 3 launches, maximum 2 concurrent reviewers, 1 remediation wave,
1 fix batch. Reviewed engine SHA-256:
`7a936e68d2464bb13fe3e7f9bee108e1002a50dbfdb80e14aeb5d5997e56fc23`.
Core SHA-256: `37844050205f033a9167bdc53f31cbec5d40355dfd59086479c99f6c02716682`.
The later IDE-only delta closes an empty AI sidebar on activation in the quiet
profile; it does not change upload behavior.

### Historical 0.2.0 limits and next platform checks

The following are the earlier version's observations and proposed checks. The
0.3.0 native-session bridge replaces its credential-helper requirement; use the
current classroom pilot checklist for new trials.

Physical Windows/Linux, school machine restrictions/proxies, fresh dependency
caches, GitHub authentication/network upload and Pika submission are unverified.
Tests of intercepted Git transport are not evidence of a real upload. The installed
Git subprocess needs a working credential helper; VS Code UI sign-in alone may
not supply one. Public licensing has not been chosen (`UNLICENSED` prototype).
An earlier passing Mac smoke emitted CVDisplayLink warnings; all display hardware
support is not established.

Before classroom adoption, record OS/architecture, JDK and VS Code versions, then:

1. Import the packaged profile, install VSIX plus the two Java extensions, and
   open an extracted standalone starter in a path with spaces.
2. Run, change a visible value, Run again while active, and verify one app remains.
   Repeat through Ctrl/Cmd+Shift+B and Stop; verify build and app processes end.
3. Add a temporary syntax error, rebuild, open its Problems location, then restore.
   Observe autosave and try each example. Run the finite smoke check.
4. With separate explicit authorization, create a student-owned empty GitHub
   repository; connect, configure identity/credentials and enable live mode.
   Cancel one upload review, then confirm a real upload and inspect remote files.
   Check failure/retry guidance and paste the repository link separately in Pika.

### Coordination receipt

Current goal started 2026-10-08 01:01 UTC; account weekly remaining was 79%.
DeepSeek was paused through 2026-12-31 and was not used. Native GPT-6.1 medium
workers owned Git engine/tests, Java examples and guides separately. The Java work
completed in about three minutes; example checks initially took about 20 seconds.
Git work needed a rename/deletion correction and the review safeguard batch.
Coordinator verified deliveries; worker token telemetry was unavailable. Initial
reviewers took approximately two and six minutes; targeted review about one minute.
One writer per component and small context handoffs limited coordination overhead.
The existing chat remained coordinator; no separate chat or automation was created.
The publication request reused these completed reviews and checks; its PR records
the final focused integration review and merge decision.
