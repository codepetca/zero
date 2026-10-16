# Zero shared design

Start here before future UI work. This file records the shared visual direction
and its approval status. [UI and UX guidelines](docs/UI-UX-GUIDELINES.md) remains
the canonical interaction, accessibility and verification standard; follow it
rather than copying its rules into individual components. Product behavior stays
in [Product](docs/PRODUCT.md), and commands in [Development](docs/DEVELOPMENT.md).

## Approved and proposed

### Remembered website preferences — 2026-10-16

These are the owner's continuing design defaults. Preserve them in future website
work unless the owner requests a change. Prefer a subtle appearance and keep the
current task's content visually prominent.

| Surface | Default |
| --- | --- |
| Tutorials | No Previous links or horizontal dividers, including section/footer rules. |
| Tutorial heading | Show the current project name in title case: Greeting App, Study Quiz or Coin Game. |
| Tutorial summary | Show the large lesson title below the project heading. Use “Summary” inside the clearly visible purple-tinted card (stronger in dark mode) containing actions, Done and image; columns on desktop, stacked on phones. Omit short description labels. |
| Lesson ending | Close the final code/explanation section with a short encouraging message in plain text. |
| Tutorial steps | Highlight numbered step titles with subtle theme backgrounds. |
| Secondary guidance | No generic setup or continuation cards; keep lesson-specific notes muted and unboxed. |
| API reference | Category titles scroll away; each method name sticks through its own details. |
| Scrollbars | Transparent tracks matching the surrounding background, with thin muted thumbs. |
| Themes | Apply the same choices in light and dark; the root page follows the selected theme too. |

Keep the sidebar, Next lesson action, search, code copying, deep links, accessible
focus and ordinary scrolling usable. See the dated corrections below for details.

| Surface | Status |
| --- | --- |
| Home page with app header, Learn Java and two buttons | Owner-requested replacement 2026-10-13; shared light/dark themes. |
| Shared Learn/downloads design in light and dark | Owner-approved 2026-10-13; applies to the tutorial reader and Downloads. |
| Minimal editor sidebar in light and dark | Owner-approved 2026-10-13: one Run/Stop, GitHub and ZeroHub view; idle status hidden; Sign in/username; New branch; Tutorials/Setup overflow. Native VS Code adaptation remains required. |
| Docs reader | Owner-approved 2026-10-14 API mock: method/category sidebar, search and concise entries; preserve current shared navigation, themes and code copying. Setup and longer guides stay linked. |
| ZeroHub examples | Owner-requested 2026-10-13; minimal original-project starter, four practice projects and three optional advanced projects; maintained complete downloads, real previews and source links; no Examples top-menu entry. |
| Community Hub | Existing library/project contracts and publication behavior retained. |

Review the runnable [design playground](design/playground/README.md) before
accepting a proposal. The playground is an isolated visual review surface;
its controls and status examples do not establish editor, download or upload
behavior. Owner approval authorizes applying this design to Learn/downloads and the sidebar.
It does not authorize release changes, publishing, pushes, deployments or credentials. Keep release 0.5.8 frozen;
signing and physical Windows verification remain deferred.

## Shared baseline

Use the existing Zero brand assets. Preserve the restrained white/purple
identity and `#683bef` accent. [Shared tokens](design/tokens.json) describe the
approved palette, typography, spacing and control treatment; adapters translate
those roles to each surface. The approved dark companion applies to Home, Learn and Downloads; host theme roles govern the sidebar. Avoid extra decorative colors, gradients, shadows and illustrations.

- **Typography:** native system sans-serif for web prose, with a compact readable
  hierarchy. Code retains a monospace face. Use the editor's selected font and
  size in VS Code rather than forcing web typography into its shell.
- **Spacing:** use the shared spacing scale for related controls and generous
  separation between decisions. The landing keeps its centered, sparse group;
  Learn can use a bounded reading width; editor content follows sidebar density.
- **Surfaces and corners:** light web surfaces stay white with subtle neutral
  boundaries. Dark Learn surfaces use the paired semantic tokens. Keep corners
  modest (about 6px on web actions); avoid turning every paragraph into a card.
- **Icons:** small, familiar icons support action labels, never replace essential
  wording. Use Lucide icons for website actions and controls, retaining the Zero
  mark and supported native editor icon conventions.
- **Focus:** visible focus is distinct from hover and selection. Web focus uses the
  reviewed focus token; editor focus follows host theme and high-contrast colors.
- **Actions and errors:** maintain one dominant action per decision, restrained
  secondary actions and plain state text. Error examples pair the condition with
  an actionable recovery; color alone does not convey Ready or Error.

## Surface adaptations and review scope

Home uses the shared app header above **Learn Java**, **Starting from zero.**
and stacked **Download Zero** (`/downloads`) and **Start Learning** (`/learn`) buttons.
It uses the centered full-viewport layout and shared appearance toggle. Tutorials opens
lesson 0 directly with the complete lesson sidebar and a reading pane. The owner
removed the overview landing on 2026-10-13. The separate Download page offers
**Download for Mac Silicon** above the Windows complete-kit ZIP/manual-setup action.
Center the heading and stacked buttons within the available page area. Do not
invent availability, offer an unpublished Windows EXE, add Linux support, or add
long instructions to the download controls. Release metadata remains
the authority for actual downloads.

The editor adapts shared hierarchy and roles through VS Code theme variables and
supported extension APIs. Honor user-selected light, dark and high-contrast
themes, fonts, keyboard behavior and focus; do not override the editor shell or
force the web palette onto host controls. Playground sidebar examples are only
Ready/Error review fixtures and do not prove a live extension host.

