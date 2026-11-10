# Teacher notes: Zero tutorials

The main path starts with recovery (lesson 0), then has three projects: Greeting (lessons 1–3), Coin (4–5), and Pet (6–9). Students create their own repositories, clone them, and write and explain their own code. Keep each continuing project for its lessons. Illustrations are teaching drawings, not native-window screenshots; pacing has not been measured with novice students.

**Lesson availability:** the Git exercises use a Zero build with separate
**Commit** and **Sync** controls. Check the editor build, lesson text and asset
download before assigning the exercises. Students create and clone their own
repositories.

## Before starting

Recovery can be practised without a project or account. Before creating a tutorial project, complete [account and privacy setup](https://zero.codepet.ca/docs/setup#before-lesson-0-github-and-privacy). Confirm school approval, account eligibility, and username, email and display-name policies. Students use their own verified GitHub accounts and keep passwords private. Check GitHub access, email verification, Zero sign-in, Git 2.31+ and pinned compiler/dependency downloads on the school device and network.

Repositories created through Zero are public, including source and included files. Obtain school approval before creation, and keep private material, passwords, tokens and recovery codes out of source, logs and pilot evidence. For an existing or GitHub-created private repository, invite the teacher by verified GitHub username and confirm access; personal-repository collaborators have write access, not view-only access. Use a school-approved per-repository Git name and email. If using a GitHub noreply address, copy the exact address from GitHub Settings → Emails; do not guess it. Zero sign-in does not configure Git identity.

Students start Greeting, Coin and Pet with **Project → New** and follow each
lesson’s starting-code instructions in their own clone. After cloning and
caching dependencies, local Run works offline. Sync, Merge and publishing
require a connection.

## Main path and checkpoints

| Lessons | Expected result |
| --- | --- |
| 0 Recovery | Students reopen the sidebar, Project Explorer, Start Page and tutorial reader using the Command Palette. |
| 1–3 Greeting | A label, button and name field work; another name changes the greeting. |
| 4–5 Coin | Held arrows move the player within the edges; each coin scores once; all three win and Restart restores the game. |
| 6–9 Pet | The bird displays, flaps, moves and chimes; extracting `Pet` preserves its behavior. A welcome screen has Start and Back. |

In the project lessons, have students save and run at each checkpoint, explain one change, and investigate a compiler error. For games, click the canvas before using keys. Compare the Pet's behavior before and after extracting its class: Main handles input and sound, while the pet owns its position and animation and is updated once per frame. Reference checkpoints are for comparison after trying the work, not completed starters.

## Optional paths

- **Coin game revisited, 10–11:** continue the Coin project. Check PlayerInput extraction against movement, opposing keys, edges, focus loss and Restart. Lesson 11's copied CreditsBadge belongs only in the labelled Tutorial practice area from the Coin repository. Local extraction and checks can continue when hosted acceptance is paused; do not promise a listing. An original contribution proposal is optional.
- **Coin artwork and sound, 12:** use the supplied assets as an open-ended challenge, drawing on the Pet lessons. Check scoring, Restart, browser behavior and an understandable experience without sound.

## Save, share and recover

- **Greeting and Coin:** review the changed files, run the project and choose
  **Commit** with a message that describes the checkpoint. Choose **Sync** and
  verify that GitHub **main** shows the commit.
- **Pet, lesson 7:** commit and sync a working **main** with the two assets.
  **Lesson 8:** choose **New branch…** from the branch name menu and confirm
  that `pet-refactor` is selected. Keep the backwards-movement experiment as
  the only uncommitted edit. On Mac, practise **Discard All Changes…** from
  **Files**. On Windows or when the control is unavailable, restore the one
  changed line and save. Run again before starting the refactor.
- **Pet, lessons 8–9:** commit the tested refactor, then commit the welcome
  screen. The first **Sync** on `pet-refactor` creates the branch on GitHub.
  Verify its commit there, then choose **Merge** and confirm the target is
  **main**. Run the merged game and check GitHub **main**. The feature branch
  stays available. If newer changes or conflicts appear, help the student
  preserve and resolve their work, run again and retry the merge.

The Pet recovery exercise is guarded: first verify merged main on GitHub has all source and assets, and verify the published app when available. Check for uncommitted, untracked, unpushed and ignored files; save anything needed separately and verify the backup opens. Only then close the project and move its folder to Trash without emptying it. Clone the student's own repository into a different empty location and run it. If the clone or test fails, restore the original or backup without overwriting either copy. GitHub cannot restore files that were never uploaded; automatic Trash emptying is a risk. Keep source and finished web output, since future rebuilding may depend on tools and dependency hosts.

Publishing is a separate action. Stop the app, verify the intended version on
GitHub **main**, then use **Publish & open app** (older Zero versions may say **Publish app**). Review the account, repository, visibility and Pages prompts, wait for success, and test the public link. Publish only with school approval and appropriate account access; the app and included assets are public. Pages availability for private repositories depends on account plan. Do not require payment or a visibility change; provide an alternative if a school account cannot publish. Pika submission of the repository link is separate from hosting and ZeroHub acceptance.

## Common fixes and evidence

- Open the existing project for its next lesson; do not start a new one midway.
- Keep one `Main.java` in `java`; create requested classes beside it. Put Pet resources under `resources/pet/` with the exact filenames in lesson 6.
- Save and run the active project again after edits. Click the canvas for game keys; check device audio and the browser gesture requirement for sound.
- Trace the answer or collection guard if points repeat. Check spelling and capitalization if assets fail to load.

Maintainer reference programs are in `teaching/checkpoints/` outside the tutorial scaffolds; use them to diagnose, not as student starting code. `node scripts/verify-project-progression.mjs` runs the existing finite progression checks. Supported targets are Apple Silicon Mac and Windows; physical Windows, school restrictions and novice classroom trials remain separate acceptance work. See the [pilot checklist](../../docs/CLASSROOM-PILOT.md). Local curriculum and checks do not establish a published template, released editor, live Pages site or completed student-account trial.
