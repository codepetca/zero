# Browser games and playable links

This feature is local and unreleased. The implemented baseline adds an optional
browser destination while Run App still opens native JavaFX. The owner-approved
next direction makes the browser the primary application target, with compilation
on the student's computer. The migration below is planned, not implemented.

## Planned browser-first migration

Zero remains a local Java teaching kit: ordinary Java and a strictly approved
JavaFX subset, edited in local VS Code. Keep ordinary control names and explicit
object updates. Reuse the existing pinned WebFX/GWT exporter, adapters and cache;
do not add a second transpiler or a wrapper for every JavaFX control. GitHub owns
student source, GitHub Pages hosts static apps, and ZeroHub stores playable links
and verification metadata. Cloud development, hosted compilation, browser-only
IDEs and online playgrounds are outside this direction.

Two separately reviewable phases share one build contract:

1. **Browser-first Run App.** Save, check compatibility, compile locally, validate
   fresh complete output, then open/reload an owned browser preview. Show clear
   checking/building/running/failure states. Restart, cancellation, project changes
   and Stop must terminate the owned runtime and prevent late build completions
   from launching. Stop must stop JavaScript, animation and audio already running;
   closing the loopback HTTP server alone does not do this. Prove a supported
   managed preview can destroy/recreate its executing frame, including an
   unresponsive game, before choosing it as the default. External-browser control
   requires equivalent lifecycle evidence before making that promise. Retain
   native launch as an explicit optional diagnostic path if useful; never fall
   back automatically after browser compatibility failure.
2. **Strict compatibility.** Check resolved constructor, method and field symbols,
   including inherited calls, overloads, static imports, fully qualified names,
   method/constructor references and relevant Java APIs. Check all application
   source bodies, including code the transpiler would eliminate. An approved
   class must not implicitly approve every inherited member. Restrict dependencies
   and their transitive versions. Fail closed on unresolved/unsupported use, with
   source file/line/column, the offending member and a useful supported alternative.
   Then require the pinned WebFX/GWT compile. Current helper hashes, inventory,
   lexer/import checks and successful GWT builds do not yet provide this guarantee.

The proposed semantic implementation uses local JDK attribution with annotation
processing disabled, without executing student code. Define a versioned contract
of reviewed type/member signatures, overloads and dependency/toolchain hashes.
Check original application sources before adapter rewriting or GWT optimization.
Distinguish student-defined classes from trusted generated code and helpers by
reviewed identities/hashes; a broad package-name exemption is insufficient.

Run, Export and Publish must share an immutable validated snapshot: source,
resources, build settings, compatibility contract, adapters and pinned dependencies,
plus output completeness and hashes. Recheck freshness before preview/publish;
source changes invalidate the current snapshot and require another local build.
A failed build may preserve old files, but must never report them as a fresh run.
Use generation ownership and process cancellation so an earlier completion cannot
replace the latest run. Publishing must bind the clean uploaded source commit to
the exact locally validated app bytes, or build afresh when inputs changed.

The current implementation compiles in GitHub Actions. That must migrate to a
**deployment-only** workflow for the local-compilation direction: upload the
validated local bundle, verify its bounded archive/manifest and source/contract
binding, then deploy those app bytes without recompiling student code on GitHub.
Select and review a supported upload transport before implementation. An ephemeral
draft-release asset followed by deployment-only retrieval is one candidate, not
an accepted design. Bound pending versions, expiry, retry and cleanup; do not add
compiled game history to Git or duplicate it in ZeroHub. Public SHA/run markers
prove delivery/binding, not an unforgeable proof that an owner-supplied local bundle
was compiled from source. Review receipt/schema/checker trust claims accordingly.

Acceptance covers the existing helper, quiz, drawing, audio and Sky Hop fixtures;
negative tests for inherited/unapproved APIs, overloads, references, Java APIs,
dependencies, dead-code use, unresolved symbols and helper tampering; and actual
editor checks for save/restart/cancel/Stop, audio/animation teardown, project
switches, source drift and partial/stale output. Verify deploy-only transport
cannot silently recompile or publish a different snapshot. Preserve native helper
regressions. Windows, other engines, classroom networks and real hosted delivery
need explicit evidence; existing Mac/Chrome results do not establish them.

