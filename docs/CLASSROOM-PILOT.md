# Classroom pilot

For the unpublished Mac0.5.49trial, use the version-specific
[fresh Mac / school-network pack](pilots/mac-0.5.49/README.md),
[IT sheet](pilots/mac-0.5.49/NETWORK.md) and
[blank result record](pilots/mac-0.5.49/RESULTS.md). Preparation is complete;
physical execution is pending. Its core trial defers repository writes and all
publication. The broader authorized repository/hosting checks below remain
separate adoption gates; this preparation does not approve running them.

Use one student machine and one novice student before cohort adoption. This is
a trial checklist, not completed evidence. Current targets are Mac with Apple
Silicon and Windows; Linux and Intel Macs are unsupported. Physical Windows, real native
school restrictions and novice trials remain unverified. A Mac teacher trial
verified native GitHub sign-in and a private upload; consult
[VERIFICATION.md](VERIFICATION.md) and [GETTING-STARTED.md](GETTING-STARTED.md).

## Record the environment

Record the date, kit/VSIX version, OS/version/architecture, VS Code version,
project JDK (`java -version` and `javac -version`), Java extension versions/editor
runtime, Git version, browser, and whether the optional profile was imported.
Tutorial setup and authenticated uploads require Git 2.31+; older Git must be
rejected before credential dispatch. Ordinary local starter apps can run without Git.
Record school proxy/firewall restrictions, download failures, setup time and
teacher interventions. Use the teacher's privacy, account and repository
visibility instructions; keep credentials, recovery codes and student personal
information out of the record, including screenshots and logs.

## Before lesson 0: accounts and school access

