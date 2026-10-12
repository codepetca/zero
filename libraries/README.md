# Maintained sample libraries

These source bundles live in the Zero repository and remain separate from
`framework/`. They use ordinary JavaFX objects and explicit app-owned updates.

- [Starter UI](starter-ui/README.md): StartScreen, Hud and ScoreDisplay, reused
  by the packaged study app and coin game and by the ZeroHub dogfood fixture.
- [Health bars](health-bars/README.md): continuous and segmented health views,
  with retained behavior tests and four adventure/study examples.

Each bundle preserves its MIT notice and imported source provenance. Local Maven
coordinates and proofs are unpublished; ZeroHub assigns permanent library IDs
and exact versions through its existing submission contract.

The complete local ZeroHub proof uses the internal Starter UI source:

```sh
node scripts/verify-hub.mjs --output .verification/zerohub-proof
```

It requires the existing pinned checker image and local PostgreSQL tools. Optional
`--cache-from /absolute/path/to/trusted/maven-cache` copies cached dependencies
into the fresh proof cache and removes copied hub coordinates there, so the exact
hub JARs still resolve anew. Optional `--preview /absolute/path/to/preview.png`
uses an authored preview. No external source checkout is required. To seed the
disposable developer server, run `node hub/local.mjs --starter-ui`.
