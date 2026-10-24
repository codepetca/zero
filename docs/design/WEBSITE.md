# Website design and theme

Start with [shared design](../../design.md) and the canonical
[UI and UX guidelines](../UI-UX-GUIDELINES.md). Current owner instructions
supersede the original landing mockup.

## Current page contract — 2026-10-15

Home (`/`) has the shared app header and a centered stack: **Learn Java**,
**Starting from zero.** and two direct download actions: **Download for Mac Silicon**
and **Download for Windows (ZIP)**. GitHub
connection happens in downloaded Zero's native welcome. The website needs no
sign-in; old `/get-started` links redirect to Downloads. Preserve keyboard focus.
Tutorials opens lesson 0 directly, with all thirteen lessons in a desktop sidebar
and a native lesson selector on narrow screens. Selecting updates the reading
pane and bookmarkable lesson URL. Downloads is a separate page with a centered
heading, stacked Mac/Windows platform actions and a setup-help link; platform
versions and requirements belong inside the linked setup guide. Download is a
regular menu item.

The shared website header uses a profile icon with an account dropdown for
GitHub sign-in or the connected username/Sign out, plus the light/dark toggle.
Default to the OS preference until a mode is chosen, then save
the choice. Header and main fill the available viewport; longer content scrolls
normally. Keep320px reflow, contained code, mobile menu and comfortable targets.
Keep the landing sparse. Downloads retains concise installation help and explains connecting GitHub after
launching Zero.

Hub and other website routes retain their own design/contracts. The native
VSCode sidebar follows host colors/fonts/focus/high-contrast roles. LocalRun and
useful errors remain independent of GitHub. Frozen0.5.8, signing, physicalWindows,
publication/push/merge/deployment and credentials are outside this application.

## Historical landing reference

The owner selected the first ultra-minimal image on2026-10-09:
[selected-landing.png](selected-landing.png). It showed a centered Zero wordmark,
one sentence and DownloadZero/Learnmore. It was an ImageGen planning mockup,
not a live download. The owner replaced this layout on2026-10-13 with the app
header and learning home above. Keep the original brand geometry and restrained
white/purple identity; shared tokens are the current palette source.
