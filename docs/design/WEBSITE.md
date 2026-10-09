# Selected website design and theme

Owner selected the **first ultra-minimal revision** on 2026-10-09.
The canonical visual reference is [selected-landing.png](selected-landing.png).
It is the centered Zero wordmark design, not the earlier download-first page
containing a VS Code preview. Generated with the built-in ImageGen tool as a
planning mockup; it is not an implemented website or a live download.

## Landing page contract

- White page with a single centered group, slightly above the vertical midpoint.
- Large lowercase **zero** wordmark with the purple Zero mark.
- One sentence: **A simple kit for building Java apps.**
- Two adjacent actions: **Download Zero** (solid purple, small download icon)
  and **Learn more** (white, subtle outline).
- No navigation, screenshots, app previews, numbered setup steps, feature
  sections, workshop promotions or footer links on the landing page.
- Learn more opens `/learn`, containing the supporting product information,
  setup guide, API docs, GitHub/source links and Component Workshop information.

## Theme specification

These are implementation targets derived from the selected mockup, not measured
pixel values or a claim that the image specifies a particular font.

| Token | Target |
| --- | --- |
| Page | `#FFFFFF` |
| Main text / wordmark | `#080E25` |
| Supporting text | `#535C76` |
| Purple accent / primary button | `#683BEF` |
| Purple hover | `#5530CC` |
| Secondary outline | `#ADB2CC` |
| Keyboard focus | Visible purple outline, offset from the control |
| Font | Native system sans-serif stack; no font download required |
| Corners | About 6px on buttons |

Use a bold wordmark, readable supporting text and generous whitespace. Avoid
decorative gradients, shadows, panels and illustrations. Reuse the existing
Zero brand asset when implementing; the generated mark is a visual reference.

At narrow widths keep the same content, scale the wordmark, allow the sentence
to wrap and stack the buttons if needed. Preserve comfortable touch targets and
keyboard navigation. The approved website theme is light; a separate dark
website concept or theme switch is outside this selected MVP. Zero's editor
continues to support its existing user-selected VS Code themes.

## Next delivery

Build the local Next.js landing page and `/learn`, starting with a faithful
responsive version of this reference. Keep public download availability tied to
verified published release assets; do not invent a working 0.5 release URL.
Verify the site locally before authorized Vercel/domain configuration.
See [the website plan](../WEBSITE-PLAN.md) for architecture and rollout.
