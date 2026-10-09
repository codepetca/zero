# Local Zero core library

This development module packages the canonical SimpleApp and SketchApp source
for the Component Workshop. The student starter still ships editable core source;
this module does not migrate existing projects or change their API.

From the Zero repository root:

```sh
./student-template/mvnw -f framework/pom.xml clean package
```

The JAR and sources JAR are generated in target/. No remote publishing target is
configured. Original-code licensing and public Maven coordinates remain unresolved.
Never add this JAR to a project that already compiles its own zero.SimpleApp and
zero.SketchApp; pick one source of the framework classes.
