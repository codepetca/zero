# Framework architecture: learn, extend and contribute

Owner direction,2026-10-23. This is the canonical runtime/extension plan, alongside
[repository boundaries](ARCHITECTURE.md), [product goals](PRODUCT.md) and
[ZeroHub sharing](COMPONENTS.md). It incorporates the first Astra architecture
review and makes student-led framework evolution an acceptance requirement.
Contracts and names below are proposed unless marked implemented. The current
App/GameApp path remains available; Actor is an unreleased local prototype.
The later owner clarification makes Zero the normal student API, with JavaFX
available for advanced interoperability. The detailed
[class/ownership model](FRAMEWORK-MODEL.md) and
[automatic failure-detection plan](FRAMEWORK-RELIABILITY.md) are parts of this
architecture, not separate competing plans. They also remain proposed.
Latest simplification: GameApp extends App and owns gameplay directly. Screen is
an optional UI view; there is no public GameScreen. This supersedes the earlier
active-game-screen design while preserving its lifetime and replacement goals.

First implementation slice,2026-10-23 (local, unreleased): `zero.ui.Element`,
`Label`, `Button`, `Column`, `zero.Color`, `App.show(Element)` and
`GameApp.controls(Element)` now have readable source. A counter App and pointer
coin GameApp reuse the same ordinary `ScoreDisplay` source. See the
[runnable prototypes](../framework/prototypes/README.md) and
[current API](../student-template/API.md). This proves the first composition
boundary, not the whole plan: Screen lifecycle, World, replaceable animation,
project-owned browser tooling and new automatic diagnostics remain future work.

The next local increment turns the coin example into COIN QUEST: title/help,
two timed levels, pause/resume, win/timeout results and replay/title navigation.
Student screen classes are ordinary objects returning Element views. App.show
now uses one transition path for Node/Element views: a replacement suspends
GameApp update/draw/input; showGame restores its retained canvas/HUD and clears
input/elapsed time. Pause/resume is a separate explicit state; pause skips update
while drawing/UI continue. In-frame navigation commits after successful drawing,
idle UI transitions commit immediately, and stop/failure discards queued views.
Use controls(Element) for a live HUD. No zero.Screen lifetime base class, history,
World or second frame driver is introduced; the fuller lifetime plan below
remains proposed where it depends on those types.

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

Use App for event-driven UI and GameApp extending App for games/animated apps.
GameApp owns one canvas/input/camera and one loop calling Main update/draw;
Main delegates explicitly to objects or optional game content. Screen is optional
UI navigation. Arcade informs lifecycle/container ideas without requiring its
game-view hierarchy. Greenfoot informs approachable Actor vocabulary; Godot informs focused
composition and independence from arbitrary surrounding objects. These are
architectural references, not new dependencies or a combined engine runtime.

| Owner | Responsibility | Extension boundary |
| --- | --- | --- |
| App | Window/root, app-scoped assets, active-screen lifecycle and final cleanup | Zero UI and app-owned controllers; advanced JavaFX bridge; no game types required |
| GameApp extends App | Gameplay canvas, input, camera and one internal frame driver calling Main update/draw | Explicit delegation to objects, default World or alternative content/controller |
| Screen | Optional UI view with enter/leave/disposal hooks | Title, quiz, settings or results; no game callbacks or timer |
| World | Default ordered actor membership, exactly-once updates and world drawing | One optional content implementation; Main can select another ordinary Java container/controller |
| Actor | Local state, movement and optional appearance | Subclass behaviour, composed helpers and replaceable animation playback |
| Camera | World-to-canvas and inverse pointer mapping | Owned by GameApp's gameplay view; follow/smoothing can be ordinary helpers |
| UI/data components | Controls, HUDs, health, scores, inventories and other structures | Public constructors, setters, callbacks and small interfaces where alternatives share a contract |

A one-screen quiz stays an event-driven App with Zero Label/Button/TextField and
layouts. A first moving shape can stay in Main. A menu has no World. A scrolling
game can replace its level/world while retaining its HUD/control UI. Main keeps
the update/draw callbacks; level-specific code may move to ordinary controllers.
Showing a UI Screen suspends gameplay; composing HUD/controls alongside gameplay
does not. Returning to gameplay restores its retained state. Neither a universal
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
Main's update/draw must be able to delegate to a student controller/container
using a small public content contract or an explicit ordinary-Java adapter.
GameApp's public world-drawing boundary accepts that contract so a replacement
does not require downcasts to the default
World or depend on its private collection implementation. Choose exact drawing
capabilities through the examples; current `draw(GameApp)` is not automatically
the ideal permanent boundary. Do not create a large renderer abstraction first.

