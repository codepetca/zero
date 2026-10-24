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
boundary. Replaceable animation is now implemented and accepted in Phase2C.
Project-owned browser tooling is being integrated in Phase3. Screen lifetime,
World and new automatic diagnostics remain proposed.

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
supports procedural drawing with no sprite. Actor's final update(seconds)
validates time, runs protected onUpdate(seconds), then advances its selected
playback once. AnimationSource creates fresh per-actor AnimationPlayback; drawing
uses the cached frame. SpriteAnimation supplies the default source and students
can select their own implementation without changing the actor consumer.

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

Current source, unreleased: projects include readable framework source, native
Maven/JavaFX pins and the complete `.zero-build` browser builder. Its standalone
CLI retains rules, adapters and locks. Explicit trusted editor actions use
a verified frozen copy; opening a project never executes it or upgrades its
helpers. Retained finished output has separate data-only validation. Independent
review and clone/build/rehost/upgrade/rollback acceptance pass locally.
`templateVersion` alone is not a complete build record. Private Node provisioning
source and platform harness checks pass; real installation acceptance remains
separate. No complete offline or indefinite rebuild guarantee is claimed.

Acceptance stays bounded: current examples and a small fixed set of representative
same-major projects, not every historical release. Clone one older project with
its committed build files outside the development repository and rebuild with no
central Zero kit service. Record cache reuse honestly: the accepted local proof
uses verified normal dependency caches, not a cold installation or full offline
archive. Check missing-cache/tool availability separately; cold setup remains a
platform acceptance gate.
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

| Phase | Outcome and exit criteria | Status |
| --- | --- | --- |
| 0. Working baseline | Recover accepted App/GameApp/Actor/UI prototypes, source/export ownership and verification. Keep Main's explicit update/draw; one gameplay loop and no GameScreen. | Accepted locally: counter, structured/beginner Coin Quest and stress proof; prior native/browser receipts retained. |
| 1. Make the student path Zero-first | Move maintained Greeting, Study and Coin teaching projects to Zero packages for normal UI/input/drawing/assets. Keep classes and callbacks ordinary Java. Add only controls needed by those lessons. Add a small simulation with live controls; preserve beginner Main/HUD and optional extraction. | Accepted locally through549db09f (slices1A–1F): teaching path0–12 and live-control simulation, native/WebFX/browser checks and independent reviews. Core16helpers/176declarations. Public templates/kits remain separately pinned. |
| 2. Prove student extension and sharing | Demonstrate an ordinary steering helper, interchangeable UI component, default/alternative animation and container through public consumers without core edits. Share immutable data but independent mutable clocks, with one explicit update owner. Prove the same component through managed local and exact-version library consumption in App and GameApp, natively and in the browser. | 2A accepted locally at29118a74: typed text/bar replacement in App/GameApp, native/browser checks and independent review. 2B accepted locally at98b3a831: independent JAR and four native/WebFX consumers,38browser assertions. 2C accepted locally atdf47d667: replaceable animation/steering,18helpers183declarations, native/managed-JAR and browser behavior. 2D accepted locally: optional ordered/snapshot actor containers, native and13browser assertions; Phase2 complete. Add World/Screen/camera only for demonstrated examples, not as a prerequisite. Hosted acceptance remains gated. |
| 3. Make projects self-contained and upgrades optional | Record exact framework/library/toolchain inputs and retain the complete reviewed browser-builder dependency closure with the project. Opening in a newer editor changes none of them. Explicit trusted build actions use project-owned tooling; missing tools get useful unavailable status. Upgrade a copy/branch deliberately and reversibly. Clone/build/rehost a representative older project and saved static export with no central Zero kit service. | 3A/3B accepted locally through05390785: standalone saved-builder closure and trusted editor selection; automatic Publish migration removed. Actual outside-repository export and13browser assertions pass. 3C accepted locally: old A clone/rebuild is byte-identical; finished-only play, explicit B upgrade and exact rollback pass. Full Phase3 preservation is accepted locally. Hashes never authorize execution by themselves. No required historical-kit database, all-version CI or old-maintenance branches. Full offline backup remains optional. |
| 4. Catch failures during development | Complete exact-signature executed-evidence coverage; debounced saved-source browser compatibility, truthful native/managed-preview lifecycle and source-linked errors. Inject unsupported API, compiler, asset, startup, frame/UI/promise and stale-message failures; preserve the last good export. Native Run stays fast and usable offline. | Active: all183 declarations have native/browser assertion mappings; cache-only status, runtime hooks and per-target evidence gates are implemented. Four current WebFX exports pass. Complete native execution needs the unlocked Mac; a small browser fault-channel harness correction awaits review-budget extension. Full executed coverage remains pending. Meaningful evidence exists from slice 1A onward. PostHog is an optional sanitized sink evaluated after local gates; Clarity is a possible website usability supplement. Neither is injected or activated by this plan. |
| 5. Finish the student/contributor journey | Exercise create → code → native play → fix error → Git progress → browser export/preview and exact library reuse; keep public templates, kit, lessons, API and help coherent. Prepare a release candidate with scoped browser/platform limits and a core-adoption example retaining attribution. | Private Node setup source is implemented and platform-harness checked. A local VSIX/kit candidate passes source/archive/license checks and extracted Maven compilation;43 local Git/mocked-editor workflow contracts pass. A credited core-proposal example is prepared. Actual installation and interactive journey acceptance remain pending. Public template updates, authenticated Pages publication, hosted checker activation, signed releases and a teacher/novice pilot require their separately authorized real acceptance; local mocks cannot satisfy them. |

