# Teacher notes: Lessons 0–12

Use [three continuing projects](README.md): Greeting (0–2), Study (3–7), Game
(8–12). Students create each repository from its empty template, clone their own copy,
and write their own program. The small scaffold
contains only an empty Main and build/framework setup. Do not distribute completed
checkpoints as starters. Keep students' current code and add the next lesson's changes.

Use the visible target and Done check first; expand detailed steps as needed.
Illustrations are teaching drawings, not native-window screenshots. Pacing has
not been measured with novice students. Lesson 12's advanced extensions can span
several sessions or remain optional.

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
| 10 | The same student-authored ScoreDisplay source works in Study and Game; each app creates its own instance |
| 11 | A compatible setColor method works in both consumers; original sharing work includes API, examples and checks |
| 12 | Same game runs with drawing fallback; optional PNG/WAV work; optional scrolling keeps HUD fixed |

For optional platforms/levels/endings, check landing from above, underside/side
collisions, one jump per press, level transitions, banked score, frozen win/loss
and full Restart. These guided stages refer to maintained examples; only media
and scrolling have dedicated progressive checkpoints.

## Teach ownership

`setup()` creates the interface once. Handlers change state. Methods name actions.
Main explicitly calls ordinary objects' methods. Introduce Counter in lesson 6,
then Question objects and array indexes in lesson 7. Rendering never awards points.
ScoreDisplay presents app-owned state; a JavaFX node has one parent, so create
separate instances in Study and Game. SketchApp calls Main's update/draw, and Main
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
app/game is the place for a reusable ZeroHub contribution. Tutorial GitHub uploads
and explicit optional Pages publishing are distinct from ZeroHub admission.
Pika submission is separate. General hosted library acceptance and game publication
remain pending; do not promise a live automatic listing from these lessons.

Supported targets are Apple Silicon Mac and Windows. Physical Windows, school
restrictions and novice classroom trials are still pending; Linux and Intel Macs
are unsupported. See the [pilot checklist](../../docs/CLASSROOM-PILOT.md).
Published kits retain their original local-practice behavior. The new candidate
requires initial tutorial template creation and clone; the three template
repositories still need verified publication and fresh student-account acceptance.
After cloning, Run works offline once dependencies are cached. Check GitHub/school
access before lesson0; use the real sign-in/identity/cancel/upload trial in the
pilot. No student ZIP bypass or completed checkpoint starter is provided.
