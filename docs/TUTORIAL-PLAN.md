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
| HealthBar / SegmentedHealthBar | Maintained sample library | Display supplied health/energy; compare alternatives, explicitly pin versions. |
| Countdown | Proposed ordinary Java helper | Try a timed quiz and game before promotion; explicit update(seconds), reset and reading remaining time. |
| Welcome/result panel | Proposed layout examples | First prove welcome→activity→result→restart in both projects; keep navigation rules in Main. |
| Player, Coin, Camera | Existing ordinary game examples | Keep game-specific behavior in examples; promote only a demonstrated reusable contract. |

A component should hide one useful presentation or data detail, not the student's
application rules. Native controls already cover many needs. Start small; create
objects once, update explicitly, and use separate instances in separate layouts.
Prefer a small API explained with one complete example and then reused in a second
context. Avoid mandatory inheritance and automatic discovery.

## Visual quick paths and composed views

Every lesson now starts with an authored target illustration, three actions and
one observable checkpoint. Detailed code/explanation remains below. Later lessons
start with one runnable stage; the whole study app or platformer is not advertised
as a short task. These are teaching illustrations, not runtime screenshots; no
novice completion times have been measured. Hosted quick paths stay visible before
folded detail, and SVG targets also work in local Markdown.

The new composed-study and composed-game examples reuse unchanged StartScreen and
Hud source. Hud contains ScoreDisplay. Main provides Runnable actions and explicitly
sets displayed values. The study example switches native views; the sketch keeps
its canvas and gates update with playing. Both prove start→activity→completion→
restart without introducing a component registry or core screen engine.

## Standard flow to grow toward

App: welcome → activity → result → restart. Game: menu → playing → paused or
won/lost → retry/menu. These are proposed teaching conventions, not engine-managed
scenes. Introduce plain methods/booleans first; an enum can replace multiple flags
when several states make it clearer. Actions belong to Main. Screen views own
controls; simulation objects own their own data. Rendering does not award points.

The original pair proves activity/completion/restart and playing/win/restart;
the composed variants add a Start screen. Pause/loss/menu return remain proposals.
A menu/pause extension should show exactly what stops updating and how input
returns to the canvas. An overlay needs a tested layout/input example before a
beginner convenience method. Do not use inherited show to hide a sketch while
expecting its timer or game rules to stop.

## Component creation and contribution

Lesson10 extracts an ordinary source component and reuses it across the pair. Lesson11 prepares an assigned ZeroHub library project, runs its editable preview, develops API/checks/two consumers, uploads the folder and reads automatic results. Passing versions are listed without routine maintainer acceptance; Pika links stay separate.

The Starter UI bundle groups StartScreen, Hud and ScoreDisplay. Main owns state/actions; callbacks connect views. Health-bar alternatives are another maintained bundle. Both live in `libraries/`, not core. See [package proof](STARTER-UI-PACKAGE.md).

An entire app remains a runnable consumer; reusable UI/model parts can become components. No event bus, mandatory inheritance or app-within-app engine. First policy permits self-contained JavaFX widgets with `Node view()` and no additional library dependencies. Package updates remain explicit and pinned. Automatically checked describes the disclosed checks, not all correctness or usefulness.