Prove the boundary by selecting a default actor World and a student-authored
alternative container in the same GameApp/Main consumer. A spatial lookup structure,
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

Before implementing Screen/World and navigation, agree and prove these rules:

- GameApp has one internal frame driver and Main update/draw recipient; App-only
  UI and Screens need no frame timer. Showing a UI Screen detaches the current
  view/listeners and suspends game update/draw/input without destroying game
  state/playback. Transitions requested during a frame commit after that frame;
  idle UI transitions commit on the UI thread without waiting for a game frame.
  Returning to gameplay resets elapsed time/input and respects explicit pause.
  Final disposal releases owned resources only when discarded or the app closes.
  Restart explicitly rebuilds game state and resets camera/input/time.
- Composing a HUD or control panel with the gameplay view is separate from
  showing a replacement UI Screen. It keeps gameplay active and preserves normal
  control typing/focus. UI-only readiness follows setup/view activation; gameplay
  readiness may additionally require its first successful frame.
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
- GameApp's gameplay camera transforms only world drawing and converts pointer
  coordinates back to world space. Guarantee transform restoration. Start with
  translation; add general attachment transforms or zoom only for a proven use.
- App owns cached images and final audio cleanup. Components borrow asset handles;
  mutable animation clocks have a single update owner. Missing resources name the
  component/path. Keep loaders inside the existing browser adapter boundary.

The full Screen/World/camera contracts above remain proposed. The local
implementation already suspends gameplay callbacks and input when App.show
replaces the gameplay view; showGame restores it. Actor(double, double) already
supports procedural drawing with no sprite. Actor animation still requires
super.update(seconds) in an override; the final update entry/behaviour hook and
replaceable playback contract have not yet been implemented.

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

## Project versions and preservation

Owner direction,2026-10-23: projects own their source and build files. **No central
historical-kit storage, database or kit registry is required.** This supersedes
the earlier requirement to archive a complete Zero-hosted kit for each release.
Develop Zero quickly while retaining student ownership and a simple build path.

1. **Keep the project in the student's repository.** Commit readable framework
   source, assets, native build files/wrapper, browser build recipe, Zero-specific
   builder/adapters/checker/profile files, dependency locks and build instructions.
   A version label or link to an old editor download is not a build recipe.
   Generate a small record of the exact original Zero release, build-file/profile
   identities and library pins; students need not maintain these by hand. Build
   tooling is supplied infrastructure, not another language students must learn.
   Keep actual build source/config tracked; generated outputs/caches stay ignored.
2. **Separate editor updates from project upgrades.** Opening/editing a project
   or updating Zero must not replace its framework, build files, pins or browser
   rules. The editor is a launcher for the project's recorded build path where
   supported; it does not resolve an old kit from a new central service. If the
   path/tools cannot run, report a tooling limitation and show project-owned
   instructions or an optional upgrade of a copy. Do not call old source broken
   merely because it differs from the installed exporter. Do not promise that
   the latest editor can execute every historical builder.
3. **Maintain one current line.** No historical maintenance branches, backport
   promise, per-student builders, all-version CI or old-API shims. Preserve normal
   published version identities/artifacts without creating a new kit-hosting
   obligation. Ordinary versioned dependency repositories and existing ZeroHub
   sharing remain available options; neither is a new historical-kit database.
   A teacher can select one tested classroom release while Dev work continues.
