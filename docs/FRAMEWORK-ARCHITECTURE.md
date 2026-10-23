# Framework architecture: learn, extend and contribute

Owner direction,2026-10-23. This is the canonical runtime/extension plan, alongside
[repository boundaries](ARCHITECTURE.md), [product goals](PRODUCT.md) and
[ZeroHub sharing](COMPONENTS.md). It incorporates the first Astra architecture
review and makes student-led framework evolution an acceptance requirement.
Contracts and names below are proposed, not implemented public APIs. The current
App/GameApp path remains available; Actor is an unreleased local prototype.
The later owner clarification makes Zero the normal student API, with JavaFX
available for advanced interoperability. The detailed
[class/ownership model](FRAMEWORK-MODEL.md) and
[automatic failure-detection plan](FRAMEWORK-RELIABILITY.md) are parts of this
architecture, not separate competing plans. They also remain proposed.

## Core outcome

Students learn Java by building useful games and apps, explaining their own
fields, methods, constructors, objects, inheritance, composition and collections.
They also learn to design reusable software: add a missing capability, replace
an existing approach, share understandable source on ZeroHub, improve it through
other people's use, and propose proven ideas for Zero itself.

**Build → extract → share → reuse → improve → propose for core.**

The default teaching path uses ordinary Java with Zero packages almost entirely,
JavaFX underneath, the pinned WebFX browser
toolchain and playable static GitHub Pages output from student-owned GitHub
repositories. Native Run is the fast iteration loop. Browser compatibility is
checked during development; real browser builds/behaviour are acceptance gates
for each new capability, not a discovery deferred until final Publish. Current
native Run does not check browser compatibility; saved-source background checks,
truthful runtime status and per-signature evidence are required future work.

Contributing and publishing need not happen in every introductory lesson. They
must remain achievable outcomes without learning another application language,
editing private engine internals, building a visual editor, or creating a second
student repository just to extract a library. Pika submission stays separate.

## One organizing model

Use a JavaFX-owned application with optional active screens and explicitly updated
game content. Arcade's stable Window/View/container structure is the organizing
reference. Greenfoot informs approachable Actor vocabulary; Godot informs focused
composition and independence from arbitrary surrounding objects. These are
architectural references, not new dependencies or a combined engine runtime.

| Owner | Responsibility | Extension boundary |
| --- | --- | --- |
| App | Window/root, app-scoped assets, active-screen lifecycle and final cleanup | Zero UI and app-owned controllers; advanced JavaFX bridge; no game types required |
| GameApp extends App | Thin default-GameScreen convenience for Main update/draw/input | Same host frame driver and screen contracts, never a second timer |
| Screen/controller | Enter/leave, navigation/session rules and Zero UI | Composes app-specific Java objects; ordinary apps need no game callbacks |
| GameScreen extends Screen | Drawing surface, game input, camera and frame callbacks | Explicit delegation to selected content implementations |
| World | Default ordered actor membership, exactly-once updates and world drawing | One optional content implementation; a screen can select a different ordinary Java container/controller |
| Actor | Local state, movement and optional appearance | Subclass behaviour, composed helpers and replaceable animation playback |
| Camera | World-to-canvas and inverse pointer mapping | Owned by the viewing screen; follow/smoothing behaviour can be ordinary helpers |
| UI/data components | Controls, HUDs, health, scores, inventories and other structures | Public constructors, setters, callbacks and small interfaces where alternatives share a contract |

A one-screen quiz stays an event-driven App with Zero Label/Button/TextField and
layouts. A first moving shape can stay in Main. A menu has no World. A scrolling
game can replace its level/world while retaining its UI. Neither a universal
Zero Node tree nor a required component base class is part of this plan. Use
Screen/controller terminology rather than a second competing JavaFX Scene type.

Calling `world.update(seconds)` is explicit Java delegation. The World's readable
loop encapsulates iteration; Main does not need one permanent call per enemy or
bullet. Teach the loop and arrays first, then introduce its reusable container.

## A small lifecycle spine, replaceable parts

Core owns frame sequencing, deterministic membership, input boundaries, resource
cleanup and useful validation errors. Final/private methods may protect those
invariants. They must not also seal the gameplay algorithms students need to
replace. Public contracts are the supported path; canonical helper fingerprints
and browser checks still protect their existing runtime boundary.

All replacement points have explicit ownership: who constructs/selects the part,
who updates it, who draws it, and who stops/disposes it. A component receives its
dependencies through constructors or calls. It neither discovers Main globally
nor registers itself merely because it was constructed. Student implementations
receive no trusted-helper exemption in the browser checker.

