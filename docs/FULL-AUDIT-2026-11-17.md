# Zero product and architecture audit

Audit date: 2026-11-17, America/Toronto. Reviewed the working copy on
`codex/jam-page-themes`, based on `6bdcfa7cc8e4ba7282d11aa2b3c9bf09844adc40`.
The checkout already contained substantial uncommitted changes. Findings apply
to those working files, not necessarily the published website or installed kit.

Zero has a coherent visual direction and a strong framework foundation. The
highest-value next work is to repair browser-export boundaries, make operation
outcomes consistent across UI layers, and close gaps in the verification path.
Preserve the approved home, reader, sidebar and ordinary-Java model. A broad
visual or framework rewrite is not justified by this audit.

## Scope and evidence

Three bounded read-only workers inspected framework/build tooling, editor
workflows, and website/services. The coordinator inspected current browser
screens, checked the strongest source claims, reran the failing test group and
reproduced both export defects. Product implementation was unchanged during the
initial audit; the execution tracker below records subsequent local remediation.

The review covered the Java framework, project-owned builder, API documentation,
extension command and webview boundaries, website navigation and API search,
ZeroHub listing management, service concurrency, and repository verification
structure. Setup, release and CI contracts were inspected selectively; this is
not exhaustive execution of every installer, updater, API route or security path.

Current screenshots and logs are local ignored evidence in
`../.verification/full-audit-2026-11-17/`. Its local `report.html`
contains all eleven captures in order. Filenames containing `mobile` identify
narrow-window captures, not verified mobile-device or 320 CSS-pixel acceptance.
The browser override did not reliably apply the requested CSS viewport; the final
measured narrow inspection was 520 CSS pixels at devicePixelRatio 0.75. True
320px reflow was subsequently verified during remediation, as recorded below.
200% text and 400% zoom remain acceptance work. See `reflow.json` and
`browser-limits.json` beside the original captures.

The actual VS Code surface exposed only the application shell. Editor screenshots
therefore use production renderers inside the documented playground, with
simulated host colors/actions. They do not establish native editor acceptance.

## Prioritized findings

P2 means a concrete defect or material engineering risk to address in the next
relevant work. P3 means maintenance or clarity work. No P0/P1 finding was
established within this coverage; this is not a security certification.

| ID | Priority | Finding | Confidence |
| --- | --- | --- | --- |
| A1 | P2 | Case aliases can overwrite generated browser files | High; reproduced on this Mac |
| A2 | P2 | Browser entry discovery rejects ordinary Java inheritance | High; adapter reproduction |
| A3 | P2 | Evidence regression test fails outside the normal test entry point | High; coordinator rerun |
| A4 | P2 | Start Page inline retry cannot observe registered-command failures | High; integrated source contract |
| A5 | P2 | Publish and open checks unrelated dirty editors | High; source contract |
| A6 | P2 | Listing changes and refresh failures are conflated | High; source contract |
| A7 | P2 | Compatibility snapshots repeatedly buffer unbounded resources | Medium-high; no stress measurement |
| A8 | P2 | Pinned Next.js predates published security fixes | High for dependency gap; exploitability unproven |
| A9 | P3 | API search cannot distinguish several overloads | High; visible capture and source |
| A10 | P3 | Static evidence summaries describe an older inventory | High; current inventory differs |
| A11 | P3 | Maintainer website instructions describe the retired creation flow | High; conflicting current docs |

### A1 Case aliases can overwrite generated browser files

