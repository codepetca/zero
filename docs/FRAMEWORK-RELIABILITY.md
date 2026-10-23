# Framework reliability: catch failures automatically

Proposed acceptance system for the [framework architecture](FRAMEWORK-ARCHITECTURE.md),
2026-10-23. Source audit at9502440e; this document does not install telemetry,
activate alerts, change Run behavior or claim new runtime detection exists.
The default Zero API must be verified before students encounter platform failures.

## Existing detection and gaps

| Signal | Existing source | What it establishes |
| --- | --- | --- |
| Helper inventory, declaration count and fingerprints | [web-profiles.mjs](../scripts/web-profiles.mjs), [adapters](../extension/src/web-export/adapters/index.js) | Reviewed source/API drift; not semantic coverage of every method |
| API documentation parity | [API tests](../website/tests/api-reference.test.mjs) | Canonical declarations and website entries agree |
| Original-source resolved API check | [compatibility](../extension/src/web-export/compatibility/index.js) | Rejects unsupported student/library API use before transpilation; reviewed helpers have a narrow exemption |
| Actual pinned WebFX/GWT compile | [exporter](../extension/src/web-export/index.js) | Real compilation fails on nonzero exit; source-mapped local diagnostic log; previous output retained |
| Problems/Output and native task matcher | [web run UI](../extension/src/web-run-ui.js), [extension](../extension/src/extension.js) | Local compile errors, failed operation and native exit feedback |
| Six real fixtures and browser interaction assertions | [verifier](../scripts/verify-web-export.mjs), [browser checks](../scripts/web-browser-checks.js), [CI](../.github/workflows/web-export.yml) | Selected API/gameplay behaviors pass in tested browsers, not all possible applications |
| Image/startup/audio failures | [launcher](../extension/src/web-export/adapters/runtime/zero/web/BrowserLauncher.java), [audio](../extension/src/web-export/adapters/runtime/zero/web/media/BrowserSound.java) | User-visible status/console failures; no central collector |
| Frame failures | [GameApp](../framework/src/main/java/zero/GameApp.java) | Stops and rethrows update/draw exception with cleanup failures retained |
| ZeroHub status | [project status](../website/lib/hub-project-status.mjs) | HTTP reachability only; not playable/healthy behavior |

Normal native Run currently performs no browser compatibility check or WebFX
compile; Publish/export performs them. A managed preview currently does not
forward game-frame exceptions into editor Run state. It can say App running after
the game has stopped. Browser verification injects its own error collection;
that is not a shipped field-error bridge. No source-managed Clarity, PostHog or
central field collector was found in the website/export runtime. External hosting
settings and independently modified student sites were not audited.

## Detection layers

1. **Every advertised API has evidence.** Maintain a machine-readable matrix keyed
   by fully qualified owner and exact signature, including overloads, inherited
   supported methods and student extension hooks. Link each to meaningful native
   semantics, pinned compile fixtures and browser assertions. Include negative
   input/lifetime behavior where meaningful. Inventory parity and docs coverage
   are necessary but not proof of behavior. Changed methods invalidate their
   affected evidence. CI fails missing/stale entries rather than accepting a
   declaration-count bump or a test name with no assertion. Shared fixtures may
   cover many methods when their behavior is actually observed. Every supported
   overload and extension hook must be reachable/executed in its browser fixture;
   an import or dead-code-only call is insufficient.
2. **Check browser compatibility during ordinary development.** Keep native Run
   fast/offline. Add a debounced original-source compatibility pass on saved
   changes using the existing bounded checker. Report status separately as
   checking/compatible/unsupported/unavailable/stale. A native run does not turn
   browser status green. Bind results to current inputs/profile/library pins;
   ignore obsolete/cancelled results. Cold toolchain downloads remain explicit
   progress and must not freeze native Run. This changes today's native-only
   policy and needs implementation/tests before documentation says it exists.
3. **Compile and execute representative consumers.** Preserve exact-head CI real
   WebFX builds. Expand fixtures for Zero UI facades, default/alternative animation,
   content replacement and managed libraries. Assert behavior, not just HTTP200 or
   a rendered canvas. Collect uncaught errors, unhandled rejections, unexpected
   relevant console/resource failures and startup timeouts. Expected error tests
   use explicit assertions; do not suppress entire error classes to pass. Keep
   failure logs/artifacts and map generated diagnostics back to owned source.