Do not create an interface for every class. Require one when a core consumer is
advertised as accepting interchangeable implementations, and demonstrate two real
implementations through it. A public interface is only a promise when a core
consumer actually accepts it. Otherwise use ordinary helpers/composition.

### Missing capabilities: helpers and behaviour

A student can implement `turnTowards` without replacing Actor or modifying core:
read its centre/rotation and use public rotation setters to turn at a bounded
degrees-per-second rate. `face` remains the instant-aim default; the helper can
provide gradual steering. Give useful public geometry/state operations rather
than requiring access to private fields or runtime globals.

Steering, patrols, damage rules, inventory and dialogue graphs can begin as ordinary
Java classes called from the owner's behaviour method. Students may subclass
Actor to express a Player/Enemy, but compose health/inventory/targeting objects
rather than building a deep inheritance hierarchy. If competing steering or
camera packages need the same consumer, define the smallest demonstrated typed
contract at that boundary, not a global behaviour registry or string event bus.

Acceptance: a second game imports the steering library and uses its gradual turn
without copying source into core, changing an adapter hash, or changing the
Actor's public fields. Invalid arguments, angle wrapping and speed/time semantics
must be explainable and tested on native and browser targets.

### Replacement: animation definition and playback

Actor must depend on a small public animation capability rather than accept only
one sealed concrete implementation. Keep shared immutable frame/image data
separate from mutable playback state. The logical minimum is a source/factory
that creates playback, and playback that advances by seconds and exposes its
current ImageRegion. Names/signatures below illustrate the proposed contract:

```java
public interface AnimationSource {
    AnimationPlayback createPlayback();
}

public interface AnimationPlayback {
    void update(double seconds);
    ImageRegion frame();
}
```

The core animation implementation and a student-written alternative both implement
this capability. Actor's public construction/setter boundary accepts the contract;
sharing an AnimationSource creates independent playback for each actor. A source
must return fresh mutable playback, and conformance checks must detect accidental
clock reuse. Resource images/immutable frame definitions can remain shared.
This separation is a plan, not existing methods on SpriteAnimation or Actor.

One actor-owned update entry point validates elapsed time, calls the overridable
behaviour hook, then advances the current playback once. World or the introductory
Main calls that entry point once; drawing observes the current frame and advances
nothing. A subclass must not need `super.update()` to keep animation alive. The
core owns sequencing; the student owns the playback algorithm, rate, frame
selection and transitions. Invalid or missing frames should produce a useful
component error, not a mysterious renderer failure.

The replacement proof must include a non-looping or state-based alternative,
two actors sharing frame data with independent clocks, image/animation swaps,
pause/restart and disposal. Editing the body of the fingerprinted SpriteAnimation
helper is not the extension route. Determine how the current SpriteAnimation
becomes a compatible default without claiming existing releases already support
the new contracts.

### Replacement: world structures and content

The default World is a convenience, not the one legal structure for a game.
An active screen must be able to delegate update and world drawing to a student
controller/container using a small public content contract or an explicit
ordinary-Java adapter. A core screen must not require downcasts to the default
World or depend on its private collection implementation. Choose exact drawing
capabilities through the examples; current `draw(GameApp)` is not automatically
the ideal permanent boundary. Do not create a large renderer abstraction first.

Prove the boundary by selecting a default actor World and a student-authored
alternative container in the same screen consumer. A spatial lookup structure,
spawn controller or level model may remain a composed helper without replacing
World. Alternative implementations document their update/removal semantics; they
do not override the host's screen/input/resource lifetime. A library advertising
drop-in replacement must let the consumer change only its selected implementation
or adapter, not rewrite application logic or patch core.

### UI and events

Zero supplies the default controls/layouts using JavaFX internally. A reusable
component may expose a Zero Element view and ordinary value setters/callbacks;
nonvisual components need no view. Existing components currently expose JavaFX
`Node view()`; a tested advanced bridge and explicit migration preserve reuse.
Do not subclass every JavaFX control or mirror its entire property/event API.
UI and model
do not require Actor inheritance. A score/health model owns rules; the display
receives values or typed notifications. Direct method calls are the first lesson;
callbacks/listeners are useful when a reusable component must report an event
without knowing its containing screen. No global event bus is required.

Select interchangeable HUD/display implementations through a small demonstrated
public view/value contract when needed. A fixed player HUD stays in screen space.
An enemy health bar initially draws at a world offset and stays upright; it need
not inherit the enemy's rotation or create a JavaFX widget per enemy.