Keep the option-2 sidebar minimal. Local Run remains independent of GitHub;
ordinary Java, explicit object updates, student-owned repositories and separate
Pika submission remain unchanged. No Hub redesign or behavior/contract change is
part of this review.

Future UI proposals should name their affected surface and approval status,
reuse these token roles, link the canonical guidelines and show the relevant
states in the playground or real host. Record actual keyboard, responsive,
theme and operating-system coverage before implementation acceptance. Screenshots
and browser fixtures do not substitute for native/editor verification.

## Download page — owner correction, 2026-10-13

Platform downloads live on `/downloads`, separate from Tutorials (`/learn`).
Download is a regular navigation item with the same spacing and current-page
indicator as the other pages, without a divider or special emphasis. Both pages
retain the approved shared light/dark themes. Landing Download Zero and fallback
links open the Download page. Old `/learn#downloads` links redirect for compatibility.
Verified platform availability and frozen release bytes remain unchanged.

## Header theme control — owner correction, 2026-10-13

Tutorials and Downloads replace the Appearance selector with a single circular
header icon. Moon switches to dark, sun switches to light; accessible labels name
the next action. Default to OS preference until a choice is saved. Narrow and
enlarged layouts allow header wrapping while preserving the44px controls.
Native VSCode adaptation, Hub and frozen0.5.8 remain outside this change.

## Viewport layout — owner correction, 2026-10-13

Tutorials and Downloads use the full available screen width and at least its
height. Remove the centered1200px shell cap; header stays at the top and main
fills remaining height. Longer content grows normally with vertical scrolling.
Keep narrow-screen wrapping, contained code and the mobile lesson/menu controls.

## Minimal extension sidebar — owner approval, 2026-10-13

Keep one continuous Zero view; use native Explorer for files. Run/Stop stays at
the top. GitHub uses visible Sign in/username and New branch/Finish change beside
the branch. ZeroHub has Browse and Share project. Tutorials and Setup help move
to native overflow, Copy repository link stays in repository actions. Idle status
is empty. Existing local-practice, native authentication, reviewed Git/sharing,
simulation and published-release boundaries remain in force.

## Collapsible controls and file viewer — owner correction, 2026-10-14

This supersedes the earlier single-view/non-collapsible arrangement. Restore the
separate Files tree below a native collapsible Zero controls view. Keep Run/Stop,
GitHub and ZeroHub together; collapsing Zero leaves Files accessible. Native
Explorer remains available. Only simulation mode shows the static upload notice.
Native themes, local-practice restrictions and existing command/review guards stay.

## Flow audit fixes — owner request, 2026-10-14

The owner requested all five audited issues fixed. Keep the centered Downloads
stack with a concise setup link and metadata-derived platform/version requirements
below it. The later tutorial-card correction removes the initial-lesson setup
card; setup remains available through Downloads and Docs. Share your work uses the existing shared theme wrapper
and controls; this is no broader Hub redesign. Release bytes stay immutable.

## Tutorial reading hierarchy — owner correction, 2026-10-16

Remove Previous lesson prose and horizontal dividers from tutorial content,
including section and Next lesson borders. Keep numbered step titles prominent
on subtle theme surfaces, with existing disclosure controls and deep links.
The later correction below removes generic setup/continuation cards entirely;
lesson-specific optional notes stay muted and unboxed. Reuse approved light/dark
tokens. The sidebar and Next lesson action remain available.

## Docs sticky method names — owner correction, 2026-10-16

API category headings scroll with the document. Each method's name/owner row
sticks only while reading that method, below the shared desktop header or at
the top on phones. Reuse opaque theme backgrounds and preserve method links,
search, navigation and normal category styling.

## Subtle scrollbars — owner correction, 2026-10-16

Themed website scrollbar tracks blend into their scrolling surface, including
the page gutter. Use thin approved-gray thumbs and transparent tracks, retain
normal scrolling, follow light/dark/system preference and defer to system
scrollbar colors in forced-color mode.

## Remove generic tutorial help cards — owner correction, 2026-10-16

Remove the entire “First time?” card and all continuation cards containing
“If you have not started it yet”. This supersedes the earlier helper-card choice.
Keep Start project buttons on lessons0/3/8, the lesson instructions and specific
component/media notes. Those specific notes stay small, muted and unboxed.

## Tutorial Summary card — owner correction, 2026-10-16

Group the opening numbered actions and full Done checkpoint in a subtle Summary
card, with the target image beside it on desktop and below it on narrow screens.
Remove the redundant short description under the lesson title. The source's bold
opening goal need not repeat above the card; authored lesson source stays intact.
This card contains the current lesson's actions, not generic setup/continuation
hints, which remain removed.

## Lesson title card — owner correction, 2026-10-16

The target image belongs inside the same card as the numbered actions and Done
checkpoint. Use the lesson title (for example, “Lesson 1: Say hello with a button”)
instead of “Summary”, with no duplicate title above. Give the whole card a subtle
purple tint using shared theme tokens; retain desktop columns and phone stacking.
This supersedes the preceding Summary card layout.

## Lesson title and encouragement — owner correction, 2026-10-16

Restore the large lesson title directly below the project heading and label the
card “Summary”. Keep its tint and contained image. End each lesson’s final code
and explanation section with short encouragement, such as “You wrote your first
Zero program!” for lesson0. This supersedes the lesson-title-inside-card choice.

## Summary card contrast — owner correction, 2026-10-16

Summary cards must stand out from the surrounding page, especially in dark mode.
Use a14% accent tint in light mode and24% in dark mode, including system-selected
dark. This supersedes the earlier8% tint; preserve readable text and links.
