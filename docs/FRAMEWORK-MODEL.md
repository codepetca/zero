# Framework model: Zero as the student API

Owner clarification,2026-10-23. This is the proposed class model supporting the
[canonical architecture plan](FRAMEWORK-ARCHITECTURE.md), not an implemented API
reference. It supersedes the earlier recommendation that normal lessons directly
assemble JavaFX controls. Exact signatures must pass the exemplar/browser gates
before adoption. Existing JavaFX-based projects and published artifacts retain
their current contracts.

## Student boundary

Normal games and apps should use ordinary Java plus `zero` and `zero.ui` almost
entirely. Zero provides common controls, layouts, drawing, input, assets and
lifecycle. JavaFX implements these capabilities beneath Zero and remains an
advanced interoperability path. Students can learn Java objects, inheritance,
composition and callbacks without learning JavaFX event/property types first.

This is a focused teaching facade, not an attempt to mirror all JavaFX classes.
Only add a wrapper for a demonstrated teaching use. Public default constructors,
methods, callbacks, enums and return values must not require JavaFX imports.
Retain an explicit advanced bridge for existing JavaFX nodes; arbitrary JavaFX
calls remain subject to the exact browser profile. A Zero package name alone
does not prove portability. Every advertised default capability needs native,
pinned WebFX and actual browser evidence.

## App and GameApp

Today `App extends javafx.application.Application`; it manages startup, window,
content and audio cleanup. Students override `settings()` and `setup()` and
call `show(Node)`. `GameApp extends App`, creates a canvas, owns a timer/input
state, and calls `update(seconds)` followed by `draw()`. The current `show(Node)`
does not stop that timer. This current behavior is not a suitable final screen
transition contract.

Keep the public distinction, but make GameApp a thin convenience:

| Type | Target responsibility | Student use |
| --- | --- | --- |
| App | Common host: window, assets, screen selection, cleanup; no continuous game work when inactive | Quiz, form, dashboard, or a game assembled from screens |
| GameApp extends App | Installs one default GameScreen and delegates its canvas/input/update/draw conveniences | First drawing, simulation or single-screen game |
| Screen | One UI/navigation state and its activation/disposal lifecycle | Title, quiz, results, settings or control panel |
| GameScreen extends Screen | Adds a drawing surface, scoped game input, camera and frame callbacks | Playable level or simulation with controls/HUD |

App and GameApp describe startup convenience, not two isolated ecosystems. An
App can show a GameScreen. A GameApp can show an ordinary title/result Screen.
Both use the same UI components and assets. GameApp's default screen receives its
Main callbacks only while active; another GameScreen receives its own callbacks.
Switching back restores the retained default session unless Restart discards it.

One internal host frame driver schedules the active game screen. Neither World,
Actor, animation nor GameApp creates a second timer. An event-driven screen does
not receive game frames. Paused GameScreens may redraw/UI-update while simulation
updates stop. All overloads for showing Zero elements, Screens or bridged JavaFX
nodes must route through the same transition rules. Introducing this behavior
requires source/API migration checks; it is not already delivered.

## Complete bounded type map

Solid inheritance below is intentional. Owned/referenced objects are listed
separately so a World, UI component or camera is not mistaken for an Actor.
Student class names are examples, not framework classes.

```text
javafx.application.Application                 platform boundary, current base
└── zero.App                                  host
    ├── zero.GameApp                          optional default-game convenience
    │   └── student's Main                    small game
    └── student's Main                        event app or multi-screen app

zero.Screen
├── student's TitleScreen / QuizScreen / ResultsScreen
└── zero.GameScreen
    └── student's PlayScreen / SimulationScreen

zero.Actor
├── student's Player
├── student's Enemy
└── student's Coin / Projectile

zero.ui.Element                               narrow Zero UI abstraction
├── zero.ui.Button / Label / TextField         initial controls
├── zero.ui.Row / Column / Border              initial layouts
└── zero.ui.Stack / ProgressBar / Slider       later candidates, evidence needed
```

The existing Application base is an implementation/advanced boundary. Inherited
JavaFX methods are not automatically part of Zero's supported browser API. There
is no need to redesign Java's application launcher merely to hide this inheritance;
the normal launch template can stay small without JavaFX imports.

