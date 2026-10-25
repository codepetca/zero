# Zero 0.5.49 — fresh Mac and school-network pilot

Prepared 2026-10-24. **Pilot execution is pending.** This pack prepares a supervised
trial; the maintainer's existing Mac checks do not count as fresh-device, school
network or novice evidence. Start with one teacher/IT operator and one novice.
Publishing remains separate: do not release Zero, change the update feed, publish
a student site, submit to ZeroHub or push student source as part of these checks.

## Bring this exact candidate

| Item | Required value |
| --- | --- |
| Installer | `Zero-0.5.49-macos.dmg` |
| Bytes | 5,916,593 |
| SHA-256 | `182b79fffebb7bce665db242a5867e5592a1510f62472ee86841262c14e879ee` |
| Kit / extension / native build | 0.5.49 / 0.5.49 / 49 |
| Framework | 0.3.0; projects retain their own recorded source/build versions |
| Built source | `e5953f05e3f0d0e8e503acc5c419237f39113284` |
| Sealed preparation | `52fa3120f04562c8c51f1bf3dbed3979e1685003` |

Use the supplied sealed DMG via an approved private transfer or USB. The public
website still supplies 0.5.47; downloading that button does not test this candidate.
Record the transfer method and any normal first-open/quarantine prompt; a USB
copy does not by itself prove the browser-download warning flow. Before transfer
and on the target Mac, the operator checks the DMG using Finder's
file size and this standard macOS command from the folder containing it:

```sh
shasum -a 256 Zero-0.5.49-macos.dmg
```

Stop if the digest differs. `SHA256SUMS` in the transfer pack checks all its files
with `shasum -a 256 -c SHA256SUMS`. Preparation does not change the signed DMG.
The pack includes the prior maintainer acceptance record separately; it contains
completed local checks, not completed results for this pilot.

## Arrange the target and record its starting state

Copy [RESULTS.md](RESULTS.md) to a new per-run record before testing. Use a neutral
run ID such as `FM-SN-01`, not a student name or device serial number.

- Use an Apple Silicon Mac and the standard school account/policies students
  will actually have. Check macOS compatibility during setup. The native launcher
  targets macOS 12+, but the selected VS Code/runtime may impose a higher minimum;
  this pack does not establish macOS 12 execution or Intel/Windows support.
- Prefer a separate Mac without Zero, Java, Node, VS Code or Maven caches for the
  cold-install pass. Do not erase a working Mac or remove anyone's files to make
  it “fresh.” Record existing tools and whether setup reused them. A new account
  on a configured Mac is account-isolation evidence, not a clean-machine proof.
- Run the first downloads on the actual school network. A prewarmed home-network
  install does not establish cold school-network access. If those must be separate
  runs, keep both records and label the school's warm caches honestly.
- Have IT review [NETWORK.md](NETWORK.md), disk/download capacity, permission to
  run a copied app, default browser/callback access and Git availability. Git 2.31+
  is required for tutorial clone; Zero's Mac installer does not install Git.
  Missing Apple developer-tool prompts need the school's supported response.
- Arrange an eligible, school-approved GitHub account and an **existing disposable
  student-owned repository created from the matching tutorial template** for each
  tutorial tested. Provisioning public repositories or granting new App access
  requires its own explicit human approval; preparation does not do it. Never
  substitute a direct teacher-template clone or completed checkpoint and call it
  student lesson setup. If these prerequisites are unavailable, record those
  checks BLOCKED; the local starter can still test installation/Run.

Plan two sessions: setup/Greeting first, Study/Coin second. Reserve roughly
60–90minutes for each as a scheduling allowance, not an accepted setup-time target.
Record actual setup/download/build time and teacher help. A pause or download
failure is useful evidence; do not silently switch networks or prefill caches.

## Session 1 — setup, first Run and Greeting

