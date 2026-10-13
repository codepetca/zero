# Teacher notes: Lessons 0–12

Use [the lesson index](README.md). Lessons 0–6 are short steps. Lessons 7 and 9
are full tutorials; Lesson 12 builds a larger game in five stages. Spread their
stages across sessions as needed.
Use the visible target and Done check for a first pass, then open the detailed
steps as needed. The illustrations show intended source behavior; they are not
native-window screenshots. First checkpoints do not cover every later stage.
Pacing is a planning guide, not classroom-trial evidence.

## Check each step

| Lesson | Expected result |
| --- | --- |
| 0 | A changed greeting appears after rerunning |
| 1 | Click changes the existing label |
| 2 | Stew gives Hello, Stew!; a new name changes the next greeting |
| 3 | 5 gives Correct!; wrong/blank gives Try again.; retry remains enabled |
| 4 | +1 gives 1, 2, 3 |
| 5 | Two clicks, Reset, one click gives 2, 0, 1 |
| 6 | Same sequence; separate Counter objects keep independent values |
| 7 | Retry, correct answer, Next, completion and Restart work; each question scores once |
| 8 | Held arrows move the player; edges keep the whole square inside |
| 9 | Each coin scores once; collecting all wins; Restart restores player, coins and score |
| 10 | The same ScoreDisplay source works in study and coin game; each app owns an instance |
| 11 | A contribution has source, API, examples, checks and independent review |
| 12 | Assets work; camera scrolls with fixed HUD; jump/collisions work; two levels bank score; loss/win freeze and Restart resets everything |

## Teach ownership

`setup()` creates the interface once. Button handlers change state.
Read `event ->` as “when clicked”; full lambda syntax can wait.
Methods name actions. Ordinary objects own data; Main calls their methods.
A display presents app-owned state. SketchApp calls Main's update/draw; Main
explicitly updates and draws its Player/Coin objects.

In Lesson 12, compare world positions with camera-adjusted drawing. The unchanged
ScoreDisplay is a native node. Trace bounded simulation steps, gravity and collision response;
introduce Level's arrays before changing them. Contrast stage 4's current-level
reset with stage 5's lost state, then test Restart after both endings.

Introduce the study array and its indexes before Lesson 7's customization.
Later scored-quiz exercises use trimmed 42 and award 10 once; the tiny quiz
compares exactly with 5 and does not score. Both examples remain available.

## Common fixes

- Duplicate Main: open the fresh lesson project folder, which has one Main and only its matching helpers.
- Missing class: check the lesson's complete copy list.
- Old result: click Run App again in the active lesson project; Zero saves and restarts it.
- Keys inactive: click the canvas.
- Repeated points: check the answered/collected guard.
- Sharing a JavaFX node: create separate component instances for separate apps.

Ask students to trace one changed value and demonstrate a normal and repeat/reset
check. Assess working behavior, understandable code and recorded results.

## ZeroHub and readiness

Lesson 11 prepares an ordinary Java library, uploads its source and reads trusted automatic checks. Passing versions are listed automatically; there is no routine maintainer acceptance step.
ZeroHub checks self-contained JavaFX widgets and two consumers; hosted activation is pending. Pika
coursework submission stays separate. No credentials belong in evidence.

Complete installation on school machines before teaching. Physical Windows/Linux,
school restrictions and novice classroom trials remain unverified; see the
[classroom pilot](../../docs/CLASSROOM-PILOT.md). Published kits are immutable;
these local lessons enter a future approved release.
