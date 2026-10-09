# Local verification — 2026-10-08

## Component lifecycle — local 0.5.0 prototype

Student API reference, separate local community library, native Component Workshop
and on-demand Browse/Try/Add/Update/Revert commands are implemented. Maven owns
resolution; managed POM edits preserve student Java and unrelated configuration.
HealthBar0.1.0's partial-fill bug and compatible0.1.1 fix remain immutable fixtures.
Neither is a public/community-reviewed release.

Full Node85/85 checks passed (129.62s); the subsequent task ownership/cleanup delta
passes19 affected checks, including one new Stop-during-launch integration test.
Current coverage87 tests after review fixes;20 latest affected checks pass.
The separate community admission suite now passes25 tests.
Two consumer apps × install/update/revert passed six actual finite JavaFX stages.
A coordinator consumer built from the same extension plans passed three additional
Maven/JavaFX stages with source preservation and actual JAR hashes/origins.

Workshop checks render fresh named states, change controls/reset, compile a
trusted local candidate explicitly, reject a fractional-fill mutant and invalidate
stale source-bound receipts. Its Java ZIP passes independent Python validation.
The extracted portable component kit passes with default sibling paths
in a folder containing spaces. Maven plugin argument splitting initially broke
that launch; relative defaults and file-URI custom paths corrected it.

The0.5.0 VSIX installs through isolated VS Code CLI; all extension source and
packaged trusted example assets match local bytes. This proves installation,
not native command interaction. Generated receipts stay ignored in .verification/
and the separate community .proof/. Final independent review/artifact acceptance
is recorded in CURRENT:5 review turns,2 fix batches,6 P2s resolved, no remaining
findings. Final69-member component ZIP/source/library hashes and installed VSIX
bytes match the locally committed code. Whitespace/property Java packet independently
passes Python validation; a stale initial fixture ZIP was discarded.

Physical editor clicks, chooser interaction, Windows/Linux, live CI/AI,
authenticated community acceptance, public hosting/licensing and classroom trials
remain unverified. Candidate Java executes with normal local permissions, not a
sandbox. Offline AI feedback is advisory; no tool can approve or publish. No
remote repo, push, publication, deployment or credential changes occurred.


## Individual workflow — 0.4.0

Local implementation on codex/individual-workflow from 528ce8f. The owner agreed
Start a change → Upload changes → Finish change into main, then requested this
goal's orchestration. No team/PR mode or rebase interface. Initial main upload
uses the existing reviewed path; Finish and optional local cleanup add guarded
state transitions. Authentication/storage and local Java framework are retained.
This goal authorizes local implementation and injected-remote dogfooding, not a
real GitHub upload, account modification, source push/PR/merge or release.

Checks:

- Focused sidebar tests passed 3/3: default simulation skips save/auth/Git
  mutation, cancellation, busy menus/commands, account and branch drift, update
  pause for Run App/fresh Finish, preserved conflict guidance and native Source
  Control/fallback, success-only optional cleanup, escaping and token exclusion.
- Coordinator's standalone starter trial used a temporary path with spaces and
  injected all 34 transport commands to a local bare repository. Two small Java
  changes compiled with the pinned Maven wrapper; two complete branch/finish
  cycles confirmed main and exact Java source bytes. Preparing then cancelling
  Start/Finish kept refs/files unchanged. A failed final push retained the feature
  and source; a new Finish review uploaded the preserved SHA. Optional cleanup
  removed only the local feature; the remote progress branch remained. Reusing
  that remote name was rejected. Final local-bare main was
  7db23efdfcd76e8b41a970d495404848e6d082a8. Temporary trial repositories removed.
- Full exact implementation suite passed 56/56 (147.121s at 74bc2c5). Real local
  Git tests cover newer main fast-forward, disjoint merge/update pause, conflicts
  and resolution/retry, remote non-fast-forward races, forged/stale plans,
  local/remote/root/file drift, worktree/unrelated-history refusal, ignored-file
  preservation, duplicate remote feature names and atomic cleanup against a
  concurrently moved branch. Native-session transport tests cover the narrowly
  permitted pinned fetch, destination/session guards and credential isolation.
- Initial independent security review completed clean; state/UI review found
  one P2: native checkout left the displayed current branch stale until clicked.
  Coordinator added an exact-project Git HEAD/config watcher covering change,
  create and delete. The affected 3/3 UI checks passed (0.190s), including refresh
  without a Zero command and ignoring another project's metadata. Targeted review
  accepted that delta at ae1514c with no new findings. Unchanged engine/transport
  coverage is reused.
