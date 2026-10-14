# Zero shared design

Start here before future UI work. This file records the shared visual direction
and its approval status. [UI and UX guidelines](docs/UI-UX-GUIDELINES.md) remains
the canonical interaction, accessibility and verification standard; follow it
rather than copying its rules into individual components. Product behavior stays
in [Product](docs/PRODUCT.md), and commands in [Development](docs/DEVELOPMENT.md).

## Approved and proposed

| Surface | Status |
| --- | --- |
| Home page with app header, Learn Java and two buttons | Owner-requested replacement 2026-10-13; shared light/dark themes. |
| Shared Learn/downloads design in light and dark | Owner-approved 2026-10-13; applies to the tutorial reader and Downloads. |
| Minimal editor sidebar Ready and Error states in light and dark | Owner-approved 2026-10-13; native VS Code theme adaptation remains required. |
| Docs reader | Owner-requested 2026-10-13; direct setup with shared reader/sidebar and themes. |
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
instructions/version prose to the download controls. Release metadata remains
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
