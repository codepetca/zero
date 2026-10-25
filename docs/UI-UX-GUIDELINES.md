# Zero UI and UX guidelines

This is Zero's canonical interaction and accessibility standard. It adapts
RESPMax's HIG-informed guidance to a local Java teaching kit, its website,
VS Code extension and native setup. It is guidance, not an audit or a claim that
existing screens satisfy it.

[Product](PRODUCT.md) defines behavior and teaching boundaries;
[selected website design](design/WEBSITE.md) defines the approved visual target;
[Development](DEVELOPMENT.md) defines commands and verification. These take
precedence over imported patterns. **MUST** marks a requirement; **DEFAULT**
marks a preferred pattern with documented, task-specific exceptions.

## Preserve Zero's product and surfaces

- MUST label the current MVP support as **Mac with Apple Silicon** and
  **Windows**. Linux and Intel Macs are unsupported in this MVP. Universal
  artifact architecture or retained cross-platform source is not a support claim.
- MUST offer Windows alongside Mac in download choices. The owner authorized the
  unsigned Windows installer preview and its matching **Manual setup (ZIP)**
  secondary link on 2026-10-19. Keep the unsigned warning visible and both primary
  buttons centered. Release metadata determines availability. Distinguish the Windows support
  target from physical Windows verification, which remains pending.

- MUST retain ordinary Java/JavaFX controls and explicit student-owned state.
  Main updates and draws objects explicitly; UI polish does not authorize a new
  component engine, automatic object discovery or a hidden state system.
- MUST keep local Run independent of an active GitHub sign-in. Tutorials require
  initial setup from a student-owned template repository and clone; after that,
  Run works offline once compiler dependencies are cached. Original local projects
  do not acquire a GitHub requirement. Students own their
  repositories and submit links separately in Pika. Connecting a repository,
  copying its link, uploading a branch and completing main are distinct states.
- MUST preserve the owner-approved home page: shared app header, Learn Java,
  Starting from zero. and direct Mac Silicon and Windows download actions. Keep the
  centered stack and shared light/dark themes without promotional sections.
  GitHub development connection belongs in downloaded Zero's welcome, using the
  supported `zero-github` provider and native editor controls. Current local source
  uses GitHub browser authorization for new connections, with no code-sign-in
  option. The primary Start Page action says **Sign in to GitHub** while signed
  out and **Start tutorial** after sign-in; tutorial creation stays disabled until
  access is ready. Activation and published downloads remain separate. Download/browse/Play require no sign-in; optional ZeroHub stars use
  the same Codepet-owned App with a separate browser credential family. There is
  no separate Zero password/account or automatic browser/editor pairing.
- MUST keep the option-2 sidebar minimal and use supported VS Code APIs.
  Follow the editor's established controls, theme colors, keyboard behavior and
  supported authentication/account flows. Retain light and dark editor support.
- MUST distinguish the unreleased shared-App source from available downloads.
  Codepet Zero is registered and its public IDs are pinned, while live acceptance,
  production activation and an authorized native release remain pending. Do not
  show a working connection or claim live provider acceptance from registration
  or mocked checks. Browser sign-in stays disabled without server credentials.
  Published kits keep their bundled behavior. See [the identity plan](ZERO-IDENTITY-PLAN.md).
- MUST recommend selected repositories, with automatic access to App-created
  repositories. Never silently request all-repository access. Collect scaffold,
  repository name and location before creating/cloning a public repository;
  Create a repository for an existing original local project collects a name,
  explains that subsequent pushes make its source and included files public,
  then creates an empty public
  remote and connects it without pushing. Existing/cloned repository visibility is unchanged.
  Preserve the account/destination review and recovery link after an uncertain
  creation, and preserve partial clone folders.
- MUST describe Sign out as disconnecting only Zero on this computer; preserve
  local work and other extensions' accounts. Desktop credentials use VS Code SecretStorage
  and guarded transient transport, without password/token entry forms. General
  Source Control and terminal network commands do not automatically share it.
