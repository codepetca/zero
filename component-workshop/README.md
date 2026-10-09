# Component Workshop — local prototype

A native JavaFX app built with Zero's ordinary `SimpleApp`. It previews the pinned
`school.zero.community:zero-community:0.1.1` HealthBar; it does not compile arbitrary
components or execute their examples. The light interface uses a purple selected
example, named Full/Partial/Empty/Custom caption states, caption/value controls and
reset. Examples and API tabs read the community project's actual metadata and files.

Use a trusted local community checkout. Reading API, examples and export metadata
does not execute contributor code, build hooks or preparation scripts.
Use “Build local source & check” after editing HealthBar. This explicit local run
uses the existing JDK compiler, fixed JavaFX paths, no annotation processors, and
a temporary output folder. It loads only the candidate HealthBar and its nested
classes, renders fresh views and checks the same public API. It does not run the
contributor POM or any hooks, and leaves immutable release artifacts intact.
The explicit candidate build runs your Java class in the Workshop process with
normal local Java permissions. It is for your trusted development source; it is
not a sandbox for downloaded submissions.
Runtime results explicitly describe the loaded pinned binary, while the packet binds
source files to their digest. A source digest is provenance, not proof that edited
source produced the loaded binary. Candidate reports bind the exact source digest
to the compiled class hash. Changes after candidate compilation make its runtime
checks unavailable until another build.

From the Zero repository root, prepare the local repository with the coordinator's
`scripts/prepare-component-workshop.mjs` integration command, then use the bundled
student Maven wrapper (JDK 17):

```sh
student-template/mvnw -f component-workshop/pom.xml \
  -Dzero.componentRepository=file:///absolute/path/to/local/component-repository \
  -Dzero.communityRoot=file:///absolute/path/to/zero-community compile javafx:run
```

For the portable `zero-components.zip`, extract the whole folder, open
`component-workshop/` in VS Code and use the standard build shortcut. Or run
`./mvnw compile javafx:run` there (Windows: `.\mvnw.cmd compile javafx:run`).
The bundled sibling folders supply the local repository and editable community
source. No Node.js or Python installation is needed to use this kit.
For custom locations, use a file URI with spaces encoded as `%20`; the developer
preparation script generates it. Run the portable wrapper from its Workshop folder.

The local repository must contain `school.zero:zero-core:0.1.1` and
`school.zero.community:zero-community:0.1.1`. JavaFX is pinned at 21.0.12 and Gson
at 2.11.0. The default endpoint is the local sibling `component-repository/`,
never a public community service. The wrapper may resolve
pinned build/third-party dependencies from Maven Central on its first run.

Add `-Dzero.workshopCheck=true` to open a real finite JavaFX window and exercise
named previews, visible value changes, fresh views, reset, candidate build, checks and contribution
export. This synthetic harness uses ordinary JavaFX event handlers. It does not
prove physical typing, clicks, DirectoryChooser interaction or other operating systems.
`WORKSHOP_CHECK_PASS` is the acceptance marker; failures emit `WORKSHOP_CHECK_FAIL`.

“Run checks” checks fractional fill, clamping, independent instances and invalid
construction in the loaded runtime, and records the source digest using the shared packet schema. Runtime checks become
unavailable for edited source that differs from the immutable 0.1.1 sources JAR until an explicit candidate
build succeeds. AI advisory review is explicitly unavailable. These contributor
checks cannot approve a component.

“Prepare contribution” chooses a parent folder and creates a new contribution folder
without replacing existing files. The Workshop creates `packet.zip`, `packet.json` and `checks/report.json`. The ZIP's declared scope
is the Maven manifest, HealthBar source/test, adventure/study app examples, HealthBar
API, component metadata and check evidence. Arbitrary repository files, `.git`,
credentials, caches and build artifacts are excluded. Packet generation uses ordinary Java file and ZIP APIs. Preparation errors
stay visible. No upload, GitHub action, release or reviewed status is implied.

Experimental / UNLICENSED is shown from metadata. Public reuse licensing and appointed
maintainers remain required decisions; coursework submission in Pika is separate.
