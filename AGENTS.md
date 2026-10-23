# Zero

Read `.ai/CURRENT.md` and `docs/PRODUCT.md` before changing code. Read
`docs/DEVELOPMENT.md` for commands and verification when it exists.
Use `docs/AI-WORKFLOW.md` for bounded delegation, independent review and durable
handoffs. Keep CURRENT short; archived phase records are not active instructions.
Use the Zero Dev loop in `docs/DEVELOPMENT.md` by default for local UI/framework
work; read `docs/FAST-DEV-FLOW.md` when planning CI or release-workflow changes.
For UI work, start with `design.md`, then read the canonical
`docs/UI-UX-GUIDELINES.md`. Preserve approved designs; shared light/dark playground
proposals require owner review before production visual changes.
The remembered website preferences in `design.md` are continuing owner defaults;
preserve them in future UI work unless the owner asks to change them.

- Zero is a local Java teaching kit: a VS Code extension/profile and a small
  JavaFX library. Preserve ordinary Java and explicit object updates.
- Target normal student games/apps to Zero packages almost entirely, with JavaFX
  underneath and an explicit advanced interoperability path. Follow the proposed
  docs/FRAMEWORK-MODEL.md and docs/FRAMEWORK-RELIABILITY.md; do not claim new
  facades, background checks or telemetry are implemented before their proof.
- Keep the planned model simple: GameApp extends App and owns gameplay callbacks,
  canvas/input/camera; Screen is optional UI, World an optional actor container.
  No public GameScreen. Preserve component replacement and one explicit update
  owner while separating menu navigation from live HUD/control composition.
- Student-led framework evolution is a core goal: build, extract, share through
  ZeroHub, reuse/improve, and propose proven ideas for Zero core. Design public
  extension points so students can add or replace components without patching
  canonical helper source. Follow docs/FRAMEWORK-ARCHITECTURE.md; distinguish its
  planned contracts from implemented APIs and existing publication gates.
- The default teaching path must support native JavaFX and real WebFX browser
  output playable on GitHub Pages. Validate the pinned browser subset while
  designing extensions; native success alone does not establish portability.
- Students own their GitHub repositories and submit links separately in Pika.
- Preserve projects on exact framework/build-kit and library releases independently
  of editor updates. Follow the planned version/preservation policy in
  docs/FRAMEWORK-ARCHITECTURE.md: optional reversible upgrades, immutable archives
  and playable output, one maintained current line rather than old-version branches.
  Do not claim the new release-lock/archive flow is already implemented.
- Never publish, push, deploy, or alter account credentials without explicit
  user authorization. Student GitHub actions default to live through explicit commands and guarded plans;
  optional simulation remains available for testing. Tutorials require students to create their own repository from the
  matching template and clone it; local running works offline after that setup.
- Keep the option-2 sidebar minimal. Use supported VS Code extension APIs.
- Preserve readable source and useful errors. Run the relevant checks; report
  untested operating systems and interactive flows accurately.
- Keep public API documentation synchronized with additions, removals, renames
  and behavior changes in the same PR. Update `student-template/API.md`,
  `student-template/APP-GUIDE.md`, website API metadata/examples in
  `website/lib/api-reference.mjs`, and the relevant API coverage tests. Run the
  API-reference checks and verify the website `/docs` entry reflects the change.
  Distinguish local/PR documentation updates from a published website update.
- One writer per component. Coordinate shared contracts before edits. Keep
  dependencies pinned and generated files out of Git.
