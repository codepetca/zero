# Maintained sample libraries

These bundles remain separate from `framework/` and use ordinary JavaFX objects
with explicit app-owned updates.

- [Starter UI](starter-ui/README.md): StartScreen, Hud and ScoreDisplay, reused by
  the packaged study app and coin game.
- [Health bars](health-bars/README.md): continuous and segmented views, behavior
  checks and four adventure/study examples.

Each retains its MIT notice and source provenance. Local prototype coordinates
are unpublished; moving a sample into this repository does not publish it or
promote its API into core. Student sharing uses numeric GitHub repository identity
and a slug inside the existing game repository; see [components](../docs/COMPONENTS.md).
The initial student policy requires a personal-owned public repository. These
organization-owned maintained samples need a separately deliberate seed policy.

Run maintained local proofs from the repository root:

```sh
python3 scripts/verify-starter-ui.py
python3 scripts/verify-health-bars.py
node scripts/verify-sharing-consumers.mjs --output .verification/sharing-consumers-new
```

The last command uses two trusted generated helper releases and local HTTPS to
prove exact Maven Add/Update/Revert and source archives. It requires a fresh
output directory and scopes certificate trust to disposable child processes.
No global trust, database, hosted candidate execution or public publication is
part of these proofs. The former `hub/local.mjs` and `verify-hub.mjs` service is
removed; retained checker references are historical and remain held.