| Package/type | Relationship and role | Status |
| --- | --- | --- |
| `zero.App`, `zero.GameApp` | Inheritance as above; share host services | Exist; target ownership/facades need revision |
| `zero.Screen`, `zero.GameScreen` | Screen inheritance; internal host drives protected hooks | Proposed |
| `zero.WorldContent` | Small interface actually consumed by game screens/ordinary controllers | Proposed; exact drawing signature demonstrated first |
| `zero.World` | Default WorldContent implementation; owns ordered Actor membership | Proposed; alternative container implements the same contract |
| `zero.Actor` | Subclass behavior; composes playback and ordinary helper/model objects | Unreleased prototype exists; future sequencing differs |
| `zero.Camera` | GameScreen owns it; transform/inverse mapping, no Actor inheritance | Proposed |
| `zero.Canvas` | Focused drawing facade over native/browser rendering; GameApp delegates | Proposed; does not expose GraphicsContext on normal path |
| `zero.Input`, `zero.Key`, `zero.MouseButton` | Screen-scoped input facade and Zero enums | Proposed; existing input uses JavaFX enums |
| `zero.Color`, `zero.Image` | Small Zero values/asset handle wrapping platform equivalents | Proposed; existing drawing uses JavaFX types |
| `zero.Assets` | App owns cache/lifetime; screens/components borrow handles | Proposed extraction; caching currently lives in App/GameApp |
| `zero.ImageRegion` | Shared immutable region using a Zero Image on the target path | Exists with JavaFX Image; facade/migration needed |
| `zero.AnimationSource` | Factory for fresh independent playback | Proposed public replacement contract |
| `zero.AnimationPlayback` | Advances mutable state and exposes current ImageRegion | Proposed public replacement contract |
| `zero.SpriteAnimation` | Default AnimationSource; private playback implementation | Exists with combined mutable state; migration needed |
| `zero.Sound`, `zero.Music` | Independent audio handles, borrowed/shared versus owned lifetime explicit | Exist; preserve tested browser audio/gesture limits |
| `zero.Collisions` | Stateless geometry utility; game owns collision response | Exists; geometry additions need demonstrated uses |
| `zero.ui.Element` and listed controls/layouts | Compose private JavaFX nodes; not JavaFX control subclasses | Proposed, not replacements already available |
| Advanced JavaFX bridge | Adapts a foreign Node to an Element and exposes intentional interop | Capability proposed; name/signatures not frozen |
| Internal frame driver/platform adapters/diagnostics | Core infrastructure; no student subclass or required import | Existing pieces plus proposed integration |

Keep existing public `zero` names in place unless a documented version migration
requires otherwise. Do not move all assets into new packages for tidiness. A
student library keeps its existing derived `zero.contrib...` namespace, with no
special core privilege.

## Ownership and explicit updates

```text
App
├── Assets                          shared definitions and cached resources
├── active Screen                   at most one active navigation state
└── internal frame driver           schedules only active GameScreen

GameScreen
├── Element view                    layouts, controls and HUD
├── Canvas + Input + Camera         screen-scoped capabilities
└── selected WorldContent            explicit calls from its frame callbacks
    └── default World               or student alternative container
        └── Actor objects
            ├── independent AnimationPlayback
            └── Health / Steering / Inventory / other ordinary Java objects
```

App owns screen activation, removal and final shutdown. Constructors do not
register screens/actors globally. Showing a screen establishes host ownership;
the screen disposes its own controllers/listeners/session when discarded. Shared
asset handles remain app-owned. Retained inactive sessions are suspended, not
destroyed. The canonical lifetime rules also govern input reset, camera transform
restoration, pause and Restart.

A screen's `update(seconds)` calls its selected content's update explicitly;
its drawing callback calls content drawing under its camera and draws HUD in
screen space. The core does not silently traverse every field or update a world
that Main also updates. The same screen consumer must accept default World and
a student implementation without a downcast or gameplay rewrite.

The target Actor has one final public update entry and a protected behavior hook
(for example `onUpdate(seconds)`). The entry validates elapsed time, calls student
behavior and advances the selected playback once. World calls that entry once;
a small handwritten Main can call it directly. Students never need a super call
to retain animation. Actors can draw shapes without an image. Existing prototype
`update` overrides need explicit migration before adopting this contract.

Default World membership is single-owner and ordered. It applies removals
immediately and admits additions at the next update. A queued actor that is
removed before admission must not reappear. Replacement containers state and
prove compatible update/removal behavior. No automatic collision response.

Most extension code needs no interface: `Steering.turnTowards(actor, x, y, rate,
seconds)` or a Health object can be called normally. Interfaces appear where the
consumer must select alternatives. AnimationSource creates independent playback;
WorldContent selects an alternative container; UI components expose an Element
and ordinary values/callbacks. No universal Component, Entity, Node or event bus.

## Student-facing examples

Illustrative target code, not compilable against the current release:

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

`onClick` takes an ordinary Runnable. Value-change callbacks should pass only
the demonstrated Java value, not a JavaFX event/property. Layouts expose simple
spacing/alignment operations. Common appearance uses Zero values and methods;
JavaFX CSS/FXML are not assumed portable.

```java
import zero.Actor;
import zero.Image;

public class Player extends Actor {
    public Player(Image image) {
        super(image);
    }

    protected void onUpdate(double seconds) {
        moveForward(100, seconds);
    }
}
```

In a small GameApp, Main explicitly updates/draws Player. Later, Main delegates
the same jobs to World, then a PlayScreen. The learning progression changes where
ordinary method calls live; it does not require a different object model. Title
screens and health bars use the same `zero.ui` vocabulary as quizzes/control panels.

## Delivery constraints

Start with App/GameApp delegation, Screen/GameScreen, the existing three controls
and three layouts, and Zero values needed by those examples. Prove at least one
complete Zero-only-import app and game natively and through the pinned browser
pipeline. Treat Stack/ProgressBar/Slider as candidates until their actual Zero
implementation, accessibility and browser behavior pass; do not infer admission
from underlying JavaFX/WebFX availability.

Use composition for UI facade internals so the browser gate has a finite public
surface. Student-authored reusable controls may compose Elements; making Element
subclassable for custom rendering needs a demonstrated public rendering contract,
not access to a private JavaFX peer. Native-only JavaFX extensions remain possible
with explicit compatibility diagnostics.

Preserve a tested advanced bridge and existing App/GameApp examples during
migration. Update source assembly, exact semantic contracts, adapter hashes,
student API/guide, website reference and per-API evidence together. Published
releases and exact ZeroHub pins do not acquire changed inheritance/signatures
silently. The [reliability plan](FRAMEWORK-RELIABILITY.md) defines the automatic
checks needed before claiming this target model works.
