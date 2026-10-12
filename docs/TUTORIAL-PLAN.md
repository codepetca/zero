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

## Next component workbench

Before extending the workbench, the owner selected an actual local Starter UI
package consumed unchanged in the two apps. See [the package proof](STARTER-UI-PACKAGE.md).
The three classes move together as one Maven artifact; consuming apps still own
their rules. This separately versioned prototype is not yet in the public catalog
or current health-bar Workshop.

The local trial proved build→check→export→independent admission for the current
health bars, including stale-evidence rejection and an edited-source rebuild.
Admission means checked, not accepted or published. An arbitrary StartScreen is
explicitly rejected by the current preview contract. Do not claim general authoring
until that contract changes and is independently reviewed.

The smallest proposed extension is a component project with:

- One ordinary class or a small set of composed classes; no Application subclass.
- Named preview examples for starting, updated and reset states, plus two complete consumers.
- A short API card: constructor/configuration, input methods and outgoing actions.
- A declared meaningful check entry point, source-bound report and contribution export.
- The existing maintainer-reviewed source PR and immutable versioned-library release.

Use familiar JavaFX vocabulary (Node/layout/button action). Inputs are methods;
outgoing actions are supplied callbacks. Add typed callbacks/interfaces only when
an example needs values, and teach them after the basic source reuse lesson.
An entire app is a runnable consumer; its reusable screen/UI/model parts can be
components. No automatic event bus, dependency injection or app-within-app system.
Preserve pinned dependencies and source-bound checks. Trusted local preview has
normal process permissions; remote submissions retain their existing CI boundary.
Generic check execution needs a specific trust/verification design, not arbitrary
contributor commands in the installed IDE. This next workbench is planned, not built.
