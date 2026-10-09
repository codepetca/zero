# Curated beginner examples: verification and integration

From the repository root:

```sh
python3 student-template/examples/hello-app/checks/verify.py
python3 student-template/examples/reach-the-coin/checks/verify.py
npm run check
git diff --check
```

The Hello verifier copies Main and its stylesheet to the exact documented
destinations in a temporary standalone starter folder whose path contains
spaces. The starter's pinned wrapper compiles and runs a finite native JavaFX
window harness. It checks blank/whitespace input, trimmed greetings, the Enter
action handler, reset, a second greeting, computed CSS colours/fonts, initial
layout containment, hover/pressed/focus/disabled appearance, and disabled button
behavior. A second clean build with the stylesheet absent proves the useful
startup error. The original default quiz source remains byte-identical.

Interaction tests fire JavaFX actions and set CSS pseudo-class states
synthetically; they do not prove physical keyboard/mouse delivery or focus
traversal. Actual native canvas/control snapshots are written to ignored
`.verification/hello-app/` and `.verification/reach-the-coin/`. Temporary project
classes are deleted; the checks add no runtime/test dependencies to the starter.

## Local evidence — 2026-10-09

macOS arm64 / OpenJDK 17.0.14 / pinned JavaFX 21.0.12 and Maven 3.9.11:
both example builds and finite native-window checks pass. Visually inspected
Hello's initial/greeting views and the game's winning canvas render: typography,
spacing, feedback and buttons fit the configured sizes. The game uses one
palette and reusable heading/body fonts; movement, bounds, touching contact,
frozen win state and two restarts still pass.

Manual/native keyboard/mouse interaction, real Tab focus traversal, Windows/Linux
execution, VS Code Run/Stop, and novice classroom trials remain untested. The
existing standalone Java process could not be selected by the computer-use
tool, so native canvas snapshots are rendering evidence rather than a manual
play claim. Check Tab/Space/Enter and every control state on a real student
machine before classroom rollout. No third-party font or artwork is bundled.

## Integration boundary

The new guides are `student-template/BEGINNER.md` and `student-template/STYLE.md`.
API.md and README.md link them and introduce a small two-track starting set;
the full API reference remains intact. Hello's only student code is Main plus
the editable classpath stylesheet. Reach the coin remains Main plus Player.
No framework, dependency, default quiz, lesson, release, packaging, website or
shared handoff files changed. Its local companion [game receipt](../../reach-the-coin/checks/README.md)
records the original game base and rules checks.

The website's maintained-doc registry needs `beginner` and `style` entries for
these new guide files when the website owner integrates them. Its source-example
links intentionally refer to the downloadable starter. This chat's edits have
not been pushed, merged, deployed or included in a new downloadable release.
Review the small API/README insertion against later edits in other branches;
do not replace their current whole-file contents with this older base.

Orchestration: one default-configured native helper wrote the two guides; the
coordinator inspected the files, built both examples and owned all acceptance.
DeepSeek remained paused. Start weekly allowance 40% remaining, account-wide;
task-attributable usage and effective model/effort telemetry are unknown.

Independent review `curated_toolkit_review/1` inspected the complete 15-file
delta `db78f4a` → `3086f17acb2777e1c64c1b3ae334623e47d9e721`, checked canonical
lifecycle/API contracts, and independently passed both native verifiers, the
missing-stylesheet check, 39 local documentation references and whitespace.
Verdict: approved, no actionable P1/P2 findings. One fresh default-configured
reviewer, one wave, no remediation or integration conflicts; no extra full-suite
wave needed for isolated student docs/examples. Guide writer and reviewer both
completed their bounded scopes; the coordinator verified their files/evidence.
Coordinator start was 18:54 UTC; acceptance around 19:02 UTC (roughly eight
minutes including coordination/review, not token/cost telemetry). The later
receipt-only delta was inspected by the coordinator. Physical-input/platform
limits above remain unchanged.

## Website integration — 2026-10-09

Owner requested integration and publication of the guides on the website.
Merged current `origin/main` at `4565c03` into this branch without conflicts;
the newer learning hub, lessons, release tooling and published 0.5.1 metadata
are preserved. Registered `/docs/beginner` and `/docs/style`, linked them from
Learn and Docs, and exposed both examples with exact Java/resource destinations.
Hello's complete CSS is included in its example and allowlisted source views.
Older downloaded starters can use the online source; no published kit bytes
are rebuilt or replaced by this website/source integration.

Both pinned-wrapper verifiers, root configuration/links/whitespace, website
typecheck, all seven website tests and production build pass. The four new
guide/example pages render in production HTML. Actual local browser checks
confirmed Learn → beginner, app-section expansion, beginner → style and
stylesheet-section expansion. Manual JavaFX input and platform limits remain
as recorded above. Unrelated primary-checkout funding edits stay untouched.
