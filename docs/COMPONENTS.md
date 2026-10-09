# Components: build, use, improve

This is the agreed architecture for the component lifecycle MVP. Implementation
and actual verification progress live in [CURRENT](../.ai/CURRENT.md); the
phase exit criteria live in [COMPONENT-PLAN](COMPONENT-PLAN.md).

## Student API and responsibility

An app owns its rules and state. Native JavaFX controls/layouts remain available.
SimpleApp runs settings/setup once; SketchApp adds explicit update/draw calls.
The student calls methods on ordinary objects. A visual component may expose
`view()` returning a Node; a data helper does not need a view. A sketch object
may expose update/draw methods, called explicitly by the app. No required
component parent, annotations, registry or reflection is introduced.

HealthBar demonstrates a small presentation object: the app chooses its health
value and the component displays it. Construction configures maximum and caption;
setHealth updates presentation. It does not decide damage, healing or game rules.
Use separate instances for separate parents. Packages prevent library names from
colliding with student classes; the student learns imports before library internals.

## Use a library, edit a development project

Accepted community components are distributed in one versioned Maven library
initially. A component is a Java class; a distributed library may contain several
components. The community source repository is separate from Zero. The original
core ships readable in the starter during the local proof; no core binary
migration is assumed without a demonstrated need.

Adding a component records an exact library version in the app's Maven project.
Maven resolves the dependency; Zero does not implement a package resolver.
Published versions must remain available and immutable. Never use floating
versions, SNAPSHOTs or automatic downloads of unreviewed Git branches in a
student starter. A catalog identifies component API, provenance, checks and the
compatible library release, rather than promising independent component versions.

Students can inspect attached source/API and run examples locally. To improve a
component, open its editable workshop project. Source copies used in an extraction
lesson are learning exercises, not managed library installations. Do not silently
overwrite a student's edited copy or shadow an installed class with the same name.

## Update and revert

The project records the installed version. A new patch appears as an available
update with its behavior change and compatibility. Applying it previews the
dependency change, preserves unrelated edits, rebuilds and asks the student to
try the app. Revert restores the recorded preceding dependency version, not a
whole-source rollback. A failed build or cancelled review preserves source and
offers recovery. Passing compilation is not proof of correct app behavior.

No silent upgrade when opening an old assignment. Automatic compatible updates
are deferred. Any future import uses a fixed trusted catalog and verifies release
digests; arbitrary community text cannot specify commands or grant tool authority.
The first repository is local for verification; public hosting is a separate gate.
Downloads should eventually work without package-service credentials for students.

## Workshop and community workflow

One component project contains source, named runnable examples, API explanation,
behavior checks and a small metadata file. The same files supply the local
Workshop, check report, contribution packet and generated catalog page.
Multiple states/examples do not substitute for reuse in two different apps.
The workshop helps the student satisfy requirements before uploading their own
repository or proposing community inclusion. Coursework submission in Pika stays
separate; the teacher is not the default component reviewer.

Automation checks build, documented examples, declared dependencies, compatibility
and behavior. AI can summarize gaps, draft explanations and propose fixes. AI
feedback is advisory, tied to the reviewed source/version, and budgeted; it cannot
approve itself, merge, publish, change credentials or run contributor instructions.
Tests written by a contributor or AI do not establish independent usefulness.
Untrusted code checks must not receive repository-write or AI credentials.

Community maintainers accept useful, understandable components and own repair.
Experimental, checked, community-reviewed and deprecated are distinct statuses.
Unreviewed work waits for maintainers rather than falling back to the teacher.
Catalog generation and releases are automated after acceptance. Popularity can
prioritize review but cannot bypass checks. Promotion to Zero is a maintainer
decision; after promotion Zero is canonical and the catalog links there.

## Public-adoption decisions

Before public releases, select original/contributor reuse licensing, appointed
maintainers and a public artifact host. Local HealthBar fixtures are experimental
and UNLICENSED until that policy is decided; they are not reviewed community
releases. External GitHub/AI execution and physical Windows/Linux verification
must be reported separately from local automated evidence.