- Configuration, syntax, command contracts, document links and diff checks passed.

Review receipt: two independent GPT-6.1 Sol/high initial reviewers completed the
full diff from 528ce8ff0206f9de21ec111843be89c9a242edd6 to
74bc2c58b45e8765f9fd2a72c5bc34788ff56434; security clean (~120s), Git-state/UI
one accepted P2 (~3min). The state/UI reviewer accepted the targeted correction
at ae1514cf50457860c7e27fa5121f4dc7a1e8c0ee (~1min). Three reviewer turns,
one initial wave, one targeted wave and one fix batch, about 6.5 minutes elapsed
including coordination; effective model and attributable token telemetry unknown.
No final integration wave adds coverage: the correction is read-only display
refresh and retains workflow/security contracts. Coordinator inspected the final
evidence-only delta. Final 0.4.0 kit regenerated; extension source/manifest/README,
every starter file, profile/optional bindings and all seven combined-kit members
match local bytes. The Unix Maven wrapper is executable and no target/Git folder
is included. Source publication remains unauthorized.

Local-bare transport is injected only in checks; production accepts the ordinary
reviewed GitHub HTTPS destination and uses guarded native-session credentials.
No real account/network trial is claimed. Final 0.4 VSIX installed through
the isolated VS Code CLI (the first nonexistent-profile attempt failed; default
isolated install succeeded). Computer-use selected a different Code process's
Welcome window, so this does not confirm new-version activation or interaction.
Installed JS bytes match the reviewed source after the final installation.
Native 0.4 editor interaction and real
GitHub start/finish, physical Windows/Linux, school restrictions and novice
student flow remain untested. The Java framework is unchanged; these Java edits
were compile checks, not physical app input or full framework GUI evidence.

## Compact GitHub sidebar — 0.3.2

Local change on codex/minimal-github-sidebar, based on the completed study branch
0cc62b5. The owner requested an account icon/initial with hover name and account
actions, a connected repo name and create/connect options behind “Connect a repo”.
The existing native authentication, upload review and transport are retained.
Only a read-only account-label getter was added to the authentication bridge.

Checks:

- Focused UI/authentication tests passed 6/6. Account/repository menus support
  cancellation, signed-out local connect, sign-in before create, account change,
  delegation to VS Code Accounts for sign-out and copy-link when connected.
  Existing busy guards also block new menu commands during upload review.
  Account names are escaped and native tokens do not appear in the HTML.
  Connected repository name remains visible after session removal.
- The simulation regression now waits for its warning to be issued before
  checking command release, removing an IO scheduling race exposed by the added
  menu checks. Production still does not await warning dismissal.
- Full Node suite: 37/37 passed (34.66s initially, 28.41s after correcting the
  native account-command route). Configuration, syntax, document links
  and diff checks passed. Java source/dependencies are unchanged, so no Java GUI
  re-run was needed for this sidebar change.
- Packaged 0.3.2 VSIX installed into the isolated Zero profile. Actual Mac reload
  showed the signed-in account's initial, accessible account name and compact
  empty-repo row. The real repository quick pick displayed create/existing
  choices. Concurrent user interaction interrupted further menu automation;
  account actions are covered by mocks so far, not a completed native logout or
  account switch. A native sign-in permission prompt encountered during the
  interrupted trial was cancelled; no authorization was granted. No account
  credentials, repo connection or files were changed by the menu trial. The
  corrected VSIX was installed again; final activation/menu trial remains a gap.

Source inspection caught that workbench.actions.accounts is a UI action rather
than a registered command. The corrected route detects the available public
workbench.action.manageAccounts command before opening its native account picker.
On older editors without it, Sign out gives manual native Accounts instructions.
Both paths pass focused tests. No internal session-deletion command is called.

One standard-risk GPT-6.1 Sol/medium independent review completed clean at
`1534dd27b65f0f34088f85f5a2f9af6125066b1b` against
`0cc62b5b719c474cebb4a7217b0fa14bd28fd1ae`: one turn/initial wave, zero
remediation, about one minute estimated; token telemetry unavailable. Reviewer
checked rendering, escaping/accessibility, cancellation/busy guards, session
consistency, command compatibility, tests and guides, and independently confirmed
the native Manage Accounts registration. Coordinator inspected the later
evidence-only delta. Final ZIP/VSIX regenerated and byte-checked against the
extension sources, manifest/README, every starter file and combined-kit members.
The Unix Maven wrapper is executable; no build/Git directories are packaged.

