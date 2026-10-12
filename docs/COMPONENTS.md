# ZeroHub libraries and components

ZeroHub is Zero's shared-library feature at `/hub`. All platform source is maintained in Zero. Student authors keep their library source in their own repositories; uploads and immutable artifacts live in ZeroHub storage.

## Use a component

Browse a component's preview, API, GitHub contributor and checked platform at [ZeroHub](https://zero.codepet.ca/hub). A library bundles related classes; discovery shows the classes. Open **Use this component**, add its exact dependency to your app's `pom.xml`, then use the shown Java import and example. Related components share the same dependency.

The next, locally built extension adds (…) → Browse ZeroHub and Add/Update/Revert; current public downloads use the card instructions above. The development extension edits only managed Maven dependency/repository/history blocks through the native undoable editor. It refuses unsaved or drifted POMs and source copies that shadow installed classes.

A reserved library `ui7` provides imports such as `zero.ui7.Hud` and exact coordinates `ca.codepet.zero.library:ui7:0.1.0`. IDs are assigned by the server; GitHub usernames are attribution, not package names. Use the actual import/API on the card. Ordinary constructors, setters and callbacks connect components; apps own navigation and rules.

Add pins a version. Update supports a newer compatible patch; Revert uses that library's previous pin. Separate libraries keep independent histories. No automatic updates or silent source replacement.

## Make and share in the local developer preview

Sign into ZeroHub with GitHub, choose a class name/title and download the assigned library project. Open it in Zero, run the editable preview and develop source, API, changelog, MIT notice, PNG, behavior checks and two finite consumer examples. Upload the folder; generated build files do not become submission authority.

Trusted isolated checks validate namespace/API, compile the library and execute declared checks/consumers using its actual JAR. The separate publisher validates source/policy/artifact bindings and lists passing immutable versions automatically. Contributors cannot provide another user's attribution or their own acceptance verdict. Failed unpublished versions can be corrected and resubmitted; listed versions require a new version for fixes.

The first policy supports self-contained JavaFX widgets exposing `public Node view()`, with Java17/JavaFX21.0.12 and no extra library dependencies. Automatically checked means the disclosed checks passed on the recorded platform; it cannot prove all behavior, usefulness or safety when installed. Downloaded components run with the app's permissions.

## Alternatives and core

Several HUDs or health bars can coexist as separate libraries. A related set of classes can share one library. Combining independent libraries is a deliberate new API/release decision, not an automatic rename of existing imports. Highlighting preferred choices and core promotion remain future deliberate decisions; they do not alter installed pins.

`libraries/starter-ui/` and `libraries/health-bars/` are maintained sample bundles, separate from core APIs. Starter UI is published as `ui1:0.1.0`; the health-bar bundle is not published in ZeroHub yet. Maintained source is never published merely by editing a folder. [Starter UI proof](STARTER-UI-PACKAGE.md) and [the hub contract](../hub/CONTRACT.md) describe the boundaries.

## Current availability

The public catalog supports browsing and exact Maven downloads. The complete contribution journey runs locally; public GitHub sign-in and uploads remain closed until the independent checker-security review, isolated hosted workers and operating controls are complete. Local demo identity is only a test. Pika assignment submission remains a separate repository-link workflow.

See [lesson 11](../student-template/lessons/11-zerohub.md), [development commands](DEVELOPMENT.md) and [ZeroHub run guide](../hub/README.md).