[Resource validation](../extension/src/web-export/index.js#L430) compares
`index.html`, `zero_web.nocache.js` and reserved directories case-sensitively.
[Project generation](../extension/src/web-export/project.js#L136) writes the
generated page before copying resources. On this Mac's case-insensitive
filesystem, generating with a resource named `INDEX.HTML` replaced
`public/index.html` with the resource's bytes. Native Run is unaffected, so a
student can encounter a surprising browser-only failure.

Validate case-folded resource paths against generated files, reserved directory
prefixes and each other before writing. Reject aliases with a useful resource
diagnostic and preserve the prior export. Acceptance includes `INDEX.HTML`,
`Zero_Web.NoCache.Js`, and directory/file collisions on an actual
case-insensitive filesystem, plus ordinary distinct resources on Linux.

### A2 Browser entry discovery rejects ordinary Java inheritance

[The adapter](../extension/src/web-export/adapters/index.js#L197) selects a class
only when its immediate superclass token is literally `GameApp`, `App` or
`Application`. Both `Main extends zero.GameApp` and an abstract `Base extends
GameApp` followed by `Main extends Base` report zero applications. These forms
are valid ordinary Java and matter to student-owned reusable extensions.

Use resolved superclass information from the existing semantic attribution path
and an explicit project entry point where appropriate. Until supported, identify
the limitation specifically. Verify qualified names, abstract intermediate
classes, multiple candidates and configured selection through the actual pinned
WebFX/browser path. The audit reproduced adapter rejection, not a full export.

### A3 A failing evidence test is omitted from normal test registration

[The shared synthetic fixture](../scripts/project-builder-fixture.mjs#L18)
omits root `LICENSE`, now required by
[the builder producer](../scripts/prepare-project-builder.mjs#L59).
`scripts/api-evidence.test.mjs` consequently fails with `ENOENT canonical/LICENSE`
before exercising its provenance assertions.
[The normal test runner](../scripts/test-extension.mjs#L28) does not include
that suite or `scripts/prepare-project-builder.test.mjs`; neither was found in
the inspected workflow registration.

Repair the fixture's explicit producer-input closure and register the two bounded
contract suites through a maintained documented CI/test entry point. Acceptance:
the failing provenance case reaches its mutation/staleness assertions and both
suites run in the normal path. Do not weaken the license or evidence checks.

### A4 Start Page retry loses the command failure

[Start Page dispatch](../extension/src/start-page.js#L127) relies on
`executeCommand()` rejecting to show its action-specific error and Retry.
[The actual registration wrapper](../extension/src/extension.js#L3317) catches
the error, reports elsewhere and resolves. The existing mocked page test can
reject directly, but does not exercise this boundary. Generic failure reporting
remains; the intended inline recovery does not receive the failure.

Give commands a deliberate outcome contract, or expose a shared internal action
handler to both adapters. Keep one owner for user-facing error reporting.
Acceptance must dispatch a failing action through actual registration and verify
inline recovery, preserved input, account-change guards and no duplicate alert.

### A5 Publish and open treats unrelated documents as changed app inputs

[Publish UI](../extension/src/web-publish-ui.js#L126) scans every dirty editor
and invokes workspace-wide `saveAll(false)`. The
[final open guard](../extension/src/web-publish-ui.js#L96) again rejects any dirty
document. An unrelated untitled note is excluded from that save operation and
can still block opening a successfully deployed app with the false message that
the app changed. Other unrelated files can also be saved unnecessarily.

Scope dirty-input checks and saves to the selected project's relevant build
inputs. Preserve the final synchronous source/session guard. Acceptance covers
an unrelated untitled note, a dirty file in another workspace folder and an
actual changed build input; the last must still prevent opening stale output.

### A6 Listing updates conflate applied changes and failed refreshes

[Listing management](../website/components/HubListings.tsx#L39) handles POST and
the following GET in one try/catch. If POST succeeds but GET fails, old cards
remain, actions reenable and the page only says the apps could not be loaded.
Removal, protection or queue replacement may already have happened.

Separate mutation outcome from reconciliation. Preserve confirmed applied
results, distinguish uncertain dispatch, and provide refresh/reconciliation while
preventing misleading actions against stale cards. Acceptance uses successful
POST plus failed GET, a lost POST response, account changes and successful retry.
The local signed-out UI could not exercise authenticated management.

### A7 Compatibility snapshots buffer all resources without bounds

[Resource traversal](../extension/src/web-export/snapshot.js#L20) reads every
file into memory without project asset count/size limits or traversal cancellation.
[Cached compatibility](../extension/src/web-export/compatibility/cached-project.js#L25)
captures before and after checking; the standalone builder also captures inputs.
An accidentally copied large media folder can cause repeated I/O and memory use
during compatibility checks even though attribution concerns Java.

Define useful input limits and propagate cancellation through traversal. For
identity-only work, stream resource fingerprints rather than retaining redundant
buffers. Preserve exact-byte binding and race/change checks. Verify a bounded
oversize fixture, excessive-file fixture, cancellation and unchanged-source cache
behavior. No large-file performance measurement was performed.

### A8 Next.js needs a reviewed security patch update

[Website dependencies](../website/package.json) pin Next.js 16.4.2. During local
startup it warned about a known vulnerability and stopped once; the documented
retry started the server. The official
[16.4.5 release](https://github.com/vercel/next.js/releases/tag/v16.4.5) lists seven
moderate security fixes. Zero-specific exploitation was not established; several
advisories depend on particular cache, image, runtime or hosting configurations.
An offline npm audit returning zero does not clear newer advisory exposure.

Update the pinned dependency and lockfile in an isolated, reviewed change after
checking advisory applicability and current patch guidance. Run website tests,
typecheck, production build and runtime/bundle checks, including authentication
and caching regressions. No upgrade or account/configuration change was made.

### A9 API search results obscure overload differences

Capture 05 shows four identical `setImage()` results, each labeled
`Actors · Actor`. [Search rendering](../website/components/ApiReference.tsx#L172)
uses [the name-only label](../website/components/ApiReference.tsx#L39), with one
special case for scaled images. A beginner must open results individually to
discover whether they take a sprite, region, animation or source.

Use a short parameter-type signature in search results and accessible link names,
with wrapping that preserves the approved sidebar. Keep category and owner.
Verify distinguishable overload links using keyboard and screen reader, narrow
reflow and unchanged deep-link targets. This is a focused information change,
not a proposal to redesign the reference page.

### A10 Static evidence summaries are stale

[The evidence README](../framework/evidence/README.md#L3) and
`framework/evidence/coverage-gaps.json` still describe 183 declarations and 366
targets. The current semantic inventory/API parity is 194 declarations and 388
targets. The README also presents execution as pending while dated product
records describe later real runs.

Generate inventory summaries from the current manifest and keep execution
receipts explicitly tied to revision. Distinguish a report invoked without
receipts from proof that no execution occurred. Acceptance: a cheap parity check
and one clear route to current and historical proof. This finding does not assert
that retained executed receipts are missing.

### A11 Website maintainer instructions describe an older tutorial flow

[Website README](../website/README.md#L23) directs starting lessons through
GitHub template creation and Clone. Current
[tutorial authoring guidance](TUTORIAL-PLAN.md#L51) and current lessons use
Project → New. Correct the maintainer guide and label released-kit differences
explicitly. Verify against generated lessons and visible editor labels; do not
rewrite the current tutorial path to match stale prose.

## Design walkthrough

| Step | Surface and capture | Health and finding |
| --- | --- | --- |
| 1 | Home, 01 | Coherent approved hierarchy, direct platform downloads and persistent legal links. Download/install behavior not exercised. |
| 2 | Tutorial reader, 02–03 | Clear numbered instructions and prominent shortcuts; narrow layout uses the lesson selector. True 320px/zoom and Windows shortcut interaction remain unverified. |
| 3 | API reference and search, 04–05 | Clear content hierarchy and visible search focus. Overload labels need A9. No screen-reader or contrast certification. |
| 4 | Public ZeroHub, 06 | Honest catalog-unavailable state and Retry. Local missing configuration is not evidence of a production outage. Narrow navigation consumes substantial vertical space. |
| 5 | Account menu, 07 | Documentation-platform choice and theme action are available; Escape dismissed the menu and focus remained on its trigger. Browser sign-in was unavailable locally. |
| 6 | Ready editor components, 08 | Shared controls and host-themed hierarchy are visibly consistent. Simulated renderer evidence only. |
| 7 | Jam discovery, 09 | Local availability and sign-in limits are explicit. The unavailable message invites proposal preparation without a direct action in that state; review recovery copy when activating the service. |
| 8 | Signed-out editor, 10 | Matches current owner-recorded gating. Start Page Docs/Project are intentionally gated; local sidebar Run remains available. |
| 9 | Busy/high-contrast editor, 11 | Busy controls are disabled and pending activity remains visible. Actual host focus, contrast and assistive technology remain unverified. |

The local development overlay visible in some captures is not product UI.
Narrow Hub navigation could use a more compact presentation shared with the
reader's mobile navigation, preserving the approved selected-section submenus.
Treat that as a playground proposal for owner review, not an automatic production
visual change. Test it against real catalog content before accepting it.

## Structural recommendations and delivery order

1. **Repair browser safety and the verification path: A1–A3.** Keep validation
   before writes and export preservation intact. These are bounded changes with
   concrete regressions. Entry-point acceptance requires real browser proof.
2. **Unify action outcomes: A4–A6.** Separate orchestration results from UI
   reporting. Use explicit completed, cancelled, failed and uncertain outcomes
   where those distinctions are real. Keep domain-specific trust, source and
   account guards in their owners; do not create a generic privileged executor.
3. **Address dependency and input costs: A7–A8.** Patch dependencies separately
   from snapshot optimization so each change has interpretable verification.
4. **Improve clarity and maintainability: A9–A11.** Ship overload labels and
   documentation/evidence repairs in small independent changes. Keep public API
   metadata synchronized without adding new framework APIs.
5. **Complete acceptance before rollout.** Run the real editor workflow and
   native/pinned-browser fixtures, physical Windows/install/update checks where
   relevant, true 320px and zoom/keyboard/assistive-technology review, authenticated
   GitHub and listing recovery, and a novice walkthrough.

Use these failures to guide extraction from `extension.js`: action orchestration,
command registration/reporting and UI state projection should have explicit
boundaries tested together. Extract one bounded flow at a time. Module size alone
does not justify a broad rewrite, and moving code without fixing the result
contract would leave A4 intact.

The public discovery [concurrency counter](../website/lib/hub-listings-http.mjs#L17)
is per module/process, not a fleet-wide provider limit. Operations guidance already
acknowledges per-instance limits. Before classroom-scale activation, measure
multi-instance demand and enforce shared or provider-level quotas with honest
backpressure and retry. This is a rollout capacity gate, not an observed outage.

Keep `.ai/CURRENT.md` focused on current scope and links to dated receipts; move
completed phase histories to the established archive. Design decisions should
retain their provenance, while current normative rules and implementation status
remain easy to locate. Do not create a competing framework roadmap: apply accepted
changes through the existing phased architecture plan.

## Verification and orchestration receipt

### Remediation execution plan

Owner authorized planning and implementation in this chat on 2026-11-17.
This section is the current remediation tracker; the findings above retain their
original audit evidence. Local implementation does not authorize publication,
merging, deployment, account changes or activation of gated services. Approved
visual designs remain in place; broad responsive-navigation changes require a
reviewable playground proposal and owner selection.

| Stage | Scope | Owner and state | Exit condition |
| --- | --- | --- | --- |
| 1 | A1 resource paths; A2 Java entry discovery; A3 evidence fixture/test registration | Implemented and reviewed; resource collision regressions, semantic attribution and registered evidence suites pass; actual qualified/inherited zero-ui WebFX/Chrome passes | Local source verification complete |
| 2 | A4 command outcomes; A5 project-scoped dirty inputs; A6 listing reconciliation | Implemented, reviewed and integrated; actual registration tests, listing request/reconciliation tests and corrected publish-guard regressions pass | Local source verification complete; real editor and authenticated acceptance separate |
| 3 | A7 bounded/cancellable snapshots; A8 pinned security update | Implemented, reviewed and integrated; snapshot/cache/authoring and initial-export cancellation tests pass; Next.js 16.4.6 passes 828 website tests, typecheck, production build, runtime/bundle checks and online production audit | Local source verification complete |
| 4 | A9 overload labels; A10 evidence summaries; A11 maintainer instructions | Implemented and reviewed; metadata/render tests and evidence/builder contracts pass; keyboard search/deep-link behavior and 320px reflow verified | Local source verification complete |
| Acceptance | Integrated local checks, independent review and remaining host-specific coverage | Original local verification recorded two publication-gate failures; Zero Dev smoke, current native evidence and selected pinned-browser fixture pass | Tutorial publication dependency resolved by the November 18 work below; external/device gates remain explicit |

Pre-change working files and hashes are preserved under ignored
`.verification/audit-remediation-2026-11-17/baseline/` and `baseline.json`.
Coordinator owns this tracker and integration. Workers do not stage or commit.
Native/browser gates will be run proportionately; physical Windows, real student
testing and authenticated hosted acceptance cannot be replaced by mocked checks.

Review completed against immutable baseline-to-`candidate-v1` and
`candidate-v1`-to-`candidate-v2` snapshots: Sol/high reviewed correctness and
source authority; Terra/high independently reviewed compatibility and verification.
The initial correctness review found that macOS case aliases escaped the publish
dirty-input guard. `realpathSync.native` fixes canonical filesystem casing while
preserving distinct paths on case-sensitive filesystems. The same correction
batch propagates cancellation into the initial saved-builder read. Regression
witnesses fail against the former behavior; the corrected isolated suite passes
106 tests with one case-sensitive-filesystem skip. Sol/high targeted review
accepted the correction with no remaining actionable findings. Terra's only
nonblocking note was to refresh final handoff status.

The review used 3 launches, 1 initial wave, 1 targeted wave, 1 fix batch and no
additional integration wave; unchanged interactions were covered by the initial
reviews and the four-file correction by the targeted review. This stayed within
the 7-launch/4-targeted-wave/4-fix-batch, 60-minute-session/30-minute-reviewer
ceilings. Full deltas, hashes and `review-ledger.json` are retained under the
ignored remediation evidence directory. Task-specific tokens and effective model
telemetry remain unknown. Weekly allowance was 61% at implementation preflight
and 59% at the latest reading; that account-wide change is not task cost.

Implementation ownership: Terra/high handled resource validation and registered
editor outcomes, then website listing reconciliation and API search; Sol/high
handled semantic application discovery and bounded snapshots. The coordinator
owned integration, project-scoped saves, evidence contracts, dependency patching
and browser acceptance. One writer per component was maintained, including a
coordinated handoff of the shared export entry point. No Git integration conflict
was observed. Coordination included fixed-delta capture, verification and one
review correction batch. DeepSeek remained paused.

### Remediation verification and release dependency

| Check | Result and scope |
| --- | --- |
| Full `npm test`, fixed candidate-v1 | 2,462 passed, 154 skipped, 2 failed; 2,618 tests in about 27 minutes. Both failures are current-versus-published tutorial scaffold assertions. No other failure was reported. |
| Preserved baseline tutorial suite | All 22 passed. The publication mismatch was introduced by the intended builder changes, not inherited from the initial dirty checkout. |
| Reviewed four-file correction, integrated checkout | 106 passed, 1 skipped; the skip requires a case-sensitive filesystem. The actual macOS case-alias witness passes. No second complete full-suite run was performed after this bounded correction. |
| Final `npm run check` and `git diff --check` | Passed configuration, syntax, command contracts, local documentation links and whitespace. |
| Website | 828 passed, 3 skipped; typecheck, Next.js 16.4.6 production build, traced runtime checks and function bundle audit passed. Online `npm audit --omit=dev` reports zero vulnerabilities. |
| Zero Dev smoke | Passed game movement/scoring/win/restart, framework native input/media and 25 Start Page/playground contracts against candidate-v1. |
| Fresh reviewed native candidate | All seven native fixtures passed. Retained receipts were revalidated against the integrated checkout: all 194 native declarations complete. |
| Fresh reviewed browser candidate | Qualified/inherited zero-ui source compiled with the pinned WebFX/GWT toolchain; subsequent actual Chrome checks passed. Current-source receipts cover 37 browser declarations, not the entire browser API. |
| Current tutorial drafts | Four local drafts prepared and matched against every current source file, mode and scaffold digest. No publication records were altered. |
| Current tutorial publication gate | Correctly fails for greeting, study, game and pet because published hashes describe earlier builder bytes. Packaging and release remain blocked. |

The two failures in the original full-suite receipt remain visible. Zero includes the exact
project-owned builder in each tutorial scaffold; fixing that builder changes all
four scaffold identities. The documented development contract requires separately
authorized template publication and refreshed commit/tree/digest records before
packaging. Local proof cannot make an old published repository contain the new
files. Updating expected hashes alone, weakening the gate or claiming the full
suite is green would be incorrect. The next release step is to review the four
prepared drafts, publish them under explicit owner authority, verify actual remote
source, update the corresponding records and inventory expectations, then rerun
tutorial/package gates. That was not authorized during the local-only phase;
the November 18 publication below completes this dependency.

Logs and source snapshots are in ignored
`.verification/audit-remediation-2026-11-17/`. `tutorial-drafts.json` points to the
four local drafts and `tutorial-draft-check.log` records exact-inventory acceptance.
The reviewed browser snapshot initially lacked a local pinned CLI path after
compilation; linking the already installed workspace dependencies and rerunning
browser-only checks passed. The initial missing-CLI attempt is retained as a
failed attempt, not counted as successful browser execution. Earlier workspace
dependency restoration is likewise recorded. No compiler or evidence gate was
relaxed.

Additional verified UI correction: the shared header now reflows at 360px and
below, preserving the approved identity and navigation with 44px targets. The
production build was inspected at measured 320 CSS pixels on `/`, `/learn`,
`/docs` and `/hub`; document scroll width matched client width on each route.
API search distinguishes all four `setImage` overloads, keyboard selection reaches
the unchanged target, and Account Escape returns focus to its trigger. Local
screenshots and measured geometry are in the ignored `ui-review/` evidence
directory. ZeroHub's missing local configuration still shows the unavailable
state; this does not verify authenticated management or live catalog health.

Remaining acceptance before rollout: actual VS Code extension-host interactions,
authenticated GitHub/listing recovery, actual-Postgres concurrency, physical
Windows/install/update behavior, case-sensitive filesystem coverage, other browser
engines, text/zoom and assistive technology, and a novice walkthrough. These do
not block delivery of the reviewed local fixes; they are not claimed complete.

### Authorized tutorial publication — 2026-11-18

The owner subsequently authorized publication of all four updated tutorial
templates, remote verification and refreshed records so the tutorial release
gates pass. This supersedes the prior publication hold only for that scope;
Zero source publication, kit/installer releases and website deployment remain
outside this task.

| Step | Owner and state | Acceptance |
| --- | --- | --- |
| Freeze and prepare | Complete; fresh drafts match all four reviewed scaffold digests | All four old main heads matched their records; no open PR or unrelated remote work was overwritten |
| Review and publish | Complete; independent Sol/high and Terra/high reviews passed; four reviewed template PRs merged | Matching-head merges, public template settings preserved; no template CI configured |
| Remote verification and records | Complete; 97 files per anonymous fixed-commit archive match generated bytes/modes and public Git trees | Four commit/tree/scaffold records and three raw inventory expectations refreshed only after public proof |
| Release gates and handoff | Complete; publication gate, actual VSIX bundle gate and 165 focused tests passed; final independent record review passed | Two original tutorial failures now pass; remaining host/device acceptance is separate |

Terra/high performed a bounded read-only publication-contract check. Canonical
records remain `teaching/tutorial-templates.json`; no digest is stamped from a
local draft alone. Detailed working evidence is ignored under
`.verification/tutorial-publication-2026-11-18/`. Account weekly remaining usage
was 57% at this phase's preflight; task-specific usage and effective model
telemetry are unknown. DeepSeek remains paused.

The publication review used two initial reviewers (Sol/high correctness and
Terra/high compatibility) and one final Terra/high integration review: three
launches, one initial wave, one integration wave, zero remediation waves or fix
batches. All scopes completed with no actionable findings. The final reviewer
independently repeated anonymous metadata and archive verification and confirmed
the frozen records/test hashes. Template heads and source stayed unchanged after
review. All work stayed within the recorded review budget; effective models,
per-turn tokens and exact attributable review costs are unknown.

Published template PRs:
[Greeting #9](https://github.com/codepetca/zero-tutorial-greeting/pull/9),
[Study #9](https://github.com/codepetca/zero-tutorial-study/pull/9),
[Game #9](https://github.com/codepetca/zero-tutorial-game/pull/9), and
[Pet #8](https://github.com/codepetca/zero-tutorial-pet/pull/8).
Canonical fixed commits, trees, repository identities and scaffold digests are in
`teaching/tutorial-templates.json`. The four common patches change only 14
project-owned builder files. Student Java starters and READMEs are unchanged;
the latter retain the supported external GitHub-template/manual Clone entry path,
while current in-Zero lessons retain Project → New.

Verification: 55 builder tests, 39 tutorial/generator tests and 71 editor/kit tests
passed without skips. `npm run check:tutorial-templates` verifies four publications.
A fresh isolated VSIX was unpacked and passed the same
`checkPackagedTutorialTemplates` function used by `verify:kit`, including exact
parity with current generated source and publication records. No immutable
published kit metadata or release assets were rebuilt or changed. The full
27-minute suite was not repeated: its two failing tutorial cases now pass in the
affected suite; unchanged prior coverage remains scoped to its original receipt.

The GitHub connector could not bind guarded merge arguments. Normal GitHub CLI
merges used `--match-head-commit` without admin override after checking live
head/base/check state. Public verification used unauthenticated HTTPS for metadata,
main refs, commit/tree objects and pinned archives; every tar member's Git blob
and executable mode were checked before the canonical directory checker ran.
No gate or account permission was changed. Public verification records fixed
commits and does not promise mutable main will remain unchanged.
Final `npm run check` and `git diff --check` passed.

### Cloud validation and remediation — 2026-11-18

Owner requested an isolated cloud validation task and then orchestration of its
failure correction. Task `6afda992-d9ac-8191-80ec-2c80cf6fd0f7` used a fresh
Default cloud machine. The handoff archive was reconstructed and checksum-verified,
then applied to the exact base; all 1,537 source-file SHA256 values matched before
candidate testing. Saved Default configuration was unchanged.

One product defect was corrected: a Pages metadata observation could exhaust its
elapsed deadline and fail before the timeout callback ran, reporting unavailable
instead of timeout. The catch path now checks elapsed monotonic time, preserving
caller cancellation precedence and all source/identity/admission safeguards.
A deterministic regression failed before the correction and passed afterward.
The reviewed two-file correction was imported into this local checkout only after
both original hashes matched the handoff; both resulting hashes match the green
cloud candidate exactly. All other imported working files were preserved.

| Final check | Result |
| --- | --- |
| Full root suite under task-local child subreaper | 2,458 passed, 163 skipped, 0 failed |
| Website suite | 828 passed, 4 skipped, 0 failed |
| Website typecheck, production build, bundle/runtime checks | Passed |
| Maintained native JavaFX fixtures | All 7 passed; 194 native declarations covered |
| Pinned WebFX fixtures and actual Chrome | All 10 passed; 136 main + 136 mobile assertions passed |
| Current combined API evidence completeness | 388/388 targets across 194 declarations; 0 gaps; independently repeated |
| Tutorial publication and actual VSIX payload | All 4 templates passed each gate |
| Website layouts/navigation/search/keyboard | 16 layouts plus interaction checks passed |
| Local integrated Pages/destination tests | 42 passed, no skips or failures |
| Local tutorial publication gate | All 4 passed |
| Final local configuration/syntax/command/documentation and diff checks | Passed |

An independent fixed-delta reviewer accepted the production/test correction,
ran 44 related checks and probed cancellation precedence and released admission.
Two bounded integration receipt checks repeated the completeness gate and accepted
reported results/limits. A separate process diagnosis confirmed the two unchanged
cleanup tests under a subreaper. Requested reviewer settings were inherited
without override; effective model/effort, per-turn tokens and precise attributable
elapsed times were unavailable. Local integration reused these exact reviewed
bytes and ran affected tests; no redundant review or whole-suite rerun was added.

Other initial failures were environment or external-probe issues: inherited
Node/Maven proxy and Java trust were configured for task-local tools; container
PID1 needed a child subreaper; native fixtures needed the CI-style
Xvfb/Openbox/PulseAudio stack. The WebFX cache was verified against all 1,368
reviewed pins, preserving extras outside it; network-idle and mobile focus
assumptions were corrected in external UI probes. No source assertion,
compatibility contract, gate, credential or security policy was weakened.

Supported cloud runtime: Debian13.6 x86_64, Node24.22.1/npm11.9.0,
Temurin21.0.13+9, Maven wrapper3.9.11, pinned Chrome155.0.8059.12/revision1247.
Mac-specific, PowerShell/platform and actual-Postgres fixtures remain explicitly
skipped. Local catalog unavailable/retry state was exercised; physical devices,
real VS Code hosting, authenticated hosted recovery, other engines,
zoom/assistive technology and novice acceptance remain outside this proof.

Reviewed functional patch SHA256:
`08c6985e45ca44ab8f5279a9dc29a4c8c74a31500dedf09413720201d296bc63`.
Combined evidence report SHA256:
`a5bd8d0561efda3a1c3e384209af2f83a39e93b22e7d491e777e6737730f849f`.
Local ignored source/review/check receipts are under
`.verification/cloud-remediation-2026-11-18/`; the complete evidence bundle remains
with the cloud task. No new push, merge, release, deployment or account change
was performed. Prior published tutorial records remain current.

### Original audit verification

| Check | Result |
| --- | --- |
| `npm run check` | Passed configuration, syntax, command contracts and local documentation links |
| `node --test scripts/prepare-project-builder.test.mjs scripts/api-evidence.test.mjs website/tests/api-reference.test.mjs` | Coordinator rerun: 55 passed, 1 failed, 0 skipped; missing fixture LICENSE (A3) |
| `cd extension && node --test test/start-page.test.js test/sidebar-refresh.test.js test/tutorial-browser.test.js test/student-explorer.test.js` | Worker: 57 passed, 3 skipped, 0 failed; mocked/unit coverage |
| `cd website && node --test tests/hub-account.test.mjs tests/hub-listings*.test.mjs tests/jams-visibility.test.mjs` | Worker: 27 passed, 1 skipped; actual-Postgres concurrency case skipped |
| Adapter inheritance reproductions | Coordinator confirmed both forms reject with zero applications |
| Temporary case-alias generation | Coordinator confirmed `INDEX.HTML` replaced generated `index.html`; temp directory removed |
| Local website preparation/startup | Prepared current content; startup succeeded after advisory interruption and retry |
| Current screenshot review | Eleven saved and inspected captures; public browsing, API search, Account Escape, renderer fixture states |

Requested workers: GPT-6.1 Sol/high for framework architecture; GPT-6.1 Terra/high
for editor and website/services. All returned read-only results. Coordinator
verified source boundaries, rejected speculative/intentional-policy findings and
reran the strongest reproductions. No worker edits, merge conflicts or integration
rework. DeepSeek remained paused under the saved owner policy. Weekly allowance
at preflight was 63% remaining; task-specific tokens, effective model telemetry
and precise worker elapsed times are unknown. No supported worker-close control
was available; process-runtime reclamation was not verified.

A bounded independent Terra/high review accepted the consolidated report with
no material corrections. Local report links, eleven screenshot files and
`git diff --check` passed. Audit source hashes are retained beside the captures.

The original audit performed no code fixes or dependency upgrades. Subsequent
local implementation is recorded above. No commits, pushes, deployments or account
changes were performed in either phase. Screenshots and selected executed fixtures
do not establish complete native/browser portability, physical OS acceptance,
security compliance or current live-service health.


## PR380 review and local candidate correction — 2026-11-18

[PR380](https://github.com/codepetca/zero/pull/380) integrates the scoped audit
changes onto main `8192a7ab7`. Independent Sol/high correctness and Terra/high
compatibility reviews covered head `44a4b401b` with no actionable findings. The
cloud production build of that exact head passed 16 Chrome layouts (Home,
Tutorials, Docs and Hub; light/dark; 320/1280px), distinct setImage overload
labels, keyboard destination focus, Account Escape/focus return and navigation.
Nineteen screenshots were captured; no page errors or horizontal overflow. Hub
discovery exercised the local 503 retry state, not authenticated hosted success.

Initial Windows CI compared changed builder source against immutable published
0.5.79 assets and correctly failed kit parity. Following RELEASING, the source
candidate now uses local/unpublished kit and extension 0.5.80, with the new tag
and VSIX filename and cleared public URLs, sizes and hashes. Core remains 0.3.0.
The existing public-kit fallback, installer and Portable publication records and
README public download remain unchanged. Getting Started and starter README use
version-independent VSIX instructions already. This correction builds source
candidates; it does not publish a kit, installer or website.

The PR records final targeted review, check runs and merge state. Initial browser
compatibility CI passed. Prior cloud full-suite results retain their original
source scope. Current source integration, package parity, release contracts and
publication gates are checked separately. The original checkout remains untouched;
all commits and generated outputs belong to the isolated PR worktree.
