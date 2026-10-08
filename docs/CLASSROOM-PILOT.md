# Classroom pilot

Use one student machine and one novice student before cohort adoption. This is
a trial checklist, not completed evidence. Physical Windows/Linux, real native
GitHub sign-in/upload and school restrictions remain unverified; consult
[VERIFICATION.md](VERIFICATION.md) and [GETTING-STARTED.md](GETTING-STARTED.md).

## Record the environment

Record the date, kit/VSIX version, OS/version/architecture, VS Code version,
project JDK (`java -version` and `javac -version`), Java extension versions/editor
runtime, Git version, browser, and whether the optional profile was imported.
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
  Propose a caption constructor retaining the no-argument constructor; use
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
- Create a student-owned empty repository through Create Repository. Follow teacher
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
- Copy Repository Link; submit it separately in Pika and verify teacher access to
  a private repository. Zero does not submit assignments or change grades.

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
Original Zero code's public license is unresolved and must be decided before a
licensed public distribution is promised.
