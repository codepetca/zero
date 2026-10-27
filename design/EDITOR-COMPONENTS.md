# Reusable editor controls

Owner preference, 2026-10-22: use the sidebar's dropdown appearance throughout
Zero's editor views. Reuse the component before styling another copy. When a
pattern repeats, extract its common visual rules and maintain a source-backed
prototype with the relevant states.

## Sources

- `extension/media/controls.css`: canonical button, split-button, chevron,
  menu-panel, item, focus, disabled and forced-color styles.
- `extension/src/ui-controls.js`: inlines those styles within the Start Page's
  nonce-protected webview. `design/prepare.mjs` includes the exact same source
  in the sidebar's generated stylesheet.
- `extension/src/sidebar-icons.js`: existing Lucide glyphs, including ChevronDown.
- `design/playground`: local comparison screens built from the actual Start Page
  and sidebar renderers. No separate mock of their button/menu markup.

| Component | Start Page classes | Sidebar classes | Contract |
| --- | --- | --- | --- |
| Primary action | ordinary button | ordinary button | Host theme, font, focus and disabled state |
| Secondary action | `secondary` | `secondary` | Native secondary button colors |
| Split action | `zero-split`, `zero-menu-button` | `run-split`, `run-menu-button` | Main action plus 30px arrow; shared icon and separator |
| Menu trigger | `zero-menu-trigger` | `files-menu` | Existing chevron rotates when expanded |
| Menu panel | `zero-menu` | `files-dropdown` | Shared border, surface, shadow, 4px inset, 5px/8px item padding and 28px minimum item height |

Publishing progress reuses `extension/src/publish-progress.js` and
`extension/media/controls.css` in the sidebar and Start Page. One slim stage bar
sits beneath existing status text; accessibility exposes stage counts, while only
the current segment animates. Status updates preserve that segment's DOM. Reduced
motion leaves a static partial current segment; native high-contrast/forced colors
retain a visible outline. `/components?state=publish-building` and the other
`publish-` states use snapshots from the real command coordinator with an entirely
in-memory publisher/browser. `/sidebar?state=publish-building&cycle=1` plays a
clearly labeled timed fixture cycle; those timings are not production estimates.

Screen layout stays local: Start tutorial's whole split control and Project are
180px wide, filling narrow Start Page views. The sidebar follows its panel width.
Keep app commands, allowed actions and authorization checks in each host. Sharing
appearance must not replace those checks with a generic command executor.

## Review a change

```sh
node design/prepare.mjs
ZERO_DESIGN_PORT=3256 node design/playground/server.mjs
```

Open `/components`. Compare Start Page and sidebar menus in light, dark and high
contrast. Use the state selector for ready, signed-out, checking, install,
unavailable and busy. Open either standalone screen for viewport/zoom checks.
Actions are explicitly simulated; production credentials and commands never run.

Check keyboard opening, arrows, Home/End, Escape, Tab, outside dismissal, focus
restoration, disabled items, busy changes and account changes. Native VS Code and
physical OS acceptance remain separate from browser fixtures.

```sh
node --test extension/test/start-page.test.js extension/test/sidebar-*.test.js
node --test design/tests/*.mjs design/playground/playground.test.mjs
node design/prepare.mjs --check
```

A new reusable pattern belongs in this catalog and the prototype before another
screen copies it. Shared changes need proportionate checks for both consumers.