Use [the student account and privacy setup](GETTING-STARTED.md#before-lesson-0-github-and-privacy)
before student lesson work. This is a required tutorial preflight, separate from
an ordinary local starter smoke test.

- Confirm school approval and account eligibility, plus the school's username,
  email and display-name rules. Have each student create and verify their own
  GitHub account if needed; do not share passwords.
- On the target school device/network, confirm GitHub access, email verification,
  native VS Code GitHub sign-in and the pinned compiler/dependency downloads.
  Include Git 2.31+ in the tutorial setup. Do not bypass school restrictions.
- Confirm that public source is allowed before using Zero's creation commands;
  created repositories and included files are public. Keep private material out.
  For an existing or GitHub-created private repository, invite the teacher using
  their verified GitHub username; the teacher must accept and open the repository.
  A personal-repository collaborator has write access, not view-only access.
- Configure Git identity per repository using a school-approved display name and
  email. For email privacy, copy the exact GitHub-provided noreply address from
  GitHub Settings → Emails; do not guess its form. Native sign-in does not set
  commit identity. Keep passwords, tokens and recovery codes out of source and evidence.

## Local smoke and tutorial repository setup

An ordinary extracted starter may be used outside another Git repository to check
setup: follow its README, retain hidden folders and run its default Hello, world!
app. This local smoke does not complete lesson 0 or the required tutorial setup.
Mac 0.5.43 Run App opens a native JavaFX window; verify rerun, Stop during
build/running, and close-to-idle there. Earlier downloads retain their bundled
behavior. Record which version you test.

The three empty tutorial templates are published, with verified exact pins in
`teaching/tutorial-templates.json`. Their seven canonical helpers match the tested
browser profile. Repeat the student-account creation/clone flow against the final
release candidate; prior maintainer acceptance is not a novice or school trial.
Do not substitute completed checkpoints, a tutorial ZIP or a teacher-template clone.

For Greeting before lesson 0, Study before lesson 3 and Game before lesson 8,
create a repository from the matching verified empty template in the student's
own account and clone that repository. Open its root in Zero. Confirm a ZIP with
no Git, a nested folder and a direct teacher-template clone receive useful setup
guidance. After clone and the first compiler/dependency downloads are cached,
confirm Run works offline without an active GitHub session.

Complete the real authorized GitHub trial below using the tutorial clone. It
already has origin and an initial main commit: skip the empty-repository creation
step for that case. New branch, Commit & push, Merge to main and first/repeat Publish use the
same controls as original projects. Source repository/Pika submission and optional
public game hosting are separate. GitHub Pages availability for private repositories
depends on the account plan; never require payment or a visibility change to finish
the lessons. A public playable site should contain only work approved for publication.

## Build, edit and explain

- In the student's Greeting clone, follow lesson 0 to write a greeting label.
  Change the greeting and click Run App again. Confirm the native JavaFX window
  updates, repeated rebuild/restart saves edits, and Stop ends the app process. Check
  profile autosave and a dark theme if used; try optional F6/F7 only if installed.
- Introduce one clear compile error. Open its source location from Problems,
  repair it and run again. Record whether a novice can use the error unaided.
- Create Study at lesson 3, then continue the same folder through lesson 7.
  Confirm students can add Counter and Question themselves without downloading
  helpers, restarting the project or removing previous work.
  Try blank/wrong/correct answers; confirm feedback, score and repeated-click
  behavior. Change the question or scoring rule and explain which code runs once
  and which runs on a click. Confirm normal text entry.
- Create Game at lesson 8 and continue it through the coin game.
  Change Player or Mover behavior; identify the explicit object update/draw calls
  and distinguish frame code from setup. Verify movement, input focus and Stop.
- Run practice with the unchanged canonical `examples/shared/ScoreDisplay.java`.
  Trace its caption constructor and retained no-argument constructor; observe
  “Completed” in practice and verify the quiz still works. Explain app state versus
  component presentation. Keep each app's own display instance.
- Have the student propose one small helper, example or useful error. Record
  confusing names, copy mistakes, time spent and teacher help. Review it before
  sharing with a cohort; packages, interfaces and JavaFX properties can follow
  when useful to a concrete app.

## Authorized repository trial

Perform these actions only when the teacher/user explicitly authorizes a real
account/network trial. Current development checks mock authentication and transport.

- Use a fresh VS Code window/profile to test actual native browser sign-in,
  cancellation and denied authentication. Confirm local Run still works, retry
  successfully, and check the displayed account. Record browser/school restrictions.
- For an original local app, use **⋯ → Repository Actions → Create a repository…** to create a
  student-owned empty public repository. Confirm the displayed account and
  public destination. Skip this step for a tutorial clone. If using an existing
  GitHub-created repository instead, connect its HTTPS URL from the standalone
  student folder and confirm the target; its visibility stays unchanged.
- Check the student's per-repository Git name/email against the preflight policy.
  For the optional simulation check, explicitly set `"zero.uploadMode": "simulation"`;
  confirm it says nothing was uploaded and makes no Git changes, then remove the
  override to restore the live default.
- With the default live mode, review destination, branch, files and commit message, then
  cancel once and verify no upload. Repeat with explicit approval to upload.
  If the session/account changes during review, expect a fresh review before retry.
- Confirm success against the actual remote branch/commit and inspect source files
  on GitHub. Record failures and whether a local commit remains. A copied link
  alone does not prove uploaded or current work.
- Click the connected repository name → Copy repository link; submit it separately in Pika and verify teacher access to
  a private repository after the teacher accepts the collaborator invitation. Open
  the actual repository using the teacher account; a copied link alone is insufficient.
  Zero does not submit assignments or change grades.

- Upload the starting version on main. Choose New branch in the repository menu, cancel once
  and verify the branch/files are unchanged; then create a named branch. Make
  and run a small app improvement, Commit & push to that branch, cancel Finish
  once, then review/approve Finish. Confirm the completed SHA and files on remote
  main, return to main and optional local branch cleanup. The remote change branch
  remains. Simulation must not perform any branch/update/merge actions.
- In a disposable repository, test newer main changes. Expect Finish to pause
  after adding them to the change branch, then Run App and review Finish again.
  For a conflict, verify Source Control opens, files/merge state remain and the
  student can inspect/resolve/stage/commit before retrying. Record dirty-tree,
  failed-upload and diverged-main messages; no force push/reset should occur.

## Decision and receipt

Record each step as pass, fail or not tested, with useful errors, observed novice
feedback and follow-up owner. Attach tool versions and test scope without secrets.

Proceed to a limited cohort only when the target school machines build/run,
errors lead to repair, novices can change event and animation state, and unchanged
component reuse plus the caption enhancement work in both apps. For this candidate
tutorial cohort, require account/school preflight, verified template publication
and student-owned creation/clone, plus the authorized actual
sign-in/create/connect/cancel/upload/remote-inspection trial and teacher access to
pass too. Optional public hosting is not a lesson-completion requirement.

Hold adoption when a target OS or required sharing flow remains untested, setup
needs unresolved proxy workarounds, input or state is unreliable, or students
cannot explain their changes with reasonable teaching support. Resolve and repeat
the failed steps; do not replace physical/student evidence with mocked results.
Current source uses the [Zero Source-Available License](../LICENSE); previously granted MIT rights remain intact. Third-party notices
remain separate; ZeroHub/sample source uses MIT; public hub activation is pending.
