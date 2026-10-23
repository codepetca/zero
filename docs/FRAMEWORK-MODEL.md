# Framework model: Zero as the student API

Owner direction,2026-10-23: keep App and GameApp, remove GameScreen, and make
Screens optional UI views. This is the proposed class model supporting the
[canonical architecture plan](FRAMEWORK-ARCHITECTURE.md), not an implemented API
reference. It supersedes the previous GameScreen design and default direct-JavaFX
teaching recommendation. Exact signatures must pass exemplar/browser gates before
adoption. Published artifacts and existing projects retain their current contracts.

## Student boundary

Normal games and apps should use ordinary Java plus `zero` and `zero.ui` almost
entirely. Zero provides common controls, layouts, drawing, input, assets and
lifecycle. JavaFX implements these capabilities underneath and remains an advanced
interoperability path. Students learn Java objects, inheritance, composition and
callbacks without needing JavaFX event/property types first.

This is a focused teaching facade, not a mirror of JavaFX. Only add a wrapper for
a demonstrated teaching use. Normal constructors, methods, callbacks, enums and
return values must not require JavaFX imports. Keep a tested advanced bridge for
existing JavaFX nodes, still subject to the exact browser profile. A Zero package
name alone does not prove portability: advertised default capabilities need
native, pinned WebFX and actual browser evidence.

## App and GameApp

Today App extends JavaFX Application and manages startup, window, content and
audio cleanup. GameApp already extends App and adds canvas/input/timer plus
`update(seconds)` and `draw()`. Current `show(Node)` does not stop the timer;
that behavior still needs an explicit migration.

The simpler target retains those two starting points:

| Type | Target responsibility | Student use |
| --- | --- | --- |
| App | Window, shared assets, UI navigation and final cleanup | Event-driven quiz, form, dashboard or other UI app |
| GameApp extends App | Adds one gameplay view, canvas, input, camera and one update/draw loop | Game, drawing or animated simulation, with the same UI facilities |
| Screen | Optional event-driven UI view with enter/leave/disposal hooks | Title, quiz, results, settings or menu |
| World | Optional default container of actors | Level membership and readable update/draw iteration |
| Actor | Position, movement, optional appearance and student behavior | Player, enemy, coin or other game object |

A game is an App because GameApp inherits App. Students create one Main extending
one of them, not a separate App object beside their GameApp. A UI-only App has no
game timer. An animated app can extend GameApp even when it is not a game.
GameApp itself owns gameplay; there is no public GameScreen or replacement public
game-view base class. Its private canvas/layout implementation stays internal.

Main is the single student-facing place for game `update` and `draw`. It calls
its objects directly at first, then delegates to a World or an ordinary game/level
controller as useful. Changing levels selects different content/state; it does
not require another screen subclass or another loop. A first game needs neither
Screen nor World.

## Inheritance, separately from ownership

Only indentation in this first diagram means inheritance. Student names are
examples, not framework classes.

```text
javafx.application.Application                 platform boundary, current base
└── zero.App                                  UI and common host
    ├── zero.GameApp                          gameplay capabilities
    │   └── student's Main                    game or animated app
    └── student's Main                        event-driven app

zero.Screen                                   optional UI views
├── student's TitleScreen
├── student's QuizScreen
└── student's ResultsScreen

zero.Actor
├── student's Player
├── student's Enemy
└── student's Coin / Projectile

zero.ui.Element                               narrow Zero UI abstraction
├── zero.ui.Button / Label / TextField         initial controls
├── zero.ui.Row / Column / Border              initial layouts
└── zero.ui.Stack / ProgressBar / Slider       later candidates, proof needed
```

World, Camera, assets, input and animation are separate objects used by the app,
not subclasses of App/GameApp. The JavaFX Application base remains an advanced
implementation boundary; inherited platform methods do not automatically join
the supported browser API. The small launch template can avoid JavaFX imports.

This second diagram means contains/uses, never extends:

```text
App
├── Assets                              shared resources
└── optional active UI Screen           UI navigation

GameApp (inherits those App facilities)
├── one internal frame driver           calls Main update/draw
├── Canvas + Input + Camera             one gameplay view
├── optional HUD/control-panel Elements UI alongside gameplay
└── selected game content               explicit calls in Main callbacks
    └── World or alternative container/controller
        └── Actor objects
            ├── independent AnimationPlayback
            └── Health / Steering / Inventory / other ordinary Java objects
```