This local request does not authorize push/PR/merge or release publication.
Windows/Linux and signed-out physical UI remain untested. Native sign-out uses
VS Code Accounts: the user selects the GitHub account and Sign Out there; Zero
does not directly delete a native session or display a custom credential form.

## Study-app dogfooding

After the 0.3.1 fix merged in PR #3, the owner authorized building the study app
and explicitly skipped novice trials for this phase. Local implementation on
codex/study-app-dogfood starts from merged main 52cd3be. The new example uses
the existing SimpleApp unchanged: three Question objects in an array, retries,
once-only scoring, Enter/check, Next, explanations, final summary and Restart.
The shared caption constructor keeps the quiz's no-argument ScoreDisplay working;
the practice tracker uses “Completed”. No dependency, extension or framework
source changed, and no further upload or Pika action occurred.

Checks on the same Mac/JDK environment:

- New study finite real-window checks passed (25.80s): blank/wrong retries,
  trimmed/case-insensitive answers, Enter, duplicate scoring, locked Next,
  advance resets, mid-session restart, summary, finished-state guards and
  restart/rescoring. Quiz and practice checks passed with the shared constructor
  changes; animation, counter and drawing also passed. Shared/default component
  bytes match and the default quiz is unchanged.
- The normal seven-example run stopped at the existing keyboard assertion
  “Right arrow must move object”. Diagnostic state showed both window/canvas
  unfocused; the existing framework deliberately ignores unfocused key input.
  One worker diagnostic forced native window activation using unsupported UI
  automation; that pass is excluded from acceptance. No test/framework bypass
  or input-source change was made. This run does not establish a clean full
  suite or physical keyboard interaction; the focus-dependent keyboard check
  remains an environment verification gap.
- Extracted the packaged starter into a standalone path with spaces, copied
  study's exact three files, and added a fourth Question without changing the
  handlers. Full study behavior checks passed against four-question progress,
  scoring, completion and restart (10.046s Maven time). Restored the three-question
  source and removed the contributor harness from the ready-to-run local copy.
- Configuration, syntax, documentation links and diff checks passed. The full
  37-test Node evidence from the fix is reused because extension code/tests are
  unchanged. Local packaging passed. In the isolated Zero profile, the standalone
  study folder showed Main, Question and ScoreDisplay in the minimal file tree;
  sidebar Run launched Maven and the JavaFX Main process. Sidebar Stop showed
  “App stopped” and both owned processes ended. This is editor/process evidence,
  not direct JavaFX typing/clicking.

One GPT-6.1 Sol/medium builder delivered the app, shared caption and checks in
about seven minutes including focus investigation. Coordinator inspected the
source and independently tried the packaged fourth-question exercise. One writer
per component, no integration conflict. Token telemetry and attributable
coordination time are unknown. One standard-risk GPT-6.1 Sol/medium independent
review completed clean at `3f0d0c71e3b1f1471d25513f10e1d86e5c857754` against
`52cd3be7ea2b4fcfa2ea8d84e21a83cd7107c67a`, covering session transitions,
compatibility, copy reuse, instructions and checks. The unchanged keyboard-focus
gap does not block this SimpleApp change. One reviewer turn/initial wave, no
remediation, about three minutes; token telemetry unavailable. Reviewer noticed
the preliminary starter README needed repackaging. Coordinator inspected the
subsequent evidence-only delta and regenerated the final kit, matching every
starter file and guide/VSIX byte; no build/Git directories were included.

The starter still opens the beginner one-question quiz. Study remains an optional
example and an extracted local project. Windows/Linux, school setup and direct
JavaFX typing/clicking remain unverified; novice testing was skipped by the owner.
Study changes are local only; no PR/push/release publication is authorized for them.

## Teacher pilot and 0.3.1 correction

The user authorized a real teacher workflow on 2026-10-08 and completed native
GitHub permission/browser sign-in. Environment: macOS 26.6.2 arm64, VS Code
1.141.0, OpenJDK/javac 17.0.14, Git 2.53.0, Red Hat Java 1.56.0 and Java Debugger
0.59.0. Started from packaged 0.3.0 in a fresh standalone path with spaces and
isolated VS Code user data/extensions. Imported the actual settings-only profile
through Profiles UI and activated Zero; installed VSIX and Java extensions by CLI.