- MUST not call the one-App browser user token star-only: it can carry installed
  repository permissions. Keep browser/editor credentials separate, explain
  reconnection when needed and do not claim indefinite browser login. The current
  browser policy is eight hours. Explicit Publish sets up a missing Pages site
  after GitHub permission approval; preserve existing sites and source visibility.
  Stock helper updates join the ordinary commit review; active build locks stay protected.
- Reuse [editor components](../design/EDITOR-COMPONENTS.md) for buttons, split
  actions and dropdowns. The sidebar is the dropdown visual reference. Keep
  shared styles and source-backed prototype states together; avoid a new
  screen-specific copy of an existing pattern.
- DEFAULT to platform controls in native setup and JavaFX examples, and semantic
  HTML controls on the website. HIG informs hierarchy and ergonomics; native
  iOS navigation, pickers and visual chrome are not a universal Zero design.

## Decisions, hierarchy and language

- MUST preserve the owner's [current interaction rules](../design.md#current-interaction-rules):
  direct routine actions, guarded automatic local-branch cleanup, one short
  first-publication warning, no success popups, and brief sidebar results with
  longer details in Zero Output. Keep required decisions, warnings and useful
  follow-up actions available.
- MUST name actions by their result: Run App, Stop, Download Zero or Copy
  Repository Link. DEFAULT to one visually dominant action per decision region.
  Preserve secondary actions and explain unavailable actions where necessary.
- MUST show the facts needed before acting: affected project, destination,
  branch/version and consequential changes when relevant. Explain unfamiliar
  Java, Git or setup terms in plain language at their point of use.
- MUST keep critical availability, prerequisites, simulation labels and warnings
  visible. DEFAULT to optional details for technical logs, long reference text
  and advanced explanations; disclosures must never hide an action's consequence.
- DEFAULT to clear reading order, restrained headings, short paragraphs and
  generous spacing. Reuse approved tokens and patterns rather than casually
  adding colors, component variants or a general-purpose UI dependency.
- Lesson interfaces show the full numbered actions, explanations and copyable code
  directly. Avoid duplicate short summaries or Done checkpoints. Completed
  Compare your code references may use disclosures. Readable source and useful
  errors remain part of the learning experience.

## State, feedback and recovery

- MUST distinguish pending, empty, unavailable, failed and completed states.
  Describe an error as the condition, its consequence and a concrete next step.
  Technical details may expand below an understandable summary.
- MUST preserve entered values and student work on Back, disclosure changes,
  cancellation and recoverable errors. Reset only incompatible state and explain
  that reset. A failed operation must accurately describe any completed portion,
  such as a local commit remaining after a failed push.
- MUST associate form errors with the relevant control, retain its value and
  offer specific correction. Unknown, blank and an explicit zero are distinct.
- MUST prevent duplicate consequential submissions while pending. Show progress
  without implying that downloading, building, checking or uploading has finished.
- MUST report success only after the authoritative operation is confirmed.
  Simulated uploads say nothing was uploaded; local demo identity is not GitHub
  authentication. Download availability follows verified release metadata.
  Prototype controls label simulated saves/checks rather than presenting fake
  success. Use [Product](PRODUCT.md) for the exact operation contracts.

## Keyboard, semantics and focus

- MUST support keyboard and pointer interaction; website actions also support
  touch. Essential content cannot depend on hover, swipe or long press alone.
- MUST use headings, links, buttons, labels and disclosures with their correct
  semantics. Icon-only controls need accessible names; decorative icons are
  hidden from assistive technology. A tooltip is not the sole action label.
- MUST keep focus visible and unobscured. Move it intentionally after major
  transitions and restore it when a temporary dialog or picker closes. Preserve
  normal text editing and keyboard behavior; canvas input must not steal typing
  from JavaFX text controls.
- MUST expose expanded state and associate help/errors with controls. Announce
  asynchronous results deliberately, using appropriate web live regions or
  native/editor accessibility APIs; avoid announcing every static notice.
- DEFAULT to native input, selection and disclosure behavior. Preserve browser
  autofill where appropriate and use supported host APIs for editor interactions.