Local acceptance, 2026-10-23: Phase1 is complete through549db09f. The canonical
starter, Greeting0–2, Study3–7, Coin8–12 and live-control simulation use Zero
packages for their normal UI/input/drawing/assets. GameApp extends App; Main owns
explicit updates. Core contains16helpers/176declarations. Native checks, actual
pinned WebFX exports, browser behavior and independent review pass per slice.
Checks caught and corrected pinned WebFX prompt, focus traversal and inherited
disabled-state differences. Failed attempts and exact revision/hash evidence are
preserved in [delivery evidence](EVIDENCE.md); these are not a single all-platform
acceptance claim. Public templates, installed kits and hosted website are unchanged.

Phase2A is accepted locally at29118a74: a student-owned ScoreView contract with
text/bar implementations consumed by App and GameApp, scoped native checks, two
actual exports/19browser assertions and independent review with one corrected
fixture omission. Phase2B is accepted locally through98b3a831: separate core/
contribution JAR checks and actual local/exact-artifact App/GameApp consumers,
four native runs, four WebFX exports and38browser assertions. Selected-release
requirements, staged input integrity and ordinary wrapper-properties CRLF were
corrected during independent review. Phase2C is accepted locally atdf47d667:
replaceable actor animation, independent clocks, procedural/image swaps and
student steering, with native/managed-JAR proof and15 browser assertions. The
checker-only remediation export has all60 runtime files byte-identical to the
browser-tested build. Phase2D is accepted locally: optional student ordered/snapshot containers through
the same Main, native checks and13 browser assertions from one outside-repository
saved-builder export. Phase2 is complete locally. Source-only resolution remains distinct from JAR proof.
Published tutorial-template commit IDs and installed artifacts remain immutable
until separately authorized publication. Report local versus public delivery.

Phase 2 must include two actors sharing frame definitions with independent
playback, procedural drawing, animation/image swaps, pause/restart and invalid
component errors. A replacement must work by selecting an implementation or
ordinary adapter, not rewriting the consumer or editing fingerprinted helpers.
Containers prove safe add/remove and exactly-once explicit updates. A managed
library's namespace, exact version, resources and core requirements stay bound
on native and browser targets. A successful local check does not open the hosted
checker gate or create an accepted public release.

Phase2B design review (Astra/xhigh, 2026-10-23): compile a core-dependent
contribution against a separately built copy of the project's reviewed core
sources. Use a generated, fixed Maven reactor with a `provided` core dependency;
do not install a global artifact or bundle core classes in the contribution.
The consumer retains its own core source at runtime. The widget harness must
deliberately support `Element view()` alongside existing `Node view()`, verify
class origins and prevent checks/examples from shadowing core or contribution
classes. This is a local Check capability, not permission to execute candidates
in the hosted checker.

Keep a small semantic core requirement separate from exact build provenance.
An explicit unreleased core version describes API compatibility; source inventory,
core JAR, recipe and toolchain hashes bind the actual compiled inputs. Descriptor,
release, sanitized POM, Add/Update and browser snapshot must agree. A source change
invalidates evidence without automatically meaning an API break. Existing
core-independent libraries remain valid. Do not infer the new core's identity
from the old framework POM's0.2.1 version.

Acceptance uses the same interface and two display implementations as an actual
namespace-confined contribution JAR: separate core/contribution JAR checks, local
source and exact-artifact App/GameApp consumers, plus pinned browser behavior.
Reject absent/incompatible core, changed prepared inputs, disagreeing POM metadata,
duplicate core classes, corrupt artifacts and unsupported calls even in unused
library methods. The existing disposable local HTTPS artifact proof can establish
this without a central service. Hosted policy currently rejects interfaces and
expects Node widgets; its separate core/JavaFX-media and admission gaps stay
visible and gated until a reviewed hosted acceptance is authorized. This proof
does not establish the complete saved-project builder closure planned in Phase3.