The current student browser contract includes specific Button/Label/TextField
and BorderPane/HBox/VBox signatures. ProgressBar, Slider and StackPane are not
currently admitted; the existing native ProgressBar health bar is not a portable
component proof. Underlying WebFX support and admission to Zero are distinct.
Zero facade controls/layouts require their own exact contract and real browser
behaviour checks before becoming part of the default teaching promise, even when
the underlying JavaFX control is already admitted. Normal student API signatures
must not require JavaFX imports. Keep advanced interop explicit and checked.

## Lifetime and coordinate contracts

Before implementing Screen/World, agree and prove these rules:

- The host has exactly one frame recipient. Transitions happen at a frame
  boundary: leave the old screen, detach its listeners/view, suspend its owned
  playback, clear transient gameplay input, enter the new screen and reset elapsed
  time. A hidden screen receives no game updates/input. Deactivating a retained
  session preserves its state and playback for re-entry; final disposal releases
  owned resources when the session is discarded or the app closes. Restart
  explicitly disposes the old session and creates fresh session state.
- Pause stops simulation/actor animation updates while world drawing and UI
  continue. Input/focus policy is explicit: controls keep normal typing, gameplay
  belongs to the focused canvas, blur clears held/edge input and pauses the
  session according to the documented game policy. Resume cannot replay old
  presses or accumulated time. App remains final cleanup owner; screens stop
  their own music on exit and borrowed shared resources are not closed by widgets.
- Default World owns its actors once, updates in insertion order, applies removals
  immediately and admits additions at the next update. Drawing cannot mutate
  simulation. Students own collision response/scoring; a container never silently
  applies physics. Replacement content states and proves its own compatible rules.
- Actors use centre coordinates and clockwise degrees; retain simple bounds/edge
  access so students need not repeat centre-to-top-left conversions everywhere.
  Drawing size is distinct from collision geometry. Rotating art does not make
  an axis-aligned hit test a rotated polygon test.
- The screen's camera transforms only world drawing and converts pointer
  coordinates back to world space. Guarantee transform restoration. Start with
  translation; add general attachment transforms or zoom only for a proven use.
- App owns cached images and final audio cleanup. Components borrow asset handles;
  mutable animation clocks have a single update owner. Missing resources name the
  component/path. Keep loaders inside the existing browser adapter boundary.

These are future contracts. Current `App.show(Node)` only replaces content and
does not stop GameApp's timer; the current Actor still requires sprite input and
`super.update` for animation. Neither behavior is silently changed by this plan.
Permit procedural/no-image actors when adopting Actor as a World member type so
students can learn objects with shapes before authoring artwork.

## ZeroHub is the extension and learning path

Students first solve a problem in their own app/game. Extract related Java source
into `libraries/<slug>/` in that same GitHub repository, with a focused public API,
examples, licence/credit and exact version. Develop locally, demonstrate reuse in
another project, and use the existing explicit sharing/checking flow. Others can
inspect the code, import the library, choose its implementation and improve it.
Keep the native dependency model as ordinary exact-version Maven imports; the
browser path uses verified source/resources through the managed resolver.

Managed local/published library resolution already exists, including namespace,
artifact and version binding before compatibility and compilation. Arbitrary
Maven dependencies are not admitted. Library admission, source compilation,
browser behaviour, useful teaching design and core adoption are distinct claims.
The current hosted checker/admission gate remains closed where already recorded;
this plan grants no new candidate-execution or publication authority.

Core-dependent libraries need an actual native build path against the matching
public core API and a source-export path against that same API/profile. Do not
bundle duplicate canonical core classes inside a contribution or infer that an
unreleased Actor is already available in the published core artifact. Define and
test the required core-version/build metadata before claiming this path works.

For a portable release, check all contributed Java bodies and packaged resources
against the exact browser profile, even unused methods. Compile and exercise real
consumers. Keep native-only alternatives explicit rather than hiding unsupported
calls in an unused branch. A compatibility claim records its exact source/version,
core requirement, profile and behaviour evidence. Proposed metadata/labels need
implementation; a new field in documentation alone is not a runtime guarantee.

Images, sheets and audio are authored externally and imported through New asset
into committed resources. Include component resource namespaces, preloading and
failure cases in reuse tests. Asset handles must not assume absolute local paths,
a particular Main class or the URL root of a Pages project.

