# Zero local design review

Run from the repository root with Node.js 22+; no dependency install or build:

```sh
npm run prepare:design
node design/playground/server.mjs
```

Open http://127.0.0.1:3256. Keep the terminal process running; Ctrl-C stops it.
For another unused port, set `ZERO_DESIGN_PORT=3257`. Port 3245 is reserved and
refused. The server binds only to the local loopback interface.

Choose Home, Tutorials or Download using Website page or the in-preview menu. Downloads
are a separate screen, with no platform buttons below Tutorials. Use the
website/editor theme controls independently. Compare light and dark,
Ready and Error, web widths 768/1024/390/320px, sidebar widths 320/240/200px and
200% text. Open screen gives a standalone page for browser zoom or full-page
inspection. Desktop canvases can scroll within the review panel when wider than
the available window. Each screen labels its theme, state, viewport and base
revision. Control choices are stored only in the URL; no account or local storage.

All actions are fixtures. Run App, Show Problems, lesson links, navigation,
account/repository controls and platform downloads produce explicit fixture
feedback. Nothing runs Java, downloads an artifact, signs in, changes a repository
or uploads. Lesson disclosures and in-page anchors work normally. The Mac choice
and Windows complete-kit ZIP selection use the real release-selection functions
and authored metadata, selecting the published current kit or verified fallback without changing release metadata.
No unpublished Windows EXE is offered. Actual releases remain unchanged.

The website reuses `website/lib/learning.mjs`, the existing brand geometry and
the production release-selection functions. The HTML hierarchy is a local
review implementation of Learn, not the Next.js React component. Sidebar HTML
is evaluated from the existing trusted `render(webview)` function with a bounded
VM context; activation and VS Code commands never run. A source boundary change
fails visibly. Only the preview swaps its CSP and command bridge; production
files and CSP remain unchanged. Sidebar styles consume host `--vscode-*` values
through the adapter. Browser host colors are explicitly simulated and keep
native blue button colors to demonstrate that Zero does not force purple onto
the editor shell. Fallback and high-contrast examples are also available.

`design/tokens.json` is the single approved semantic source. Both adapters read it
directly; there is no generated token copy to synchronize. Learn and the sidebar now consume deterministic generated CSS from these tokens.
Use `node design/prepare.mjs --check` to detect generated-output drift. Layout spacing uses the shared scale with measured
surface-specific sizes. Lucide React 1.56.0 supplies the website icons. The preview
embeds its download, sun and moon SVGs from `assets/` with the upstream license,
so preview checks need no React dependency. Icons inherit the control text color.

Checks:

```sh
npm run prepare:design
node --test design/tests/*.mjs design/playground/playground.test.mjs
git diff --check
```

See [design.md](../../design.md) for approval status and
[verification](VERIFICATION.md) for actual coverage, evidence and limitations.
The owner approved these Learn/sidebar themes on 2026-10-13. The playground remains
a safe fixture reference; actual Learn runs through the website package.

Tutorials previews the lesson sidebar and selected reading pane directly.
Selecting a lesson updates fixture content; full canonical lesson content is
available in the applied website at http://127.0.0.1:3257/learn.

The Home fixture shows Mac Silicon and Windows ZIP download buttons; GitHub connection belongs in desktop Zero.

## Editor component screens

Open http://127.0.0.1:3256/components to compare the actual Start Page and sidebar
renderers. Select Light, Dark or High contrast and Ready, Signed out, Install,
Checking, Unavailable or Busy, then Apply. Each panel has an Open screen link.
Standalone examples: `/start-page?theme=dark&state=ready` and
`/sidebar?theme=dark&state=ready&connected=1`. Ready shows the Start tutorial/Run
split buttons and Project/New menus together. The sidebar represents an open
project; access states therefore show its existing GitHub setup action, while
the Start Page shows the detailed onboarding state. Busy disables production
controls; it simulates pending work, not completion.

The Start Page is created by production `createStartPage` with an in-memory
panel, fixed `armorup` account and synthetic recent projects. Its real state
snapshot is delivered to the unchanged client renderer. Its nonce CSP stays
in place, allowing local fixture stylesheets only; the injected nonce bridge
turns actions into visible fixture feedback. No extension activates, and no
production command, account, filesystem or network operation is connected.
The host colors are simulated VS Code variables, including menu selection,
button separator and high-contrast borders. This is browser review evidence,
not native VS Code acceptance. No public website or installed app is changed.