Observed passes:

- Minimal light sidebar, Java ready, Run while signed out, standard Cmd+Shift+B,
  Stop and compiler Problems navigation. Autosave persisted a UI edit without Save.
  VS Code continued a comment onto an import, causing a real missing-symbol error;
  double-clicking Problems navigated to its line/column. Coordinator repaired the
  source through file tools after unreliable repair-key automation and changed
  the question to 5+5/answer 10/5 points. Rebuild contained the modified question,
  no Problems, exactly one owned app process; Stop ended it.
- Cancel native sign-in, useful retry text and local controls retained. User then
  completed sign-in; Zero displayed the matching account. Create Repository opened
  official GitHub in the OS-default Chrome profile. Created a private empty teacher
  repository, connected from the standalone folder and set local test commit
  identity using a noreply email. No global identity/config changes.
- Simulation left Git status unchanged, with no index/commit. Live review displayed
  the exact account/repository, main and 29 paths. Cancel left no commit/staging
  and remote empty. Repeated Commit & Upload succeeded through Zero's native
  session transport. GitHub remote SHA matched local commit, and all 29 file blob
  SHAs matched; target/.git stayed excluded. No credentials persisted in Git config.
- Copy Repository Link pasted the correct page URL without .git into Chrome.
  The GitHub page showed the actual commit and uploaded files.

Found a reproducible UI issue in stock 0.3.0: awaiting the simulation warning
kept Upload/account controls disabled until its notification was dismissed.
Clearing notifications released them. Version 0.3.1 issues this informational
warning without awaiting dismissal; upload review/confirmation still waits.
The strengthened deferred-notification regression failed against old code and
passes after this correction. Full Node suite: 37 tests passed (22.66 seconds);
targeted UI tests, configuration/document-link checks and diff check passed.
The packaged 0.3.1 VSIX installed into the isolated Zero profile. After Reload
Window, a real simulation left Upload and Change GitHub Account enabled while
the warning remained visible. Git status was unchanged and no new commit was
created; restored the pilot's live setting and verified its clean worktree.

One independent GPT-6.1 Sol/medium reviewer completed the bounded correction and
guide review with no actionable findings at `00901afba57e8a3cbe88df381e21824fac403f96`
against merged MVP `3be9d5295b4f21b43d2b2b7077e40c612bf1403c`, independently running
the deferred-notification regression. Approximately three minutes, one review
turn, no review remediation; attributable token telemetry is unavailable. The
coordinator inspected the subsequent evidence-only documentation delta.
Regenerated 0.3.1 VSIX, starter ZIP and combined kit locally; byte checks match
the extension, starter and packaged guides, with no build/Git directories.