First settle shared snapshot/contract and preview-lifecycle boundaries; review
phase 1 and publishing transport, then phase 2's semantic gate, then integrated
regression/review. Do not release a strict-compatibility claim before both phases
pass. These changes are currently planning only. No new media caps or automatic
asset transformations are approved. Real account/repository publication authority
and the existing ZeroHub library-checker acceptance hold remain separate gates.

## Implemented baseline

The following sections describe the reviewed local implementation before that
migration, including its current GitHub-hosted build step and optional export UI.

## Student flow

Choose **Publish app** in Zero's GitHub section after finishing and uploading a
change on `main`. Sign in and connect your repository to enable it. First setup reviews the public destination, prepares source-only
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
media calls used by the tested game. All seven reviewed helpers, including
`Sound` and `Music`, retain the ordinary Java API. Image preloading completes before `setup`.
Image startup allows 30 seconds between completed images and at most two minutes
overall; a progressing slow download can outlast the first 30 seconds. Timeouts
name remaining files and suggest checking the connection or reducing image sizes.
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
quiz/shared score component, drawing example and dedicated audio fixture, then checks interaction in
Chrome. The pull-request workflow runs those same checks. New framework methods
need corresponding fixture coverage; new or changed adapter-sensitive helpers
must be reviewed before their profile fingerprints are updated. Publishing always runs the real compiler; the PR workflow exposes the separate
compatibility check. Branch-protection settings remain an owner decision and
were not changed.

The supported profile guards seven helper sources and 98 public/protected Java
API declarations. Changes must update reviewed adapters and behavior coverage;
passing source checks alone is insufficient. Sound aliases share the native cache,
effects overlap, Music players stay independent, and app/window shutdown releases
owned playback. Browser limits are explicit: each Sound keeps at most 32 active or
preparing voices and coalesces blocked autoplay into one pending voice. Music
pause, resume, rewind, repeat, readiness and named decode failures have real browser
coverage. No canonical helper or student game source is rewritten.

## ZeroHub Play latest

Share game automatically includes a playable link only when Zero can reverify a
saved publication for the exact uploaded source commit. There is no extra URL or
descriptor field for students to enter. The trusted checker independently verifies
the repository, successful owned workflow run, Pages destination and public
SHA/run marker before accepting that receipt. Games without a matching verified
publication still share source normally.

ZeroHub shows **Play latest** beside **Download source project**. Play opens the
student-hosted live app, which can change on later publishes; source snapshots
remain exact versions. ZeroHub stores only the link and verification metadata,
not another compiled game. Existing versioned source-project ZIPs still use
ZeroHub artifact storage and include the project assets. Withdrawn games have no
Play action.

New kits use `/api/sharing/catalog/web`; the original catalog endpoint validates
the same data and projects out optional web receipts for older strict clients.
Rollout requires coordinated website/checker policy deployment and a new kit;
existing published kits and the inactive public publication policy remain unchanged.

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


## Performance evidence and budgets

Compatibility tests do not promise a frame rate or startup time on every device.
A cold local Chrome sample with5Mbps/150ms and4xCPU simulation took8.53s to draw
SkyHop's ready screen, then showed16.6ms median/18.2ms95th canvas draw intervals.
The old fixed image deadline failed at1Mbps; the corrected progress window starts
that same game in40.29s. These single headless Mac/loopback samples use uncompressed,
no-store delivery, not GitHub hosting or classroom hardware. First media playing
callbacks are not measurements of physical sound latency.

The tested game has4.43MB of PNGs and1.58MB of WAVs. All packaged images preload,
including an unused0.79MBbird.png; actual requests confirm that cost. About25.17MB
of RGBA pixels excludes browser copies and other memory. Asset diagnostics, formats
validated on target systems, and startup budgets calibrated to school networks are
recommended follow-up work. No new file-size caps, asset deletion, image resizing,
transcoding or Java restrictions were imposed by this correction.