4. **Make runtime status truthful locally.** Add framework startup/first-successful-
   frame/exception/stop signals to the browser adapter and native host integration.
   A managed preview moves through loading → starting → ready → stopped/failed;
   UI-only App/Screen readiness follows successful setup/view activation without
   waiting for a game frame. Gameplay readiness may require the first successful
   GameApp frame; it proves startup, not gameplay correctness. Frame,
   UI callback, asset and promise failures retain local source/stack information.
   A bounded watchdog can indicate lost progress; hidden tabs, pause, event-driven
   screens, menu-suspended gameplay and a closed preview are not crashes. Stop
   render/update work after a
   fatal failure, display a useful local message and offer the local log.
5. **Observe accepted field signals.** An optional service can aggregate explicit
   diagnostics and show release regressions/alerts. Local diagnostics and CI work
   without it. Distinguish student Java/compiler errors, unsupported advanced API,
   toolchain/network failure and suspected Zero regression. One student exception
   is not automatically a Zero bug; a supported-API repro or repeated release-
   correlated failures provide stronger evidence.

An example machine matrix entry links `zero.Actor#update(double)` to native
independent-clock assertions, a pinned animation build fixture and browser
same-frame sequencing assertions. The implementation must validate both link
existence and executed result binding, not merely count JSON entries. Candidate
APIs remain experimental until their required evidence passes. Passing checks
reduce regressions; no finite suite guarantees every game is correct.

## Structured diagnostics and preview bridge

Define stable stage/code/severity plus local context. Candidate stages:
`compatibility`, `native-compile`, `web-compile`, `asset-load`, `startup`,
`frame-update`, `frame-draw`, `ui-callback`, `shutdown`, `deployment`.
Candidate codes include `UNSUPPORTED_API`, `WEB_COMPILE_FAILED`, `ASSET_MISSING`,
`STARTUP_FAILED`, `FRAME_EXCEPTION`, `PREVIEW_PROGRESS_LOST`. Preserve causal and
cleanup errors; do not replace them with a generic failure. Cancellation and
offline status are distinct from failure.

Local records may retain the useful path, source line, message and stack. Remote
events must be constructed separately from a fixed allowlist; never send a local
diagnostic object wholesale. Include framework/profile/adapter version, environment
family, operation stage, bounded code, outcome and duration bucket. Source/build
identity stays local by default; no project/repository identity is needed for
basic release-rate detection. Do not send source, paths, filenames, resource URLs,
repository URLs, typed text, access tokens or raw messages/stacks by default.

The preview accepts bounded messages only from its exact active frame/origin and
matching run generation/build identity. A stale frame cannot fail a newer run.
Untrusted game messages cannot invoke editor commands, access credentials or
publish. The isolated preview remains untrusted even when it reports ready.
Test forged origins/messages, oversized payloads, duplicate failures, reload,
Stop/restart races and disposing the panel. External browser play needs a separate
signal path; the editor cannot assume an open external tab is still running.

## PostHog and Clarity

Recommendation: evaluate **PostHog as the primary optional operational sink** for
structured build/runtime events, error grouping and release trends. Clarity may
be useful later for website usability. Avoid introducing both to solve the same
error-detection requirement.

| Need | PostHog | Clarity | Zero still supplies |
| --- | --- | --- | --- |
| Compile failure before app exists | Explicit event from editor/CI if collection is enabled | Browser snippet cannot observe local compiler | Stage/code, local diagnostic and CI gate |
| Browser runtime exceptions | Error Tracking and explicit exception capture | JavaScript error insights on instrumented sites | Adapter hooks, lifecycle context, repro |
| Release regressions and alerts | Structured events, issue/spike/trend alerts | UX/error segments, supplementary investigation | Version/profile tags, success denominators and thresholds |
| Website confusion/navigation | Product events and optional replay | Heatmaps, smart events and session replay | Meaningful actions and content boundaries |
| Canvas-game correctness | Error/events can reveal failures; replay alone cannot prove game state | Cannot render inside canvas or third-party iframe | Real gameplay assertions and explicit state milestones |

