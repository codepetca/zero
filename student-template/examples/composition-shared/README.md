# Two ordinary shared views

StartScreen and Hud are readable Java source components, reused unchanged by
[the composed study app](../composed-study/README.md) and
[the composed coin game](../composed-game/README.md). Follow either consumer's
complete copy list. These examples require no new library or framework API.

| Class | Constructor | Public methods |
| --- | --- | --- |
| StartScreen | `StartScreen(String title, String instructions, Runnable onStart)` | `view()` |
| Hud | `Hud(Runnable onRestart)` | `view()`, `setScore(int)`, `setMessage(String)` |

The constructors create controls once. `view()` returns the same JavaFX node
each time. Labels wrap longer instructions and feedback. Hud contains the
existing canonical `examples/shared/ScoreDisplay.java` unchanged; it forwards
explicit score updates and owns a Restart button. Main owns the numbers, rules
and state. Neither view extends SimpleApp or GameApp.

`Runnable` is an optional next Java topic. It represents a supplied action with
no arguments and no result. `() -> restart()` supplies the same sort of button
action already used in `event -> restart()`. The shared button calls
`onRestart.run()`; Main's restart method decides what happens. There is no
automatic wiring, registration, screen engine or required component base class.

Each application creates its own StartScreen, Hud and ScoreDisplay instances.
A JavaFX node has one parent, so do not put one component instance into two
layouts at the same time. Reuse the source, then create separate objects.
The game keeps its canvas in the centre and puts StartScreen beside it; the
study app replaces its native content with `show(...)`. Both explicitly update
Hud after changing their own state.

Try a long title, instruction and Hud message in both consumers. To experiment
with a component's presentation, save your edited source outside `src/` before
switching examples, then deliberately use that same edited class in both apps.
Do not overwrite your work by blindly recopying the canonical file. This is
source-copy teaching and local dogfooding, not a published Community package.
