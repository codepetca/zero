# Build with Zero: Lessons 0–12

Start with the target illustration and three steps at the top of a lesson.
Open the code and explanation when you need them. Lessons 7–12 begin with a
first checkpoint; the remaining stages build toward the larger result.
Illustrations are drawings, not screenshots; native controls vary by platform.

| Lesson | Build |
| --- | --- |
| [0](00-hello-world.md) | Hello, world! |
| [1](01-hello-button.md) | Greeting button |
| [2](02-hello-name.md) | Name input |
| [3](03-quiz.md) | Tiny quiz |
| [4](04-counter.md) | Click counter |
| [5](05-methods.md) | Reset and methods |
| [6](06-objects.md) | Counter object |
| [7](07-study-app.md) | Full app: study quiz |
| [8](08-movement.md) | Movement and keys |
| [9](09-coin-game.md) | Full game: collect coins |
| [10](10-components.md) | Extract and reuse a component |
| [11](11-zerohub.md) | Share with ZeroHub |
| [12](12-media.md) | Larger game: sprites, scrolling, platforms, levels and endings |

## Before each lesson

Complete [setup](../README.md#first-setup). Local running needs no GitHub account.

1. Stop. Back up Main and helper classes **outside `src/`**. Include any
   component improvements, such as your edited ScoreDisplay. Keep that backup
   before replacing or removing source; the example shelf is unchanged.
2. After backing up, remove the previous example's Main and unlisted helper Java
   files. Old helpers can require a different Player/Coin API. Copy only the listed
   files into `src/main/java/`. Keep `src/main/java/zero/`, the wrappers,
   `pom.xml`, `zero.json` and `.vscode/` build settings. Keep resources unless the
   stage tells you to replace them. Use one Main at a time. When a lesson asks
   you to reuse an improved component, retain that exact saved source rather
   than replacing it with the unchanged example.
3. **Run App**. After editing: **Save → Stop → Run App**.

Click the canvas before using game keys. A running window does not reload edits.

## Keep a small record

Try the stated checks. Save your change and its actual result.
See [teacher notes](TEACHER.md) and the [API](../API.md) when needed.

Coursework links go separately to [Pika](../README.md#your-repository-and-pika).
ZeroHub library sharings use Lesson 11.
For controls in games and reusable views, read [UI and app/game flow](../UI.md).