PostHog supports [automatic/manual exception capture](https://posthog.com/docs/error-tracking/capture),
[release-aware source maps](https://posthog.com/docs/error-tracking/stack-traces)
and [alerts](https://posthog.com/docs/error-tracking/alerts). Its
[collection controls](https://posthog.com/docs/privacy/data-collection) allow
opt-in capture, restricted events and filtering. Exception capture normally
contains messages/stacks; it cannot be enabled wholesale for student apps under
the bounded remote schema above. Prefer explicit sanitized events first, with
their own grouping/trend/alert rules; ordinary captured events do not automatically
become Error Tracking issues. A later
raw-error/source-map experiment needs its own disclosure and source-handling
decision. Do not assume GWT Java source symbolication works: prove it on the exact
toolchain, and keep source maps/student source local unless deliberately shared.

Clarity supports [custom events](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-api)
and JavaScript error investigation, but its
[FAQ](https://learn.microsoft.com/en-us/clarity/faq/) identifies canvas/third-party
iframe replay limits. Neither service observes native Java or compiler failures
without instrumentation. Neither automatically follows the Zero website into
student-owned GitHub Pages sites.

Keep editor, Zero website and student-hosted app channels distinct. Do not
silently inject replay/analytics into every published student game or identify a
student with GitHub credentials. No recording/autocapture/person profiles on the
initial diagnostic path. Field collection is a deliberate product capability
with an off switch, documented scope/retention, bounded volume and tested SDK
configuration. Disable implicit URL/referrer/IP/DOM properties at the capture
boundary as applicable; test emitted payloads, not only visible custom properties.
Network/service failure must not block Run or change a game. Use local deduplication,
rate limits and bounded buffering. Service setup, keys, alert destinations and
external data collection are not activated by this design task.

## Smallest delivery sequence and alert rules

First implement the signature/evidence matrix and failure-injection browser
tests. Then ship truthful local preview status and debounced saved-source checks.
Only then pilot a sanitized PostHog sink using maintainer-owned examples; decide
broader field collection after payload/overhead/opt-out evidence. Preserve the
existing CI selector's conservative behavior for unknown/framework/shared changes.

CI failures appear as required check failures with retained diagnostics. Optional
operational alerts group by framework/profile version, stage/code and environment,
with one deduplicated incident for a new reproducible supported-API regression.
For rates, capture matching allowed success/failure outcomes and exclude explicit
cancel/offline cases. Choose minimum sample/rate thresholds during the pilot;
no arbitrary percentage is presented as a proven quality gate. Separate new
issue, volume spike and missing-signal conditions. Missing telemetry never means
healthy. A field alert leads to local reproduction and a regression test before
a release fix, not an automatic engine patch or library update.

Acceptance intentionally injects an unsupported call, real WebFX compile error,
missing asset, startup exception, update/draw exception, UI handler exception,
unhandled promise, stale preview message and unavailable collector. Verify the
correct local status/code, retained previous build, useful source diagnostic,
no secret/source leakage and expected deduplication. Valid App, paused game,
background tab and restart flows must stay free of false failures.
Also verify UI-only ready without a frame, menu suspension/resume, controls/HUD
that keep gameplay active, and two level/controller swaps through the same Main
callbacks. No additional gameplay-screen class is needed for these checks.

## Version and preservation evidence

Apply the [version policy](FRAMEWORK-ARCHITECTURE.md#project-versions-and-preservation)
to every compatibility/build result: bind it to the project's recorded framework,
profile/build kit and library pins, not merely the installed editor. An unavailable
historical kit is a tooling/availability result, not evidence of a student API
error or permission to upgrade automatically. Existing validation currently uses
the installed exporter; project-bound selection is future work.

Current-line CI uses a small fixed set of representative projects for same-major
compatibility and one real archive restore/rehost/rollback proof at release
acceptance. It does not continually build every old release. Assert that an editor
update leaves old inputs/pins unchanged and that preserved static output plays
without Zero services. Check archive provenance and retained dependency bytes;
hashes/URLs alone do not establish recoverability. No service telemetry replaces
these tests or promises indefinite old-version support.