4. **Version and upgrade deliberately.** Pin an exact framework release and exact
   build/dependency inputs, never a major-only range, `latest` or mutable snapshot.
   After 1.0, minor/patch releases preserve supported signatures and documented
   behavior; breaking API changes require a major release. Explained bug fixes
   may correct incorrect behavior. During 0.x, minors may break compatibility and
   patches preserve it. Follow [Semantic Versioning](https://semver.org/).
   Even compatible upgrades are explicit: preview changes on a branch, preserve
   edits, run native/WebFX build and smoke checks, review behavior and retain the
   old commit/output for rollback. Existing Commit & push/Merge permissions apply.
   Core adoption never rewrites accepted ZeroHub releases, credit or installed pins.
5. **Save the playable result.** Reuse the existing validated web-export ZIP/hash
   manifest. Offer a retained copy with the actual exported source snapshot/digest,
   release/build/library provenance, assets and license notices. Record the commit
   when available and dirty state when relevant; HEAD alone cannot identify an
   uncommitted export. The student may explicitly attach it to their GitHub release
   or keep it locally. A compiled static game needs no Zero login or live Zero
   runtime service and can be rehosted without recompiling. Source and release
   assets stay separate; publication remains explicit. Hosting/browser/external
   game-service longevity cannot be guaranteed.
6. **Make full offline backup optional.** Students may retain a separate bundle
   containing the project's build files, required redistributable dependencies/
   library sources/JARs/resources, licenses and documented tool requirements.
   Zero need not centrally store or manage these bundles. Default projects use
   exact dependencies from normal artifact hosts, including pinned source inputs
   where needed; hashes and URLs do not guarantee those bytes remain available.
   Without a complete retained bundle and usable tools, indefinite rebuilding is
   best effort, especially for timestamped snapshot artifacts. Editing retained
   source and playing saved output are separate from successfully rebuilding it.

Project-owned build code remains untrusted project input. Owning a file or editing
its hash record does not grant a trusted-helper exemption. No automatic build-hook
execution on open, arbitrary download-and-run from a version record, credential
access or bypass of the existing frozen-wrapper/no-project-hook export safeguards
is authorized. A safe supported project-build entry point requires implementation
review; an unsupported path must report unavailable rather than execute a fallback
script silently. Standalone instructions must also document tools and explicit
local execution. Browser output must still pass the selected validated profile,
real pinned WebFX compilation and source/output snapshot checks before publishing.

Current limits: projects already include readable framework source and native
Maven/JavaFX pins. The existing exporter already emits a web ZIP and source/profile/
output hashes and has a standalone CLI. Browser rules and builder files still
come from the installed exporter; templateVersion is not a complete project build
record. Project-owned browser tooling, a supported safe launcher, complete locks,
retention/optional backup and upgrade UI remain future work. This policy does not
implement them or establish a complete offline rebuild guarantee.

Acceptance stays bounded: current examples and a small fixed set of representative
same-major projects, not every historical release. Clone one older project with
its committed build files into a clean environment, with empty caches and no
central Zero kit service, and build using the recorded normal dependency sources.
Verify that a newer editor leaves inputs unchanged, explains unsupported tooling,
and makes an optional upgrade reversible. Rehost the saved web ZIP with Zero
services unavailable. If an optional full offline bundle is offered, separately
restore it with upstream downloads disabled and verify its retained bytes and
provenance. Missing dependencies must be reported honestly. No database, central
kit mirror or all-old-version support is an acceptance prerequisite.

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

## Phased delivery and acceptance

Owner authorization, 2026-10-23: prepare the implementation plan, establish the
phased goal and orchestrate the work in this chat. This section is the single
execution roadmap; the model/reliability documents supply detailed contracts.
It supersedes the earlier documentation-only delivery sequence. Local source,
tests, examples and independent review are authorized. Push, PR publication,
merge, deployment, releases, account changes and external telemetry activation
remain separate owner decisions. Do not repeat the completed stress benchmarks.

The coordinator tracks current assignments, revisions and evidence in
[.ai/CURRENT.md](../.ai/CURRENT.md). Each slice needs proportionate independent
review and useful native plus pinned WebFX/browser behavior evidence for changed
public capabilities. Student API, app guide and website reference/tests change
with APIs; locally verified documentation is not a published website. Reuse valid
unchanged checks. Future phases start only when their dependencies are ready.

| Phase | Outcome and exit criteria | Initial state |
| --- | --- | --- |
| 0. Working baseline | Recover accepted App/GameApp/Actor/UI prototypes, source/export ownership and verification. Keep Main's explicit update/draw; one gameplay loop and no GameScreen. | Accepted locally: counter, structured/beginner Coin Quest and stress proof; prior native/browser receipts retained. |
| 1. Make the student path Zero-first | Move maintained Greeting, Study and Coin teaching projects to Zero packages for normal UI/input/drawing/assets. Keep classes and callbacks ordinary Java. Add only controls needed by those lessons. Add a small simulation with live controls; preserve beginner Main/HUD and optional extraction. | Active. Slice 1A accepted locally: starter and Greeting lessons0–2 with TextField. Slice 1B accepted locally: Study lessons3–7 and inherited control availability. Slice 1C accepted locally: Coin lessons8–9 with Key and Row. Active1D: shared component lessons10–11; then assets and simulation. |
| 2. Prove student extension and sharing | Demonstrate an ordinary steering helper, interchangeable UI component, default/alternative animation and container through public consumers without core edits. Share immutable data but independent mutable clocks, with one explicit update owner. Prove the same component through managed local and exact-version library consumption in App and GameApp, natively and in the browser. | Planned after the teaching consumers are ready. Begin with a tiny student-owned ScoreView contract; then AnimationSource/AnimationPlayback. Add World/Screen/camera only for demonstrated examples, not as a prerequisite. Hosted acceptance remains gated. |
| 3. Make projects self-contained and upgrades optional | Record exact framework/library/toolchain inputs and retain the complete reviewed browser-builder dependency closure with the project. Opening in a newer editor changes none of them. Explicit trusted build actions use project-owned tooling; missing tools get useful unavailable status. Upgrade a copy/branch deliberately and reversibly. Clone/build/rehost a representative older project and saved static export with no central Zero kit service. | Planned. Fix the existing automatic helper migration during Publish; hashes alone never authorize arbitrary project code execution. No required historical-kit database, all-version CI or old-maintenance branches. Full offline backup remains optional. |
| 4. Catch failures during development | Complete exact-signature executed-evidence coverage; debounced saved-source browser compatibility, truthful native/managed-preview lifecycle and source-linked errors. Inject unsupported API, compiler, asset, startup, frame/UI/promise and stale-message failures; preserve the last good export. Native Run stays fast and usable offline. | Planned, with meaningful exact-signature evidence recorded from slice 1A onward. PostHog is an optional sanitized sink evaluated after local gates; Clarity is a possible website usability supplement. Neither is injected or activated by this plan. |
| 5. Finish the student/contributor journey | Exercise create → code → native play → fix error → Git progress → browser export/preview and exact library reuse; keep public templates, kit, lessons, API and help coherent. Prepare a release candidate with scoped browser/platform limits and a core-adoption example retaining attribution. | Planned. Public template updates, authenticated Pages publication, hosted checker activation, signed releases and a teacher/novice pilot require their separately authorized real acceptance; local mocks cannot satisfy them. |

Local acceptance, 2026-10-23: slice 1A is complete through source22b979d6.
Greeting lessons/checkpoints0–2 and the starter use Zero UI; 14 helpers/164
public declarations, native framework/progression checks, two focused final
WebFX exports, 29 browser assertions and independent review pass. The checks
caught and corrected pinned WebFX default/prompt/focus differences. Six actual
builds include failed earlier attempts; see [delivery evidence](EVIDENCE.md).
Study slice 1B is accepted through source7f8235ff: Zero UI lessons3–7,
Element.setEnabled, native progression/UI checks, 52 final browser assertions
and independent review. The review caught inherited disabled-state differences
in pinned WebFX; four actual builds include the pre-fix pair. The next active
slice is shared ScoreDisplay lessons10–11. Coin slice1C is accepted at
a4e8b771: 16 helpers/175 declarations, native input/UI/progression, 59 browser
assertions and independent review. Public template/release bytes have not changed.

Phase 1A is done when the canonical starter and all three Greeting checkpoints
use Zero UI imports, the incremental lesson instructions match them, TextField
text/prompt and button/typing/focus behavior are proved natively and in a real
WebFX browser, API documentation is complete and independent review is clean.
Published tutorial-template commit IDs and installed artifacts stay unchanged
until their authorized publication phase; report this distinction explicitly.

Phase 2 must include two actors sharing frame definitions with independent
playback, procedural drawing, animation/image swaps, pause/restart and invalid
component errors. A replacement must work by selecting an implementation or
ordinary adapter, not rewriting the consumer or editing fingerprinted helpers.
Containers prove safe add/remove and exactly-once explicit updates. A managed
library's namespace, exact version, resources and core requirements stay bound
on native and browser targets. A successful local check does not open the hosted
checker gate or create an accepted public release.

Phase 3 maintains only the current release line. Before 1.0, minor releases may
break APIs while patches preserve them; after 1.0, same-major documented APIs
remain compatible. Existing projects retain exact source/pins and published
static output. Future rebuilding depends on usable tools and normal dependency
hosts unless a student deliberately saves an optional full offline bundle.

Final acceptance is evidence of the learning loop: a student can explain their
Java, add an actor, import an asset, swap animation, extract/reuse a component,
diagnose one unsupported browser call and propose a core improvement. Record
what was actually observed; a local component, green compile or HTTP200 does not
complete publication, physical device or novice acceptance. Do not expand into
a general ECS, visual editor, automatic physics, serialization or runtime plugin
discovery to satisfy these bounded use cases.

## Reference decisions

- [Arcade stable Window/View](https://api.arcade.academy/en/stable/api_docs/api/window.html):
  lifecycle/container reference; Zero's simpler model keeps gameplay in GameApp
  and uses optional UI Screens without a public game-screen hierarchy.
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