## Navigation, pause and lifetime

Use one UI-thread transition path for Zero elements, Screens and bridged JavaFX
nodes. Showing a UI view replaces the current view; GameApp then suspends gameplay
updates, drawing and gameplay input. Returning to its gameplay view (illustrative
name `showGame()`) restores the retained game, clears input and resets elapsed
time. It respects a separate explicit pause state; navigation does not silently
unpause a manually paused game. No accumulated time or stale presses replay.

Transitions requested during a frame commit after that frame. Between callbacks,
including when gameplay is suspended or in a UI-only App, transitions commit on
the UI thread without waiting for a game frame. UI ready means setup/view
activation succeeded. Gameplay readiness can additionally require its first
successful frame. A suspended game or idle UI is not a watchdog failure.

HUDs and control panels are composed alongside/over the gameplay canvas through
a separate UI-placement operation (illustrative name `overlay(Element)`). Adding
one does not navigate away or suspend gameplay. An editable control retains normal
text input; gameplay keys belong to the focused canvas. Blur clears held and
edge input, and pause-on-blur follows the documented app policy. A Pause operation
stops simulation and actor animation while canvas drawing and UI may continue.

App owns screen navigation, app assets and final shutdown. A Screen owns its UI
listeners/controller state, deactivates them on leave and releases owned resources
only when discarded. Constructors do not register globally. GameApp/Main owns
retained game state across menus, independently of the UI Screen's lifetime.
Restart explicitly discards/rebuilds the selected game state, releases its owned
resources and resets camera/input/time; it does not recreate the application or
close borrowed app assets. Game music pause/resume on navigation is an explicit
game-owned policy; UI widgets must not close shared audio. Final App cleanup
releases remaining owned audio even after an error.

Only GameApp's internal driver schedules frames. No Actor, World, animation,
controller or Screen starts a second timer. A container never updates an object
that Main also updates independently. No field scanning or automatic registration.

## Replaceable parts and complete bounded type map

| Package/type | Relationship and role | Status |
| --- | --- | --- |
| `zero.App`, `zero.GameApp` | Inheritance above; GameApp owns the only game loop | Exist, with unreleased show(Element)/controls(Element); navigation remains proposed |
| `zero.Screen` | Optional UI lifecycle; no update/draw loop | Proposed |
| `zero.WorldContent` | Small update/drawing contract; GameApp's world-drawing boundary accepts it | Proposed; exact signatures demonstrated first |
| `zero.World` | Default WorldContent implementation with ordered Actor membership | Proposed; alternative containers implement the same contract |
| `zero.Actor` | Subclass behavior; composes playback/helpers/model objects | Unreleased prototype; future sequencing differs |
| `zero.Camera` | GameApp owns the gameplay camera; world drawing and inverse input mapping | Proposed; follow/smoothing can be student helpers |
| `zero.Canvas` | Focused drawing facade; GameApp exposes drawing conveniences through it | Proposed; no GraphicsContext required on normal path |
| `zero.Input`, `zero.Key`, `zero.MouseButton` | Gameplay-view input and Zero enums | Proposed; existing input uses JavaFX enums |
| `zero.Color`, `zero.Image` | Small Zero values/asset handle wrapping platform equivalents | Color has an unreleased first palette/rgb facade; Image remains proposed |
| `zero.Assets` | App owns cache/lifetime; games, screens and components borrow handles | Proposed extraction; caching exists in App/GameApp |
| `zero.ImageRegion` | Shared immutable region using a Zero Image on target path | Exists with JavaFX Image; facade/migration needed |
| `zero.AnimationSource` | Creates fresh independent playback | Proposed public replacement contract |
| `zero.AnimationPlayback` | Advances mutable state and exposes current ImageRegion | Proposed public replacement contract |
| `zero.SpriteAnimation` | Default AnimationSource, private playback implementation | Exists with combined mutable state; migration needed |
| `zero.Sound`, `zero.Music` | Audio handles; borrowed/shared versus owned lifetime explicit | Exist; preserve tested browser gesture/audio limits |
| `zero.Collisions` | Stateless geometry utility; student owns collision response | Exists; additions need demonstrated uses |
| `zero.ui.Element` and listed UI types | Compose private JavaFX nodes; reusable components expose a Zero view | Unreleased Element/Label/Button/Column slice; remaining UI types proposed |
| Advanced JavaFX bridge | Foreign Node ↔ intentional Zero UI interoperability | Unreleased protected Element(Node), final fxNode() and retained App.show(Node); navigation lifetime contract proposed |
| Internal driver/platform adapters/diagnostics | Core infrastructure, no student base class/import | Existing pieces plus proposed integration |

