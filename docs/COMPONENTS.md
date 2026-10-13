# ZeroHub libraries and components

ZeroHub is Zero's shared-library feature at `/hub`. All platform source is maintained in Zero. Student authors keep their library source in their own repositories; uploads and immutable artifacts live in ZeroHub storage.

## Use a component

Browse a component's preview, example, GitHub contributor and checked platform at [ZeroHub](https://zero.codepet.ca/hub). Related components come together as one library.

Automatic setup is coming in the next Zero update. With the locally built development extension, open Zero's (…) menu → **Browse ZeroHub**, choose a component, select **Add library**, then **Apply**. Zero handles library setup. Use the component's Java import and example, then **Run App**. You choose when to **Update**; **Revert** returns to your previous version.

The development extension edits only managed Maven dependency/repository/history blocks through the native undoable editor. It refuses unsaved or drifted POMs and source copies that shadow installed classes.

### Manual setup for current downloads

Current public downloads do not include automatic library setup. On a component card, open **Use this component → Manual setup for current downloads**. Add the shown entry to your app's `pom.xml`, then use the shown Java import and example. Add the entry once for related components in the same library. You can instead wait for the Zero update; the website does not install a library into your app when you browse a card.

A reserved library `ui7` provides imports such as `zero.ui7.Hud` and exact coordinates `ca.codepet.zero.library:ui7:0.1.0`. IDs are assigned by the server; GitHub usernames are attribution, not package names. Use the actual import/API on the card. Ordinary constructors, setters and callbacks connect components; apps own navigation and rules.

Add pins a version. Update supports a newer compatible patch; Revert uses that library's previous pin. Separate libraries keep independent histories. No automatic updates or silent source replacement.

## Make and share in the local developer preview

Sign into ZeroHub with GitHub, choose a class name/title and download the assigned library project. Open it in Zero, run the editable preview and develop source, API, changelog, MIT notice, PNG, behavior checks and two finite consumer examples. Upload the folder; generated build files do not become submission authority.
The ZIP includes a short README that stays local. Save the submission-result
link to recover after reload or sign-in. Re-select the same folder after fixing
a failed unpublished version; identical uploads recover the existing report or
exact release. Run App previews the component; it does not run the submitted
behavior check and two examples locally.

Trusted isolated checks validate namespace/API, compile the library and execute declared checks/consumers using its actual JAR. The separate publisher validates source/policy/artifact bindings and lists passing immutable versions automatically. Contributors cannot provide another user's attribution or their own acceptance verdict. Failed unpublished versions can be corrected and resubmitted; listed versions require a new version for fixes.

The first policy supports self-contained JavaFX widgets exposing `public Node view()`, with Java17/JavaFX21.0.12 and no extra library dependencies. Automatically checked means the disclosed checks passed on the recorded platform; it cannot prove all behavior, usefulness or safety when installed. Downloaded components run with the app's permissions.

## Alternatives and core

Several HUDs or health bars can coexist as separate libraries. A related set of classes can share one library. Combining independent libraries is a deliberate new API/release decision, not an automatic rename of existing imports. Highlighting preferred choices and core promotion remain future deliberate decisions; they do not alter installed pins.

`libraries/starter-ui/` and `libraries/health-bars/` are maintained sample bundles, separate from core APIs. Starter UI is published as `ui1:0.1.0`; the health-bar bundle is not published in ZeroHub yet. Maintained source is never published merely by editing a folder. [Starter UI proof](STARTER-UI-PACKAGE.md) and [the hub contract](../hub/CONTRACT.md) describe the boundaries.

## Open contribution and curation

There is no lifetime contributor storage or library-count allowance in the
approved product policy. Passing supported libraries publish automatically;
Zero's owners and designated maintainers may later archive, hide or remove any
content at their discretion, including unused or redundant libraries. Normal
archiving hides discovery while preserving exact downloads where practical;
removal may stop downloads. Neither silently changes installed versions.
See [the policy](ZEROHUB-POLICY.md) and
[implementation follow-up](ZEROHUB-PLAN.md#curation-and-capacity-follow-up).
Current local admission no longer has lifetime contributor guards. Archiving
and removal are deferred; neither is claimed as a deployed control.

## Current availability

The public catalog supports browsing and exact Maven downloads. The complete contribution journey runs locally; public GitHub sign-in and uploads remain closed until the independent checker-security review, isolated hosted workers and operating controls are complete. Local demo identity is only a test. Pika assignment submission remains a separate repository-link workflow.

See [lesson 11](../student-template/lessons/11-zerohub.md), [development commands](DEVELOPMENT.md) and [ZeroHub run guide](../hub/README.md).
