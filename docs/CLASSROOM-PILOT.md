# Classroom pilot

Use one student machine and one novice student before cohort adoption. This is
a trial checklist, not completed evidence. Physical Windows/Linux, real native
school restrictions and novice trials remain unverified. A Mac teacher trial
verified native GitHub sign-in and a private upload; consult
[VERIFICATION.md](VERIFICATION.md) and [GETTING-STARTED.md](GETTING-STARTED.md).

## Record the environment

Record the date, kit/VSIX version, OS/version/architecture, VS Code version,
project JDK (`java -version` and `javac -version`), Java extension versions/editor
runtime, Git version, browser, and whether the optional profile was imported.
Authenticated uploads require Git 2.31+; older Git must be rejected before
credential dispatch while local running remains available.
Record school proxy/firewall restrictions, download failures, setup time and
teacher interventions. Use the teacher's privacy, account and repository
visibility instructions; keep tokens, passwords and student personal information
out of the record.

## Build, edit and explain

- Extract the starter outside another Git repository. Follow its `README.md`;
  keep hidden project folders and run the first dependency download.
- Run the default quiz from the sidebar and standard build shortcut. Confirm a
  separate window, Stop, repeated rebuild/restart and saved edits. Check profile
  autosave and a dark theme if used; try the optional F6/F7 only if installed.
- Introduce one clear compile error. Open its source location from Problems,
  repair it and run again. Record whether a novice can use the error unaided.
- Try blank/wrong/correct quiz answers; confirm feedback, score and repeated-click
  behavior. Change the question or scoring rule and explain which code runs once
  and which runs on a click. Confirm normal text entry.
- Follow the starter's copy instructions for animation and keyboard examples.
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
- Create a student-owned empty repository through Connect a repo → Create a repository. Follow teacher
  visibility instructions; leave README, license and gitignore uninitialized.
  Connect its HTTPS URL from the standalone student folder and confirm the target.
- Configure the student's per-repository Git name/email under privacy instructions.
  Confirm simulation clearly says nothing was uploaded and makes no Git changes.
- Opt into live mode. Review destination, branch, files and commit message, then
  cancel once and verify no upload. Repeat with explicit approval to upload.
  If the session/account changes during review, expect a fresh review before retry.
- Confirm success against the actual remote branch/commit and inspect source files
  on GitHub. Record failures and whether a local commit remains. A copied link
  alone does not prove uploaded or current work.
- Click the connected repository name → Copy repository link; submit it separately in Pika and verify teacher access to
  a private repository. Zero does not submit assignments or change grades.

- Upload the starting version on main. Click main → Start a change, cancel once
  and verify the branch/files are unchanged; then create a named branch. Make
  and run a small app improvement, Upload changes to that branch, cancel Finish
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
component reuse plus the caption enhancement work in both apps. For a cohort
using uploads, require the authorized actual sign-in/create/connect/cancel/upload/
remote-inspection trial and teacher access to pass too.

Hold adoption when a target OS or required sharing flow remains untested, setup
needs unresolved proxy workarounds, input or state is unreliable, or students
cannot explain their changes with reasonable teaching support. Resolve and repeat
the failed steps; do not replace physical/student evidence with mocked results.
Original Zero code uses the [MIT license](../LICENSE). Third-party notices
remain separate; Zero Community artifact licensing is still unresolved.