The implemented2B contract uses unreleased school.zero:zero-core:0.3.0, Java17 and
JavaFX21.0.12. A generated project-owned zero-core.json records the exact reviewed
source inventory; canonical LF hashes tolerate an ordinary Windows CRLF checkout,
while raw input snapshots detect edits during a build. This is one maintained
current-core definition, not a history of kits. Opening an older project never
creates or rewrites its record automatically.

Core-dependent descriptor/release schema2 separates a bounded semantic requirement
(minimum0.3.0, exclusive0.4.0) from the author's exact source/core-JAR/recipe proof.
Existing core-independent schema1 remains valid. A consumer checks its own core
version against the requirement, rather than requiring the author's source hash.
Current tooling admits only its reviewed core inventory. The complete builder
saved with older projects is Phase3's route to preserving their original build.
Run the fixed core/contribution reactor first, then obtain the JavaFX classpath
from its standalone core module; no Maven install or unavailable core download.
Hosted schema2 admission remains explicitly unavailable until separately reviewed.
During this unreleased prototype series,0.3.0 names the draft core; exact source/
recipe hashes distinguish revisions. Finalizing Actor update/animation ownership
can change this draft before publication. Once published, the stated0.x minor/
patch policy applies; do not silently rewrite a student project to follow drafts.

Phase 3 maintains only the current release line. Before 1.0, minor releases may
break APIs while patches preserve them; after 1.0, same-major documented APIs
remain compatible. Existing projects retain exact source/pins and published
static output. Future rebuilding depends on usable tools and normal dependency
hosts unless a student deliberately saves an optional full offline bundle.

### Phase 3 implementation contract

Astra's concrete preservation review (2026-10-23) selects one tracked
`.zero-build/` directory in each student repository. It contains `builder.json`,
`runtime-lock.json`, `run.cjs`, instructions, LF attributes, the reviewed sharing
configuration and the complete browser exporter source tree. Preserve its
`src/` and `media/` relative layout, including the exporter’s local core,
project-POM and sharing dependencies. The current exporter needs Node built-ins
and its local files; maintainer npm packages and editor APIs are outside this
closure. Remove the snapshot module's lazy editor/Git dependency; credentialed
publication supplies that operation from the host.

`builder.json` uses a bounded versioned protocol and a sorted inventory of every
saved file except itself: relative path, SHA-256 and byte count, plus the
canonical aggregate hash. Reject missing, undeclared, case-colliding, linked or
escaping paths. A hash identifies bytes; it does not authorize executing them.
The build profile binds the entire selected saved closure, including the CLI,
runtime requirements and sharing configuration. Existing dependency locks,
wrapper hashes, WebFX source pins, adapter/checker/runtime patches and notices
travel with it. Runtime requirements come from verified current release
metadata; unavailable platform evidence must not become guessed download pins.

The installed editor reads only bounded metadata when opening a project. It
does not import or execute project code, fetch tools or upgrade files on open.
An explicit Browser Run/Export/Publish action in a trusted workspace selects the
saved builder, verifies and freezes its closure, and starts the fixed entrypoint
as a child process with a bounded JSON operation protocol. Locate and verify a
standalone Node/JDK independently of project metadata. Clear preload/module and
Java/Maven injection variables; pass only the required operating-system/tool
environment, never GitHub tokens. Enforce cancellation, deadlines and owned
process cleanup. Recheck project and builder inputs before accepting results.
Partition caches by builder/lock identity. Missing runtimes, an incomplete
closure or an unsupported protocol produce a useful tooling-unavailable result
and standalone instructions; never silently substitute the latest builder.

One maintainer producer supplies this directory to starter, lesson, prototype
and internal website project assemblers. Preserve edited generated copies using
the existing ownership checks before writing anything. Maintainer copies remain
ignored; student repositories track the complete directory. Archive/import
allowlists retain only its validated inventory rather than admitting arbitrary
hidden executable files. Source/upload snapshots include the saved closure.

The same host adapter serves browser preview, export and Publish's local build.
Remove Publish's automatic helper replacement. Credentialed Pages transport
stays outside the saved Java builder. Provide a separate data-only validation
path for retained finished site/ZIP output: rehosting a saved game must not need
the old compiler, current source/profile or a live catalog. The public site ZIP
does not contain student Java; retain exact source in the student's repository
and use a separate input snapshot if a build receipt claims exported source
preservation.

