# Browser games and playable links

This feature is local and unreleased. It adds an optional browser destination to
ordinary Java projects; native Run App remains the normal development loop.

## Student flow

Choose **Publish app** in Zero's sidebar after finishing and uploading a change
on `main`. First setup reviews the public destination, prepares source-only
publishing files, asks VS Code for GitHub workflow permission, and uses the
existing reviewed Upload changes flow. Zero then confirms the uploaded version.
Later publishes reuse the approved destination and stable URL. Repository
visibility is never changed. The deployed game and its included assets are public,
including when the source repository is private and the account supports Pages.

Wait for **Your playable game is live**, then choose **Open app** or **Copy
playable link**. These commands also live in the Zero title menu and Command
Palette. Pika still receives the separate source repository link. Publishing
tracks the exact GitHub workflow run and checks an unauthenticated public marker
containing both source SHA and run ID before offering the link. A previous live
page remains available when an update fails. Pending runs and the last verified
link survive editor restarts.

A school policy, missing capability, account plan, protected environment or
existing unknown Pages setup produces a specific next action and **Recheck**.
Zero does not replace an existing website/workflow or change a custom domain.
Simulation mode exits before saving, requesting authentication, writing setup
files or making network calls. Live publication must be an explicit student
choice after the teacher enables live mode.

For local testing choose **Export for web** from the title menu or Command
Palette. The cancellable build offers **Preview game**, **Save ZIP**, and
**Share…**. The preview is local; other people cannot use its loopback URL. A
saved ZIP can instead be uploaded as an HTML game on itch.io. Students choose
visibility there themselves.

## Ordinary Java and compatibility

Students keep `Main.java`, explicit object updates, ordinary Java classes and
JavaFX APIs. The exporter compiles a temporary copy with pinned WebFX/GWT modules.
Its adapters cover the reviewed Zero helpers, canvas images and sprite regions,
keyboard/mouse state, focus, supported JavaFX controls and the bounded JavaFX
media calls used by the tested game. Image preloading completes before `setup`.
Browser audio waits for a real gesture when autoplay is blocked. Missing assets
and unsupported API calls produce build/startup errors rather than a false
successful publication.

This is a tested subset, not a promise that every Java library or JavaFX feature
works in browsers. Desktop file/process access, arbitrary Maven dependencies,
reflection and unrelated media APIs are outside the current profile. Export
rejects unsupported dependencies and edited adapter-sensitive helper versions;
it does not rewrite student source to hide those differences. Build manifests
record source, adapter, runtime and output hashes. A failed build preserves the
previous successful export.

`npm run check` enforces the reviewed helper inventory and adapter fingerprints.
`npm run verify:web` performs real WebFX/GWT compilation of the helper fixture,
quiz/shared score component and drawing example, then checks interaction in
Chrome. The pull-request workflow runs those same checks. New framework methods
need corresponding fixture coverage; new or changed adapter-sensitive helpers
must be reviewed before their profile fingerprints are updated. Publishing always runs the real compiler; the PR workflow exposes the separate
compatibility check. Branch-protection settings remain an owner decision and
were not changed.

The game trial used a frozen copy of the JavaFX-audio Sky Hop version while the
other chat continued work independently. Later `zero.Sound`/`zero.Music` helpers
from that chat are not included in this branch's reviewed five-helper profile.
Integrate their committed API and browser coverage before claiming that newer
version works. No active game source or canonical framework helper was edited by
this workstream.

## Storage and distribution

Generated output replaces `.zero/web-export/{site,web-export.zip,manifest.json}` and
stays ignored by Git. No JDK, Maven installation or compiler is shipped in the
playable ZIP. The first local export downloads compiler dependencies into Zero's
per-installation cache; later projects reuse them. These downloads are larger
than a game's playable output and are developer/student machine cache space.

The measured full game export with controls was 8.2 MB uncompressed / 7.0 MB
ZIP, including audio and required runtime notices/corresponding source archives.
Its shared compiler cache was about 188 MB. Each export removes its own temporary
build directory and replaces one diagnostic log per project; reusable dependencies
remain cached. Exact output size changes with the source/runtime profile.
Images and audio drive growth; save only exports you want to keep separately.

GitHub setup commits a small source-only `.zero-web` compiler kit and a single
owned workflow, rather than generated JavaScript or compiled archives. The
workflow builds each version and deploys a Pages artifact with one-day retention.
The live Pages site remains independent of temporary artifact expiry. GitHub
still keeps ordinary run/deployment history and account storage/build limits
apply. There is no central Zero game-storage bill or student upload service.
Runtime license/source files in each export must travel with the game; original
student and Zero source retain their own licenses.

## Maintainer checks and limits

```sh
npm run check
npm run test:web
npm run verify:web
# Optional shared local cache:
node scripts/verify-web-export.mjs --browser --cache /absolute/path/to/cache
node scripts/export-web.mjs /absolute/path/to/project
```

The browser check uses the pinned Playwright CLI and a Chrome installation. Its
Linux CI workflow installs Chrome explicitly. For terminal use a JDK must be
available; students use their existing project Maven wrapper and Zero's Node
runtime, with no global Maven/Node installation required.

Focused tests cover simulation, trust, cancellation, source drift, symlinks,
artifact preservation, auth/account/repository changes, setup ownership, exact
run tracking, public marker checks, retries, custom domains, and remembered links.
Real game browser checks cover images, sprite rendering, input, pause/reset/mute,
audio progress, missing-image errors, autoplay recovery and synthetic blur/pagehide.
Physical focus switching, other browser engines, Windows, school authentication
and a real GitHub Pages publication need separate end-to-end verification. No
account grant, push, deployment, release or installed Zero update was performed.