| ID | Action | Pass evidence |
| --- | --- | --- |
| P01 | Verify candidate hash and record target, existing tools/caches, school-network type and account privilege. | Exact candidate49 and honest cold/warm scope. |
| P02 | Open DMG, copy Zero.app into Applications under the school's supported permissions, then launch normally. Keep normal Gatekeeper checks. | Setup finishes and opens Zero Start Page without developer commands, global npm/Maven installs or disabled security. Record all IT/admin intervention. |
| P03 | In Installed Extensions confirm Zero 0.5.49; record the actual Java extension, editor and selected JDK/Node. Use **Zero: Troubleshooting** if needed. | Ready editor and recorded actual versions; resolved Java support is not assumed pinned. |
| P04 | Through Start Page **Project → Open**, open a Finder copy of `~/Zero/starter` in a dedicated pilot work folder. Retain hidden files. Run its default app, then Stop. | Actual native JavaFX window appears; Stop closes it. This is a local setup smoke, not lesson 0 completion. |
| P05 | Use browser GitHub sign-in, checking the intended account. Cancel once, retry, and verify local Run remains usable. The account holder handles password/passkey/consent. | Browser returns to Zero without typing a device code. Record blocked browser/loopback behavior separately. Test **Zero: Sign in using a code** as the explicit fallback; fallback success does not pass the default flow. |
| P06 | **Project → Clone** the approved existing student-owned Greeting repository and open its root. Do not create a repository, grant new permissions or upload files as a shortcut. | Correct repository/account/root; HTTPS clone succeeds on the school network. If Git is missing or new access needs approval, record BLOCKED. |
| P07 | Follow Greeting lessons 0–2 in Tutorials. Student writes the label, button action and name field using Zero packages. Run after each meaningful change. | Native window says the entered greeting; student identifies setup code and click-handler code. Record time and assistance. |
| P08 | While the app is live, open **Tasks: Configure Default Build Task**, then Escape without choosing. Use **Tasks: Run Build Task** twice, waiting for readiness between runs. Stop during a later build, then Run again. | Picker does not stop the app. Each Run uses the latest source and replaces the prior window. Stop/cancel leaves no running window; next Run works. A launcher “Task completed” alone is not app readiness. |
| P09 | Remove one semicolon in the student's own greeting code and Run. Open the **Zero Java compiler** Problem, repair it and Run again. | Error points to the edited file/line, ends in error rather than unexplained “stopped,” then clears and reaches App UI ready. Retain the useful error text. |
| P10 | Choose **Zero: Enable and Prepare Browser Checks** if not prepared, then **Zero: Export for Web**. Preview through **Zero: Preview Web Export**, then **Open in browser**. | Fresh WebFX compilation succeeds on the school network; embedded and actual external-browser greeting work. A retained older preview alone does not pass this cold browser-build check. |
| P11 | In the embedded field type Sam, Cmd+A, then Alex; click Say hello. Also test ordinary typing in the external preview. | Field becomes Alex, greeting is Hello, Alex!; source editor stays intact. Record browser/version and focus issues. |

If startup or a build fails, keep the first error and current files. Use
[NETWORK.md](NETWORK.md) to identify the failing layer, then repeat only the
failed check after an approved correction. Do not replace the candidate or
student-owned framework files mid-run; a source fix needs a new candidate identity.

## Session 2 — small apps, real gameplay and preservation

Continue the same three tutorial projects. No fourth teaching project or required
framework-contribution exercise is introduced by this pilot.

| ID | Action | Pass evidence |
| --- | --- | --- |
| P12 | In an approved student-owned Study clone, follow lessons 3–7: add Counter/Question and test blank, wrong and correct answers and repeated clicks. Build native and export/preview through WebFX. | Correct feedback/score/reset in both runtimes; student can explain state versus display. |
| P13 | In an approved student-owned Game clone, follow Coin lessons 8–11, including PlayerInput/ScoreDisplay extraction and the local CreditsBadge practice. Run native and export/preview. | Physically play with arrows and WASD where added; verify input focus, collisions, HUD, win/restart and Stop in native window and browser. Student can explain explicit update/draw. Keep practice submission/local package contribution unsubmitted. |
| P14 | With an already cloned project, native and web builds completed, disconnect using school-approved means. Make a small source edit, Run, and perform a fresh web export/preview. Restore network afterward. | Native rebuild and web rebuild work from their own warmed caches, without GitHub login or new downloads. Record native, fresh web rebuild and retained web preview separately. Missing cached dependencies are a failure/limit, not an offline pass. |
| P15 | Record the project's framework/build version files and editor settings. Leave an unsaved disposable note. Quit/reopen Zero and the project, then Run again. | Note, saved source, project-owned pins and settings persist; app restarts. This is reopen preservation, not an updater test. |
| P16 | Summarize the run with the novice and teacher. Record confusing terms, copy mistakes, first useful error and help needed. | Each required row has an observed result, evidence and follow-up owner. No student name, email, passkey/auth code, callback URL or token appears in shared evidence. |

Offline scope is local editing/building after the corresponding downloads are
cached. Sign-in, clone, new libraries/dependencies, push and publishing require
network. Native success does not establish offline web compilation.

## Decision, handoff and exclusions

Use PASS / FAIL / BLOCKED / NOT_RUN. A failure that recovers still retains its
first observation and the correction/retest result. **Technical pilot pass**
requires P01–P16 observed on the target configuration, including physical native
play and fresh school-network WebFX compilation. If fresh-device and school runs
are separate, both must cover their relevant cold prerequisites. Missing evidence
holds that target; do not mark it passed from this pack's existence or maintainer
results. Record usability separately: can the novice make and explain changes
with support the teacher considers reasonable? Agree the acceptable intervention
level before extrapolating to a class.

Stop rollout for unexplained Run exits, broken error recovery/input, lost work,
required security bypasses, or unresolved proxy/runtime downloads. Return a
sanitized per-run record with the failed ID, stage, version and follow-up owner.

This pilot deliberately defers repository creation, Commit & push, merging,
student Pages/ZeroHub publication, new permissions, Zero release/feed publication
and actual Sparkle delivery of 49. A separate authorized account/publication trial
must close those classroom-adoption gates. Manual47→48→49handoff has prior local
acceptance; P15 only reopens 49. Do not downgrade the pilot machine or change its
production feed to manufacture an updater test. Keep its work and signed app
until the teacher/IT decides retention or removal; do not auto-delete evidence.
