# Starter UI

`ca.codepet.zero:starter-ui:0.1.0-prototype.1` provides three ordinary Java 17
classes in `zero.starterui`, using pinned JavaFX controls 21.0.12. This folder
owns their canonical packaged source. The default-package teaching copies remain
separate examples. The library has no Zero core dependency, registry or shared
singleton state.

Main owns rules and numbers and explicitly updates these objects. Each object
returns one stable JavaFX Node through `view()`; mount it in one parent at a time.
Callbacks come from the consuming app. See [API.md](API.md). The same exact JAR
is used by [packaged-study](../../student-template/examples/packaged-study/)
and [packaged-game](../../student-template/examples/packaged-game/).

From the Zero repository, run:

```sh
python3 scripts/verify-starter-ui.py
```

The proof creates fresh ignored evidence, checks two reproducible builds, installs
to an isolated Maven cache and runs a finite native JavaFX behavior check plus
both consumers. A graphical JavaFX session is required. Re-running requires a
fresh `--output` directory. Optional `--cache-from` copies an existing trusted
Maven cache into the isolated cache to reuse pinned dependencies.

ZeroHub's dogfood fixture imports these classes from this folder and assigns its
reserved `zero.uiN` namespace. The proof does not publish or submit anything.
Code is [MIT licensed](LICENSE). [PROVENANCE.json](PROVENANCE.json) preserves the
original source revision and hashes.
