# Zero component hub — local build

ZeroHub is the shared-library feature inside Zero. PostgreSQL stores ownership, submissions, reports and manifests; an isolated Docker checker builds Java and a separate publisher stores immutable Maven bytes. The site entry is `/hub`. There is no separate Community repository or Workshop/catalog path.

## Student flow

1. Open ZeroHub → Make a library. Sign in; choose a Java class name and title.
2. Download the project. The hub supplies a short namespace such as `zero.ui7`.
   Extract it and open the folder in Zero's VS Code profile. The standard build
   shortcut runs the editable preview; Maven config and wrapper are included.
3. Edit the component, its API card, tests, two examples and PNG preview. Upload
   the project folder. Development/build files stay outside the submitted library.

A passing version is listed automatically. A failed version stays unavailable;
fix and resubmit the same unpublished version. Each submission/report remains
immutable. Published versions cannot be replaced. Related components can share
one library and one exact version. No GitHub username appears in Java imports.
Students still submit coursework repository links separately in Pika.

Library cards show **By @username**, linked to the contributor's GitHub profile.
Credit comes from the authenticated account recorded with each submission, never
an uploaded name or profile URL. The numeric account ID stays fixed; a later
authenticated username change updates display credit without replacing releases.

Student library source stays in students' own repositories; uploaded versions live in the database/artifact store, not Zero's Git tree. Maintained sample bundles live in `libraries/`.

Zero's (…) → Browse ZeroHub offers exact Add/Update/Revert, with independent per-library history. Installed pins change only through explicit action; ordinary Maven resolves the library.

## Developer run

Requires Node 22+, Docker and a graphical JDK17+ session for native app proof.
These are maintainer tools, not new student prerequisites. No cloud resources or
live credentials are created by these commands.

```sh
npm ci --prefix hub
node hub/checker/build-image.mjs
node hub/local.mjs --origin http://127.0.0.1:3177
```

In another terminal:

```sh
cd website
npm ci
ZERO_HUB_URL=http://127.0.0.1:8788 npm run dev -- --port 3177
```

Visit `http://127.0.0.1:3177/hub`. Local sign-in explicitly uses the test
identity `zero-local-demo`; it is not GitHub authentication. The test PostgreSQL
container is temporary and disappears on exit. Object bytes live under the
printed ignored proof directory. Ctrl+C stops the hub and database. A missing
hub configuration leaves existing public downloads usable.

Seed the actual Starter UI dogfood package from this repository:

```sh
node hub/local.mjs --origin http://127.0.0.1:3177 \
  --starter-ui --output .verification/hub-demo
```

A preview is illustrative unless replaced via `--preview /path/to/preview.png`.
The coordinated proof used a native snapshot of the canonical Starter UI views.
The fixture adapts maintained source to its reserved namespace; it does not publish the maintained sample.

## Verify

```sh
npm run test:postgres --prefix hub
node --test hub/checker/test/validation.test.mjs
ZERO_DOCKER_TEST=1 node --test hub/checker/test/docker.test.mjs
node scripts/verify-hub.mjs \
  --output .verification/hub-proof
npm test
npm test --prefix website
npm run typecheck --prefix website
npm run build --prefix website
# With your already-running local Next dev or production server:
ZERO_HUB_TEST_WEBSITE=http://127.0.0.1:3177 node --test website/tests/hub-http.test.mjs
```

The integration proof deliberately fails a submission, fixes/resubmits the same
unpublished version, publishes two versions only to a local fake store, resolves
0.1.0 → 0.1.1 → 0.1.0 through ordinary Maven and exercises both real study/game
consumers with exact JAR-origin/hash checks. It also uses the extension's actual
Add/Update/Revert engine and preserves immutable first-version metadata.

## What is checked

The first policy supports self-contained JavaFX widgets with `public Node view()`.
No special superclass or framework registry. Constructors/setters stay ordinary
Java. Third-party/transitive library dependencies and non-widget source bundles
are outside this first policy. Java17 and JavaFX21.0.12 are pinned; submitted POMs,
workflows, scripts, receipts and passing flags have no authority.

The trusted checker verifies source/namespace/class boundaries, compilation,
actual built-JAR API/origins, finite declared behavior and two consumers, complete
MIT/API/changelog/PNG and exact source/artifact bindings. The public label is
Automatically checked with actual scope/platforms. Contributor-authored tests can
still be weak; these checks cannot prove usefulness, all behaviors or safety after
installation. Components run with the student's application permissions.

See [checker policy](checker/README.md), [service lifecycle](service/README.md)
and [shared contract](CONTRACT.md). Root source changes still receive independent
review; that is separate from automatic component admission.

## Hosted activation is separate

This is a local implementation, not an active public hub. The actual PostgreSQL,
isolated JavaFX checker, automatic local publication, Maven consumers and
Add/Update/Revert proof passed on 2026-10-12. A browser trial also passed local
sign-in, project download, folder upload, listing and logout; the downloaded
project ran on macOS. Production Next ZIP bytes and Maven gateway consumers were
verified locally. See [delivery evidence](../docs/EVIDENCE.md).

Independent compatibility review passed, but corrected checker security review
is still incomplete because the reviewer provider rejected that assignment.
Passing tests do not replace that review or authorize public activation. Hosted activation
needs owner-authorized GitHub OAuth setup, a managed PostgreSQL database, durable
artifact storage, and a dedicated hardened checker host. Vercel hosts the Next.js
website; it does not run these Docker workers. The production service fails closed
without configured authentication. Local identity mode is explicitly prohibited
on production or non-loopback origins. No service token reaches candidate Java.

Before a public launch, provision separate least-privilege worker/publisher roles,
resource/queue/abuse quotas, backups, operational monitoring and reporting/removal.
The local checker uses containers and a Java17 completion guard; that is not a
claim of resistance to all JVM/native/kernel exploits. Linux ARM64 virtual-display
checks do not establish native Windows/Linux AMD64 or novice/physical-input flows.
