# Teacher notes: Zero tutorials

The main path starts with recovery (lesson 1), then has four projects: Greeting (lessons 2–4), Coin (5–6), Pet (7), and an original project (8). Students create their own repositories, clone them, and write and explain their own code. Keep each continuing project for its lessons. Illustrations are teaching drawings, not native-window screenshots; pacing has not been measured with novice students.

**Lesson availability:** the Pet and original-project templates have been published
and verified. The updated lessons and Pet asset download require a separate website
and app rollout. Check that the lesson and assets are available to students before
assigning lesson 7 or 8. Students create and clone their own repositories, not
Zero’s shared template repositories.

## Before starting

Recovery can be practised without a project or account. Before creating a tutorial project, complete [account and privacy setup](https://zero.codepet.ca/docs/setup#before-lesson-0-github-and-privacy). Confirm school approval, account eligibility, and username, email and display-name policies. Students use their own verified GitHub accounts and keep passwords private. Check GitHub access, email verification, Zero sign-in, Git 2.31+ and pinned compiler/dependency downloads on the school device and network.

Repositories created through Zero are public, including source and included files. Obtain school approval before creation, and keep private material, passwords, tokens and recovery codes out of source, logs and pilot evidence. For an existing or GitHub-created private repository, invite the teacher by verified GitHub username and confirm access; personal-repository collaborators have write access, not view-only access. Use a school-approved per-repository Git name and email. If using a GitHub noreply address, copy the exact address from GitHub Settings → Emails; do not guess it. Zero sign-in does not configure Git identity.

Greeting, Coin and Pet use their matching verified tutorial templates; lesson 8 uses **Project → New** for an original project. A student creates their own repository from the matching template and clones that repository, never the shared template itself. A local starter smoke is useful for setup but is not the tutorial start. After cloning and caching dependencies, local Run works offline; GitHub operations and publishing require a connection.

## Main path and checkpoints

| Lessons | Expected result |
| --- | --- |
| 1 Recovery | Students reopen the sidebar, Project Explorer, Start Page and tutorial reader using the Command Palette. |
| 2–4 Greeting | A label, button and name field work; another name changes the greeting. |
| 5–6 Coin | Held arrows move the player within the edges; each coin scores once; all three win and Restart restores the game. |
| 7 Pet | The bird displays and flaps, arrows move it, Space plays a chime, and extracting `Pet` preserves that behavior. |
| 8 Own project | A personalized welcome screen has Start; the game scene appears, and Back restores the welcome screen. |

In the project lessons, have students save and run at each checkpoint, explain one change, and investigate a compiler error. For games, click the canvas before using keys. Compare the Pet's behavior before and after extracting its class: Main handles input and sound, while the pet owns its position and animation and is updated once per frame. Reference checkpoints are for comparison after trying the work, not completed starters.

## Optional paths

- **Components and practice sharing, 9–10:** continue the Coin project. Check PlayerInput extraction against movement, opposing keys, edges, focus loss and Restart. Lesson 10's copied CreditsBadge belongs only in the labelled Tutorial practice area from the Coin repository. Local extraction and checks can continue when hosted acceptance is paused; do not promise a listing. An original contribution proposal is optional.
- **Coin media, 11:** continue the existing Coin project after the component lessons. Drawing fallback should still work; media and scrolling are optional. Keep the HUD fixed when exploring scrolling.

## Save, share and recover

Make commits meaningful: ask students to review the files, run the project, write a message describing the change, and use **Commit & push**. Verify the actual repository and remote commit, not just a copied link. In Pet, first commit and push the working main version including both assets, then create `pet-refactor` with **New branch**. After the class extraction, run and check again, commit and push the branch, and use **Merge to main**. It merges and pushes main; it does not create a pull request. If newer main changes or conflicts appear, preserve the work, resolve them, run again, and retry as instructed by Zero.

The Pet recovery exercise is guarded: first verify merged main on GitHub has all source and assets, and verify the published app when available. Check for uncommitted, untracked, unpushed and ignored files; save anything needed separately and verify the backup opens. Only then close the project and move its folder to Trash without emptying it. Clone the student's own repository into a different empty location and run it. If the clone or test fails, restore the original or backup without overwriting either copy. GitHub cannot restore files that were never uploaded; automatic Trash emptying is a risk. Keep source and finished web output, since future rebuilding may depend on tools and dependency hosts.

Publishing is a separate, explicit action: stop the app, commit and push the intended main version, then use **Publish & open app** (older Zero versions may say **Publish app**). Review the account, repository, visibility and Pages prompts, wait for success, and test the public link. Publish only with school approval and appropriate account access; the app and included assets are public. Pages availability for private repositories depends on account plan. Do not require payment or a visibility change; provide an alternative if a school account cannot publish. Pika submission of the repository link is separate from hosting and ZeroHub acceptance.

## Common fixes and evidence

- Open the existing project for its next lesson; do not start a new one midway.
- Keep one `Main.java` in `src/main/java`; create requested classes beside it. Put Pet resources under `src/main/resources/pet/` with the exact filenames in lesson 7.
- Save and run the active project again after edits. Click the canvas for game keys; check device audio and the browser gesture requirement for sound.
- Trace the answer or collection guard if points repeat. Check spelling and capitalization if assets fail to load.

Maintainer reference programs are in `teaching/checkpoints/` outside the tutorial scaffolds; use them to diagnose, not as student starting code. `node scripts/verify-project-progression.mjs` runs the existing finite progression checks. Supported targets are Apple Silicon Mac and Windows; physical Windows, school restrictions and novice classroom trials remain separate acceptance work. See the [pilot checklist](../../docs/CLASSROOM-PILOT.md). Local curriculum and checks do not establish a published template, released editor, live Pages site or completed student-account trial.
