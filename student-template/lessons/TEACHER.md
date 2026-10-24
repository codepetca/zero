# Teacher notes: Lessons 0–12

Use [three continuing projects](README.md): Greeting (0–2), Study (3–7), Game
(8–12). Students create each repository from its empty template, clone their own copy,
and write their own program. The small scaffold
contains only an empty Main and build/framework setup. Do not distribute completed
checkpoints as starters. Keep students' current code and add the next lesson's changes.

Use the visible target and numbered editing/testing steps. Full instructions
and code stay visible; Compare your code references are optional.
Illustrations are teaching drawings, not native-window screenshots. Pacing has
not been measured with novice students. The intermediate refactoring work is in lessons 10–11. Keep the same three
projects; new complete games are not required. Lesson 12's media/scrolling
extensions can remain optional.

## Before lesson 0

Complete [the account and privacy setup](https://zero.codepet.ca/docs/setup#before-lesson-0-github-and-privacy)
before student lesson work. Confirm school approval, account eligibility and its
username/email/display-name policy. Each student creates and verifies their own
GitHub account if needed and keeps their password private. On the school device/network, verify GitHub access, email
verification, native VS Code sign-in, Git 2.31+ and pinned compiler/dependency downloads.

Confirm that public source is allowed before students create through Zero; those
repositories and included files are public. Keep private material out. For an
existing or GitHub-created private repository, invite the teacher by verified
GitHub username, have them accept, then check actual access.
Collaborators on personal repositories have write access, not a view-only role.
Use per-repository Git identity with a school-approved display name and email;
for privacy, copy the exact GitHub-provided noreply address from Settings → Emails.
Do not guess it. Keep passwords, tokens and recovery codes out of source, logs and
pilot evidence; native sign-in does not configure commit identity.

A local starter smoke can check setup without Git; it is not the tutorial start.
The candidate's lesson flow requires the student's own template repository and
clone before lesson 0. Run App opens a local app window; browser export is a separate build. After cloning and caching
the compiler/dependencies, Run works offline without an active GitHub session.

## Check each step

| Lesson | Expected result |
| --- | --- |
| 0 | A student-authored label shows the greeting; edits appear after rerunning |
| 1 | The new button changes the existing label |
| 2 | Stew gives Hello, Stew!; another name changes the next greeting |
| 3 | 5 gives Correct!; wrong/blank gives Try again.; retry remains enabled |
| 4 | Each Check increments Attempts, including wrong answers |
| 5 | Reset clears answer, feedback and attempts; Check works again |
| 6 | Counter owns attempts; reset works; separate Counter objects stay independent |
| 7 | Wrong/retry, correct, Next, completion and Restart work; each question scores once |
| 8 | Held arrows move the player; edges keep the entire square inside |
| 9 | Each coin scores once; all three win; Restart restores player, coins and score |
| 10 | PlayerInput extraction preserves arrow movement/cancellation/reset; the same ScoreDisplay source works in Study and Game |
| 11 | A compatible setCaption method works in both consumers; optional WASD preserves arrows; CreditsBadge is checked and prepared for Tutorial practice; copied input helpers are not submitted |
| 12 | Same game runs with drawing fallback; optional PNG/WAV work; optional scrolling keeps HUD fixed |

For refactoring, compare behavior before and after: arrows, diagonal movement,
opposing keys, canvas edges, one-time scoring, focus loss and Restart. Main keeps
one explicit update owner. PlayerInput reads current key state when Main asks;
it does not move Player, save scores or start a timer. Optional WASD changes the
bindings deliberately; holding an arrow and its matching letter must not double
the movement. Keep the existing diagonal-speed behavior during the extraction.

Ask students to identify one responsibility, extract it, run the same checks,
and explain the smaller Main. Lesson 11 uses a harmless CreditsBadge for the
sharing exercise. Copies are expected and labelled Tutorial practice, excluded
from the ordinary catalogue. Keep the fixed `tutorial-credits-badge` name, use the
Coin repository, and assess extraction/check/README/review/use rather than novelty.
Local work can finish while hosted publication is paused; do not promise a listing.
The original-component/core proposal remains an optional extension, not a required
fourth project or public post. Proven ideas are never promoted automatically.

## Teach ownership

`setup()` creates the interface once. Handlers change state. Methods name actions.
Main explicitly calls ordinary objects' methods. Introduce Counter in lesson 6,
then Question objects and array indexes in lesson 7. Rendering never awards points.
ScoreDisplay presents app-owned state; a Zero Element has one parent, so create
separate instances in Study and Game. GameApp calls Main's update/draw, and Main
explicitly updates/draws Player and Coin. Compare world and screen coordinates
before optional camera, gravity and level work.

## Common fixes

- Wrong starting point: open the group's existing folder; do not start a new one midway.
- Duplicate Main: keep one Main in `src/main/java`; references belong outside compiled source.
- Missing class: create the class requested by that lesson, check filename and constructor.
- Old result: click Run App again in the active project.
- Keys inactive: click the canvas.
- Repeated points: trace the answered/collected guard.

Maintainer-only completed programs live in `teaching/checkpoints/` in the source
repository, outside every downloadable practice scaffold. Use them to diagnose
steps, not as student starting code. Run `node scripts/verify-project-progression.mjs`
for finite checkpoint checks. Ask students to trace a changed value, demonstrate
a normal and repeat/reset check, and explain their source.

## Sharing and readiness

All three tutorial projects use the student's own GitHub repositories. Teach the
same New branch, edit/Run, Upload and Finish flow in each group; check the actual
remote commit rather than only a copied link. An optional fourth **original**
app/game is the place for an original reusable ZeroHub contribution. The copied
CreditsBadge is the narrow exception: share it only in Tutorial practice from the
Coin repository when hosted acceptance is enabled. Maintainers can preview and
withdraw practice listings using the documented cleanup command; this removes
discovery entries, not source or artifacts. Tutorial GitHub uploads
and explicit optional Pages publishing are distinct from ZeroHub admission.
Pika submission is separate from optional public game hosting. Pages availability
for private repositories depends on the account plan; do not require payment or a
visibility change to complete a lesson. Only publish work approved for public
viewing. General hosted library acceptance and game publication remain pending;
do not promise a live automatic listing from these lessons.

Supported targets are Apple Silicon Mac and Windows. Physical Windows, school
restrictions and novice classroom trials are still pending; Linux and Intel Macs
are unsupported. See the [pilot checklist](../../docs/CLASSROOM-PILOT.md).
Published kits retain their original local-practice behavior. The new candidate
requires initial tutorial template creation and clone; the three template
repositories still need verified publication and fresh student-account acceptance.
These are release gates, not completed novice/account trials. Use the real
sign-in/identity/cancel/upload trial in the pilot only with explicit authorization.
No student ZIP bypass or completed checkpoint starter is provided.