Limits: direct interaction with the unbundled JavaFX quiz window was unavailable
through computer-use tooling; editor/process checks are not physical quiz input
checks. Native permission cancellation was tried, not denied browser OAuth or
account switching during a real upload. Pika submission awaits a chosen classroom/
assignment; no submission, student impersonation or grades changed. Windows/Linux,
school proxies/cold caches and novice students remain untested. The private pilot
repository is retained as evidence. The owner subsequently authorized the fix PR
and merge: [PR #3](https://github.com/codepetca/zero/pull/3) merged to main at
`52cd3be7ea2b4fcfa2ea8d84e21a83cd7107c67a`; the local main checkout was synced.
Its final head reused the unchanged code review and coordinator inspection of
later documentation-only changes. No outstanding checks/reviews/threads or merge
conflicts were reported. No release or Marketplace publication occurred.

## Earlier MVP 0.3.0 delivery checks — before teacher pilot

This local implementation separates event-driven SimpleApp from animated
SketchApp, starts with a quiz, and includes six examples plus a reusable
ScoreDisplay and student exercises. The extension adds native GitHub session
onboarding, website repository creation and transient authenticated Git transport.
No real authentication, GitHub upload trial, publication or account change was
performed for this milestone. The previous publication is recorded below.

Checks performed before independent review:

- `npm run check`: configuration, syntax, command/task contracts and local
  documentation links passed.
- `npm test`: initially 30 tests passed (~15 seconds); after the first batch, 32
  passed (33.1 seconds), and after the second, 36 passed (40.8 seconds under
  concurrent build load). After the final ordering correction, all 37 passed
  (14.12 seconds). New coverage includes silent/native
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
The first targeted review confirmed those fixes but found a new interaction:
the last asynchronous session lookup followed the URL-rewrite check. A rewrite
introduced during that lookup could change Git's effective destination. The
second batch performs a fresh asynchronous lookup, finishes Git/temporary-folder
checks, then requires a synchronous captured-ticket check immediately before
dispatch. Omitted/asynchronous checks fail closed. The transport requires Git
2.31+ for environment-based runtime configuration, rejecting old/unknown versions
before its credential lookup. Targeted auth/transport/UI tests passed 16/16
(4.3 seconds), including this rewrite interval and unsupported Git versions.
See [Git's runtime configuration documentation](https://git-scm.com/docs/git-config/2.48.0)
and [Git 2.31 release notes](https://github.com/git/git/blob/master/Documentation/RelNotes/2.31.0.adoc).
The second targeted review identified one remaining preparation interval:
temporary hook-directory creation still followed the destination checks. The
coordinator reproduced it in a failing regression, moved directory creation
before the final root/rewrite checks, and placed those checks inside cleanup.
The new regression and full 37-test suite pass. This is the third fix batch.
The third targeted review accepted the final correction. A cumulative integration
review completed clean at `d0127761507500abddc4e4ea680d66eef7770f62` against
base `fdacdd46eb560fd8ef36e29027a0b116cb35b32e`, reusing the completed checks.
No remaining actionable blocker was found. Review covered the shared native-session,
transport and upload contract, simulation isolation, Run/Stop compatibility,
framework cleanup and documentation/package contracts. Six reviewer turns, one
initial wave, three targeted waves, three fix batches and one final integration
pass took approximately 25 minutes; attributable token telemetry is unavailable.

Final local artifacts were regenerated after the review fixes: Zero 0.3.0 VSIX,
`zero-starter.zip` and combined `zero-bootstrap.zip`. Byte checks matched every
starter source file, current extension module and combined-kit member; no build
or Git directories were packaged. Extraction into `Final MVP with spaces`
retained Maven wrapper executable metadata and Windows wrapper CRLF. The extracted
starter's finite GUI smoke passed (2.553 seconds Maven time). The final VSIX
installed successfully through the CLI into the isolated test extensions directory.
Final configuration/document-link and diff checks passed. This CLI installation
is not evidence of physical new-version sidebar or authentication interaction.

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


## Repository organization and website — 2026-10-09

Local framework source is canonical under framework/src; generated readable
starter copies are drift guarded. Original Java API and harness bytes match.
Flat kit verification checks source parity, receipts, VSIX bytes, wrapper modes,
absence of contributor tools and an actual extracted Maven compile in a path
with spaces. Full Node suite89/89 passed139.128s. Seven finite JavaFX example
checks passed24.15s; extracted69-member Component Workshop native check passes
with core0.1.1. Prior immutable core0.1.0 artifacts remain unchanged.

The unchanged framework SmokeLauncher failed its canvas-focus assertion during
background native launch. No assertion was weakened; full smoke success is not
claimed. Physical Windows/Linux and final native editor interaction remain untested.

Next.js typecheck/build, four download/publication boundary tests and dependency
audit pass. In-app browser checked desktop1487×1058 and mobile390×844, navigation,
API documentation, visible keyboard focus and actual kit download. Downloaded
ZIP bytes match the generated release receipt. Default production explains the
unpublished release; local verified downloads require an explicit flag, refused
on Vercel. Visual comparison passed; see website/design-qa.md.

No source push, PR, release publication, Vercel deployment, DNS or credentials
changed in this phase. Local generated artifacts and browser evidence are ignored.


## MIT release — 2026-10-09

Owner selected MIT for original Zero. Canonical license text is included in the
kit root/nested starter, standalone starter and VSIX LICENSE.txt; SPDXMIT and
wrapper Apache notices verified. Two targeted source/license drift and extracted
editable Maven checks pass. Main archives contain38/33/21entries respectively.
Independent MIT/package integration review61d772b complete with no findings.
Source PR4 merged8c54a3c. Public v0.5.0 contains only the three main artifacts;
unauthenticated downloads independently matched their receipt sizes/SHA256s.
Community archive remains local and its separate license unresolved. Website
publication metadata is populated from those verified bytes; native platform
limitations above remain unchanged.