Deliver three bounded slices in order:

1. **3A — saved builder:** closed standalone producer/CLI, complete inventory and
   runtime pins, no automatic helper upgrade, and a build outside this repository
   with no parent source or `node_modules` dependency.
2. **3B — editor selection:** shared trusted-action adapter/protocol, immutable
   open behavior, useful missing/changed-tooling errors, cancellation, source and
   commit binding, with no fallback to installed exporter code.
3. **3C — preservation proof:** freeze project/builder A, advance the maintained
   template to B, clone and rebuild A using available runtimes and verified normal
   dependencies with no ZeroHub service. Rehost retained output without build
   services. Deliberately upgrade a copy/branch to B, verify it, and demonstrate
   recovery of the original. Do not promise permanent upstream availability.

Only the current producer is maintained. Historical student repositories retain
their own builder; no central kit store, database, old maintenance branches or
automatic migrations are introduced. Optional full offline bundles remain a
later student-owned backup choice.

### Phase 4 implementation contract

Astra's read-only reliability audit (2026-10-23) confirms that the current
18-helper/183-declaration inventory and behavioral checks are useful, but do not
yet prove executed native/browser behavior for every signature. A count, import,
dead-code call or list of test names is not passing evidence. The maintained
browser verifier has nine fixtures; add explicit local fixture selection before
preparation, preserving full conservative CI defaults. Do not repeat stress tests.

Prepare three coordinated source components, then collect acceptance against
their final frozen inputs:

- **Evidence and fixtures:** a finite exact declaration manifest and receipt
  validator bind every owner/signature, overload, extension hook and constant to
  native/browser assertion IDs and meaningful postconditions. Bind declaration,
  fixture, harness, core, complete builder/profile, contract, library and executed
  output/tool/platform identities. Emit each outcome after invocation and its
  postcondition; reject missing, stale, duplicate, conflicting or incomplete
  receipts. Reuse seven native checks and four browser fixture families: helpers,
  actual Zero UI/navigation, audio and a small lifecycle fixture. Inherited
  receiver use is a variant, not another declaration. Keep gaps explicit until
  actual execution passes.
- **Saved-source status:** add cache-only compatibility with no network fallback,
  Maven, annotation processors or export generation. Missing verified tools,
  attribution or exact library/cache metadata means unavailable. A deliberate
  Enable browser checks/preparation action approves a trusted project and exact
  frozen builder hash; opening/saving alone grants no execution authority.
  Changed tooling revokes approval. Debounce saves and relevant create/delete/
  rename/config/library changes, cancel superseded work, bind results to saved
  source/core/library/builder/checker/JDK identity, and discard late completion.
  Dirty edits mark status stale. Keep checking, compatible, unsupported,
  unavailable and stale separate from native Run or real WebFX success. Only
  explicit preparation fetches dependencies with progress. Native Run remains
  independent, fast and usable offline.
- **Local runtime status:** use bounded versioned startup, UI-ready, first
  successful game frame, fatal error and stopped events. Keep pause/menu/hidden
  activity separate from failure. Instrument existing App/GameApp, assets/startup,
  early browser bootstrap, GWT uncaught handling and actual UI callbacks; retain
  causal and cleanup errors. Do not add a public lifecycle API solely for
  diagnostics. Bind the preview channel to its exact active iframe/origin, run
  generation and immutable build identity; validate sequence, size/rate and reject
  stale/forged events. Messages have status/diagnostic authority only. Native Task
  start/exit cannot prove readiness: a supported CustomExecution/Pseudoterminal
  wraps the same Maven command, mirrors terminal output/problem matching and owns
  cross-platform process cancellation. Older cores report started/readiness
  unverified. Avoid a progress watchdog initially; inactivity is not a crash.

Prepare evidence tooling while the other components are implemented, then run it
after their source/profile is frozen. Inject unsupported APIs, a real WebFX
compiler failure, missing asset, setup/update/draw/UI-handler/promise and shutdown
failures. Prove useful local diagnostics and unchanged last-good output. Test
replayed, oversized, flooded and stale-origin events, Stop/restart/disposal and
valid UI-only/menu/pause/hidden-tab cases. Every advertised declaration needs
executed evidence on both targets before claiming complete coverage.

Phase5 must provision/discover a private pinned standalone Node runtime in the
classroom kit, with setup candidate and host-discovery checks. Missing Node now
reports unavailable while native Run continues; global manual Node installation
must not become the normal student workflow. Physical platform/publication gates
stay separate. Telemetry remains off: no SDK, collector, keys or replay injection.
A later sanitized PostHog experiment cannot replace these local gates.

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