GitHub remains the student's source of truth: create/clone → New branch → edit/Run
→ Commit & push → Merge to main. Publish app is explicit and separate from source
upload; ZeroHub discovery/sharing is separate from the game's Pages deployment.
Pika receives the separate assignment repository link. No special contribution
format replaces readable Java source, normal Git history or student authorship.

## How proven ideas enter core

The contribution loop does not automatically merge popular libraries into Zero.
Students and maintainers can propose an idea after real reuse. Assess teaching
value, API clarity, source readability, failure/lifetime behavior, usefulness in
more than one context, attribution/licensing and native/WebFX/browser proof.
Specialized and competing components can remain useful independent libraries.

A core adoption proposal records the contributing source/version and credit,
documents the intended API and compatibility/migration choices, and supplies
examples plus native/browser tests. Normal independent source review, CI and
owner-authorized release apply. Core may adopt or adapt a demonstrated capability;
it does not rewrite the accepted library or transfer its namespace/ownership.
Old versions and exact pins remain unchanged. Users deliberately migrate with a
documented new core/library release; no automatic updates or silent substitution.
The public API, app guide, website reference and coverage checks change together.

## Bounded delivery and acceptance

1. **Document and review the direction.** Adopt this goal/plan, review it with
   Astra, resolve material findings and record what remains a proposal. This step
   changes documentation only; it authorizes no runtime implementation/publication.
2. **Design the smallest contracts with three examples.** Coin collector;
   scrolling enemy game with title/pause/results; simulation/control panel plus a
   nonanimated App consumer. Compare handwritten ordinary Java with the helper
   structure. Prove Zero-only imports for normal UI, drawing, input and assets.
   Finalize lifecycle/input/resource ownership before freezing APIs.
3. **Prove extension and replacement.** Implement a steering contribution, default
   and alternative animation playback, and a default/alternative game container.
   Import them into consumers without core edits. Demonstrate independent clocks,
   procedural actors, safe add/remove, camera inverse input and two restart cycles.
4. **Prove actual component distribution.** Reuse one unchanged UI/helper source
   in an App and GameApp. Exercise managed local source and exact-version pinned
   source-library export, core requirements, resources and namespace binding.
   Native JAR or resolver-only tests do not satisfy the browser consumer proof.
5. **Prove browser delivery.** Run the exact supported semantic profile, pinned
   WebFX build and browser behaviour checks throughout the feature increments.
   Per-signature evidence, error-injection fixtures and truthful local run status
   follow the reliability plan; optional PostHog/Clarity collection cannot replace
   these gates. A separately authorized acceptance publishes the candidate to a student-owned
   project Pages URL, verifies the source/run marker, and plays it unauthenticated
   under `/<repository>/`, including refresh, assets, input, audio gestures,
   pause/restart and a retained previous site after a failed update. Existing
   Sky Hop Pages evidence does not prove new contracts. Broader browser/device
   claims require their own evidence; first acceptance stays honestly scoped.
6. **Test the learning loop.** A novice can explain the Java, add an enemy, swap
   animation, import an asset, extract/use a component, diagnose one unsupported
   browser call and propose an improvement. Measure explanation quality and errors,
   not just successful builds or speed. Exercise a documented core-adoption
   proposal without silently changing existing library consumers.

Steps 2–6 are implementation/acceptance work to scope next, not claims of current
delivery. Hosted publication/release keeps its separate approval and checker gates.
Do not expand into general ECS, a second scene graph/editor, automatic physics,
serialization or runtime plugin discovery to prove these small use cases.

## Reference decisions

- [Arcade stable Window/View](https://api.arcade.academy/en/stable/api_docs/api/window.html):
  the optional active-screen structure; UI and camera remain separate concerns.
- [Greenfoot Actor](https://www.greenfoot.org/files/javadoc/greenfoot/Actor.html):
  approachable movement and Java subclass vocabulary; keep elapsed seconds and
  explicit deterministic ownership rather than its environment execution model.
- [Godot scene organization](https://docs.godotengine.org/en/stable/tutorials/best_practices/scene_organization.html):
  focused reusable composition with supplied dependencies, not arbitrary node paths.
- [FXGL game/UI view](https://github.com/AlmasB/FXGL/wiki/Game-Scene-%28FXGL-11%29):
  reference world/UI separation, not evidence of pinned WebFX runtime compatibility.
- [WebFX limitations](https://docs.webfx.dev/#limitations) and
  [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages):
  the browser delivery constraint. General documentation does not expand Zero's
  checksum-pinned toolchain or exact student compatibility contract.