GameApp's public world-drawing boundary must accept WorldContent, not only World.
For example, Main calls `content.update(seconds)` in its update callback and
`drawWorld(content)` in draw; the latter is an illustrative GameApp operation that
applies its camera, delegates drawing and restores the transform. No content is
automatically ticked by setting a field. Prove default and alternative containers
in this same consumer, changing only the selected implementation/adapter.
A replacement may use different internal structures without patching core.

The target Actor has a final public update entry and a protected behavior hook
(for example `onUpdate(seconds)`). It validates time, invokes student behavior,
then advances the selected playback once. World or handwritten Main calls it
once; drawing advances nothing. No required super call. Procedural actors need no
image. Existing prototype overrides need explicit migration. Shared animation
definitions create independent per-actor playback, allowing another implementation
through the same Actor boundary.

Default World owns each actor once, updates in insertion order, removes immediately
and admits additions at the next update. Removed pending actors must not reappear.
Replacement containers document/prove compatible semantics. Collision response,
scoring and level logic remain student Java. Helpers such as turnTowards, Health
or Inventory need no framework base class. UI replacements compose Elements and
ordinary values/callbacks. Interfaces arise only for demonstrated substitution.

## Learning progression and acceptance

Illustrative target app (not a current-release API):

```java
import zero.App;
import zero.ui.Button;
import zero.ui.Column;
import zero.ui.Label;

public class Main extends App {
    public void setup() {
        Label greeting = new Label("Hello!");
        Button change = new Button("Change");
        change.onClick(() -> greeting.setText("Hello, Java!"));
        show(new Column(greeting, change));
    }
}
```

The game progression is one Main extending GameApp → separate Actors → optional
World/container → optional UI Screens. Main keeps update/draw throughout. A larger
game extracts level-specific behavior/state to ordinary controllers and swaps
those, rather than inheriting a gameplay Screen. The same Zero controls and shared
UI/helper component must work in an App, a menu and a live game HUD/control panel.
Callbacks pass demonstrated Java values/Runnable, not JavaFX events/properties.

Implement the smallest example-proven API first: common App UI, GameApp drawing/
input, one optional Screen, default/alternative content and animation. Candidate
Stack/ProgressBar/Slider need their own native/accessibility/browser evidence.
Custom Element rendering/subclassing needs a demonstrated public contract; normal
component composition does not need private JavaFX peers. Keep existing public
Zero names and the tested advanced bridge; native-only interop gets explicit
compatibility diagnostics.

ZeroHub still shares exact-version ordinary Java source/resources from the
student's own repository. Prove managed local and pinned-library consumers, native
core-version support, replacement without core edits and the contribution-to-core
path. Keep credit, namespaces and accepted versions/pins immutable. Simplifying
navigation changes none of these goals or existing hosted checker/publication gates.

Run pinned real WebFX/browser acceptance for an event App, a game with title/
pause/results plus two level swaps, and a simulation with live controls. Include
resume/restart, alternative content/playback, independent clocks, input/camera
mapping, resources and error paths. The [reliability plan](FRAMEWORK-RELIABILITY.md)
adds per-signature and failure-injection proof; telemetry is supplementary.
Update source assembly, contracts/hashes, student API/guide and website coverage
with actual implementation. Existing releases do not silently acquire new APIs.

Project/framework versions are separate from editor updates. Follow the
[preservation policy](FRAMEWORK-ARCHITECTURE.md#project-versions-and-preservation):
project-owned framework source/build files, exact dependency records, optional
reversible upgrades and retained playable output. No central historical-kit
database/storage or old-API branches/shims. Full offline bundles are optional and
student-retained; normal future rebuilds depend on tools/artifact availability.
Project-owned browser tooling, safe launch and backup flows still need proof.
