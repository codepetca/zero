# App, game and component teaching plan

Owner selected the study quiz and coin game for this local pass. Installer trials
remain deferred. Preserve ordinary Java, native JavaFX terminology and explicit
object updates. No new core API, engine, component registry or publication here.

## First pass

Fix example switching so old helpers cannot break a new Main. Correct Hello-world
starter guidance and keep Restart visible in the complete study stage. Introduce
native game controls before arrays/win logic. Reuse the unchanged ScoreDisplay in
both SimpleApp and SketchApp, with complete copy lists and observable checks.
See [UI and flow](../student-template/UI.md). New sources remain unreleased; public
Mac0.5.7 and standalone0.5.3 bytes remain immutable.

## Component shortlist

| Component or tool | Current state | Role / next evidence |
| --- | --- | --- |
| Label, Button, TextField, VBox, HBox, BorderPane | Native JavaFX, available now | Default UI vocabulary; use directly before adding wrappers. |
| ScoreDisplay | Shared readable example, reused now | Show an app-owned number in a quiz and game; view/setScore convention. |
| HealthBar / SegmentedHealthBar | Experimental Community0.1.3 | Display supplied health/energy; compare alternatives, explicitly pin versions. |
| Countdown | Proposed ordinary Java helper | Try a timed quiz and game before promotion; explicit update(seconds), reset and reading remaining time. |
| Welcome/result panel | Proposed layout examples | First prove welcome→activity→result→restart in both projects; keep navigation rules in Main. |
| Player, Coin, Camera | Existing ordinary game examples | Keep game-specific behavior in examples; promote only a demonstrated reusable contract. |

A component should hide one useful presentation or data detail, not the student's
application rules. Native controls already cover many needs. Start small; create
objects once, update explicitly, and use separate instances in separate layouts.
Prefer a small API explained with one complete example and then reused in a second
context. Avoid mandatory inheritance and automatic discovery.

## Standard flow to grow toward

App: welcome → activity → result → restart. Game: menu → playing → paused or
won/lost → retry/menu. These are proposed teaching conventions, not engine-managed
scenes. Introduce plain methods/booleans first; an enum can replace multiple flags
when several states make it clearer. Actions belong to Main. Screen views own
controls; simulation objects own their own data. Rendering does not award points.

The current pair proves activity/completion/restart and playing/win/restart.
A menu/pause extension should show exactly what stops updating and how input
returns to the canvas. An overlay needs a tested layout/input example before a
beginner convenience method. Do not use inherited show to hide a sketch while
expecting its timer or game rules to stop.

## Component creation and contribution

Lesson10 creates an ordinary source component and reuses it across the pair.
The current Workshop previews/checks the two declared health bars; it is not yet a
general custom-component builder. Lesson11 must describe that limit accurately.
A later generic component workbench should create a source project with named
examples, concise API, behavior checks and metadata, then use the existing
maintainer-reviewed Community workflow. Keep student Pika submissions separate.
No arbitrary source is silently installed and no teacher becomes default reviewer.

Next acceptance should be based on two real consumers, clear ownership, independent
instances, reset/edge behavior, errors and a readable contribution example.
Package updates remain explicit and version-pinned. Core promotion remains a
maintainer decision after demonstrated usefulness.