## Responsive web and visual accessibility

- MUST support the website at 320 CSS pixels wide without page-level horizontal
  scrolling or lost actions/information. Content genuinely requiring two
  dimensions, such as code or a diagram, may use a contained scrolling region
  consistent with [WCAG reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).
- MUST support 200% text enlargement and reflow at 400% browser zoom where
  applicable. Wrap or stack controls and let content scroll vertically; do not
  shrink essential text, clip overflow or impose a wizard-style no-scroll rule.
- DEFAULT to web primary actions and sequential form controls with targets at
  least 44 by 44 CSS pixels. This is a Zero usability preference. WCAG 2.2 AA
  [target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
  is 24 by 24 CSS pixels with defined spacing, equivalent-control, inline,
  user-agent and essential exceptions. Document exceptions rather than claiming
  every inline link needs a 44-pixel box.
- DEFAULT to mobile text-entry font sizes of at least 16 CSS pixels to reduce
  unexpected iPhone input zoom. Preserve user zoom and check the software
  keyboard path. Respect safe areas where content reaches device edges.
- CSS pixels are web layout units, not physical pixels or Apple's native
  points (pt). Apply native platform sizing conventions to installers and
  JavaFX, and editor conventions to VS Code; do not impose mobile web target
  dimensions on every editor toolbar control.
- MUST meet applicable [WCAG 2.2 AA](https://www.w3.org/TR/WCAG22/) contrast:
  ordinarily 4.5:1 for text, 3:1 for large text and relevant non-text UI indicators.
  Evaluate rendered combinations and applicable exceptions. Status cannot rely
  on color alone; include text or another meaningful cue.
- MUST honor reduced-motion preferences and keep critical meaning available
  without animation. DEFAULT to restrained transitions explaining state changes,
  using existing styling before adding a motion library. Animation must not
  delay errors or impede learning controls.

## Verification when changing UI

Use the relevant commands in [Development](DEVELOPMENT.md), then inspect affected
states in the real surface. Website review covers 320px, an ordinary phone width
and desktop, keyboard/focus, text enlargement, disclosures and error recovery.
Check mobile Safari/WebKit and a desktop browser where available; report missing
engine/device coverage. Native and editor work requires host-appropriate checks,
including theme and focus behavior, rather than a browser-only verdict.

Record routes/surfaces, viewports, tested states and evidence. Code inspection,
automated accessibility checks and screenshots each cover only part of usability;
none alone proves WCAG conformance or an authenticated operation. Report actual
OS and interactive-flow limits. Fix the cause of failures rather than weakening
the rule or silently accepting a new screenshot baseline. This standard does not
authorize publication, account changes or live uploads.

## Adaptation provenance and sources

Adapted on 2026-10-12 from
`/Users/stew/Repos/respmax/docs/ui-ux-guidelines.md`. RESPMax HEAD was
`448da16009ba82155e07b1f479e078c660511acf`; the source file had uncommitted edits.
The read working-copy SHA-256 was
`62bc4ac51b87d47361c28ee7bef9a0b91c3dcc447ad2658275b8bdca142e7a31`.
Adapted sections: How AI uses this standard; generic Decision hierarchy rules;
generic Forms, feedback, and recovery rules; Mobile-first layout and interaction;
Visual fundamentals; Motion; disclosure semantics from Tap-to-define; generic
Shared implementation policy; prototype honesty; Verification contract
(approximately source lines 228–597).

Excluded RESPMax financial/calculation rules, household/account/billing/paywall
policies, paper/green theme, wizard-only screen-fit policy, money/date field
contracts, project-specific component paths, previews and pnpm commands.
This adaptation preserves Zero's approved product/design and verification scope.

Primary references:

- [Apple HIG: Layout](https://developer.apple.com/design/human-interface-guidelines/layout)
  and [Motion](https://developer.apple.com/design/human-interface-guidelines/motion)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/),
  [Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html),
  [Target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html),
  [Focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)
- [VS Code extension UX guidelines](https://code.visualstudio.com/api/ux-guidelines/overview)
