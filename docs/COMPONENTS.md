# ZeroHub games, libraries and components

ZeroHub at `/hub` discovers complete editable games and reusable Java libraries.
Browse and download without signing in. To contribute, choose **Sign in to GitHub**
in the Zero sidebar, connect your own public repository and upload your committed
work. The publication form opens in your browser; use the same personal GitHub
account there as in Zero. Browser sign-in and Zero sign-in are separate.

Students use one existing game repository owned by their personal GitHub account.
Libraries live under `libraries/<name>/` inside that repository; sharing does not
require another repository. Pika assignment submission remains a separate
repository-link workflow.

## Use a library

Student-led framework evolution is a core product goal. Components include
ordinary Java helpers and data structures, behaviours, alternative animation
players, HUDs and other UI, and larger reusable game/app structures. A library
may add a missing capability or replace a default implementation through a public
contract. It need not subclass a mandatory component base. The
[framework architecture plan](FRAMEWORK-ARCHITECTURE.md) defines the planned
extension seams and proof examples; the existing publication limits below remain
in force.

Browse a library’s author, exact source commit, version, optional PNG preview and
Java API on [ZeroHub](https://zero.codepet.ca/hub). Related classes come together
as one library. The website never installs a dependency merely by displaying it.

The replacement development extension uses native **Browse Libraries**, **Add
library**, **Apply**, **Update** and **Revert** controls. Add and Update preview
managed Maven edits, preserve ordinary Java source and pin an exact version.
Revert returns to that library’s previous pin; libraries keep independent
histories. There are no automatic updates or silent substitutions. Public kit
releases retain their original bytes and do not acquire these controls until a
new kit is deliberately released.

The [project preservation policy](FRAMEWORK-ARCHITECTURE.md#project-versions-and-preservation)
keeps exact library requirements with the student's project; an optional full
offline backup also retains the library inputs/licenses. Library/API claims remain
bound to recorded Zero/core/browser requirements; a new editor or core adoption
must not replace them. No additional historical-kit registry/storage is required;
existing ZeroHub catalogs/artifacts and immutable sharing rules are unchanged.
Offline backup is proposed, not already supplied by the current Add/Update flow.

### Manual setup for current downloads

Open **Use this library → Manual Maven setup** on a library card. Merge the shown
repository and dependency entries into the existing sections of your app’s
`pom.xml`, then use the shown Java import and example. Add the dependency once
for related classes in that library. Maven retrieves the exact listed version
from the public immutable artifact store.

Identity comes from the verified numeric GitHub repository ID and chosen slug.
Repository `12345` and slug `health-bar` produce library ID
`lib-r12345-health-bar`, namespace `zero.contrib.r12345.health_bar` and coordinate
`ca.codepet.zero.contrib.r12345:health-bar:0.1.0`. Imports could include
`zero.contrib.r12345.health_bar.HealthBar`; use the actual API on the card.
Account/repository renames do not rename Java packages or Maven coordinates.
GitHub contributor names provide credit, while numeric identities bind ownership.
There is no server-assigned short-ID reservation.

Ordinary constructors, setters and callbacks connect components. Main owns
navigation and game rules; explicit updates can be delegated to an owned
container whose ordinary Java loop updates its members. Existing widgets expose
JavaFX `Node view()`; the [target class model](FRAMEWORK-MODEL.md) uses a Zero
Element view with a tested advanced bridge for reuse. This facade is not yet
implemented. Ordinary helpers need no view, global registration system or
automatic class discovery. Do not tick a component independently after handing
its update ownership to a world or actor.

### Browser portability

The exporter already resolves supported managed local/published libraries into
verified Java source and resources, then applies the browser compatibility check
and pinned WebFX compilation. This is different from allowing arbitrary Maven
dependencies. A native JAR check is not proof that a library is playable in the
browser. Source, resources, exact version/core requirements and the relevant
runtime/profile must remain traceable in both targets. Imported library bodies
are checked even when a method is unused; moving a native-only call behind an
unused method is not a portability mechanism.

The revised plan requires real app/game consumers of a managed component and a
replacement animation implementation. Those acceptance proofs and any additional
core dependency or browser-contract support are future work. Current native-only
samples such as the ProgressBar health bar do not establish a portable widget.

## Open a game

Games are separate editable projects, never Maven dependencies. Inspect the
controls, author, license and exact source before choosing **Download project**
on the website or **Open project** in the replacement Zero editor. Zero verifies
the listed ZIP’s size/hash and extracts into a new destination; it does not
overwrite an existing project, configure the original author’s remote or run
Java automatically. Review ordinary VS Code workspace trust before **Run App**.
Connecting your own repository is a separate action. Preserve attribution and
applicable licenses when making changes.

The initial game policy validates and packages source. It does not execute the
game or promise gameplay quality, safe execution or a native installer.

## Develop and share from the existing repository

Use **Share game** for the root game and **Share library** for a library folder.
Save authored title, description, license, exact version and preview selection in
`zero-game.json` or `zero-library.json`; games also describe their controls.
Zero derives identity and API metadata rather than asking students to copy a
commit SHA or numeric repository ID into a browser form.

For a library, preview extraction and package/import/build changes before moving
selected classes and their helpers under `libraries/<name>/`. Keep recoverable
source edits and prove the game still runs. **Develop local library** compiles
the editable source roots; **Use published version** uses an exact Maven pin.
The two modes are explicit and never silently fall back to local classes when
an artifact is missing.

Choose **Check library** for local feedback on independent compilation, API/source
boundaries, behavior checks and two finite examples using the actual JAR. The
first policy uses Java 17, JavaFX 21.0.12 and a fixed dependency allowlist; it
supports self-contained JavaFX widgets and ordinary Java helpers. Local feedback
is not hosted publication authority.

Upload source through the normal reviewed Git workflow. Share opens a prefilled
form in the official Zero GitHub repository, frozen to the exact committed source
folder and version. GitHub handles authentication; the website has no sign-in,
folder-upload or reservation flow. Changing local files afterward does not
change that request. The pilot requires public repositories owned by the
requesting student’s personal account; private/organization/team publication
needs a later policy.

An accepted version’s source never changes. Correct failed unpublished source
and submit its new commit; fixes to accepted releases use a new version.
Contributor-supplied workflow results or claimed acceptance are not authority.

## Publication and current limits

Small authoritative request, release and availability records live in a Git CAS
ledger on the `zero-sharing-registry` branch of Zero. Immutable public Blob
objects hold Maven files, source archives, game ZIPs and generated catalog
snapshots. The Git ledger holds the current snapshot pointer. The website reads
that fixed pointer and validates its exact artifact origin, digest and revision;
there is no Neon database or website OAuth session on this read path.

The automatic-publication design separates trusted checking from publication.
Public library checking remains blocked by the unresolved checker acceptance
gate. Moving execution to managed CI does not remove that gate. This local
replacement does not activate public publication or prove a hosted candidate
executor. A request alone is not an available release; failed or unavailable
checks must never create one. See [the adoption plan](GITHUB-SHARING-PLAN.md) and
[sharing contract](../sharing/CONTRACT.md).

Automatically checked can only mean the disclosed accepted checks actually
passed; it cannot establish every behavior, usefulness or safety when installed.
Downloaded Java runs with the app’s permissions. Existing experiment artifacts
are not migrated into this replacement catalog or treated as verified releases.

## Alternatives, samples and curation

### From student project to Zero core

Build a useful feature in a student-owned project, extract its related classes
and documented API, share an exact library version through the existing reviewed
ZeroHub flow, then learn from reuse and improvements in other projects. Students
may propose a proven capability for Zero itself; maintainers deliberately decide
whether to adopt it, keep it as a library, or defer it. A library's technical
acceptance or star count does not make that decision.

A core proposal needs understandable source and examples, demonstrated reuse,
native and actual WebFX/browser behaviour, clear ownership/errors, an API and
compatibility/migration plan, appropriate licensing and retained contributor
credit. Adoption does not rewrite an accepted library, move its namespace, or
change an installed pin. A new core release documents the capability and users
choose whether to migrate. Specialized or competing libraries can remain useful
on ZeroHub indefinitely. Source PR review, CI and owner-authorized publication
remain separate from contribution acceptance.

Several HUDs or health bars can coexist as separate libraries. Related classes
can share one library. Combining alternatives, highlighting preferred choices
and promoting APIs into core remain deliberate decisions; none silently changes
installed pins.

`libraries/starter-ui/` and `libraries/health-bars/` are maintained local sample
bundles, separate from core APIs. Editing them does not publish a replacement
release. [Starter UI proof](STARTER-UI-PACKAGE.md) documents historical/local
consumer evidence, rather than authority for this catalog.

The approved product policy imposes no lifetime contributor storage or library
count allowance. Technical bounds and shared capacity controls still apply.
Zero’s owners and designated maintainers may curate, archive or withdraw content.
A withdrawn release is visibly unavailable and cannot be added or downloaded
through Zero; already installed local files are unchanged. Curation is separate
from routine technical acceptance. See [the contribution policy](ZEROHUB-POLICY.md)
and [development commands](DEVELOPMENT.md).
