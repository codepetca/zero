# Local Zero core library

This development module packages the canonical SimpleApp and SketchApp source
for the Component Workshop. The student starter still ships editable core source;
this module does not migrate existing projects or change their API.

From the Zero repository root:

```sh
npm run prepare:starter
./student-template/mvnw -f framework/pom.xml clean package
npm run verify:framework
```

Edit the canonical files in `src/main/java/zero/`. Preparation creates ignored,
readable copies in the starter and refuses to overwrite edited copies. Save
starter edits elsewhere or move the intended change into the canonical source
before preparing again. Root check, test and packaging entry points also prepare
the starter. An extracted starter builds independently with its Maven wrapper;
students need no Node.js or access to this module.

The finite contributor harness lives separately in `checks/zero/SmokeLauncher.java`.
`verify:framework` runs it in a disposable assembled starter with a native GUI;
normal student projects contain only SimpleApp, SketchApp and their own app code.

The JAR and sources JAR are generated in target/. No remote publishing target is
configured. Original-code licensing and public Maven coordinates remain unresolved.
Never add this JAR to a project that already compiles its own zero.SimpleApp and
zero.SketchApp; pick one source of the framework classes.
