# Browser games and playable links

This implementation is local and unreleased. Zero remains a local Java teaching
kit. Its primary Run App target is now an owned browser preview, using the same
pinned WebFX/GWT pipeline as Export and Publish. Students write ordinary Java and
approved ordinary JavaFX APIs in local VS Code. Their computer does compilation;
GitHub owns source and Pages hosts static apps. Cloud development, hosted Java
compilation and online playgrounds are outside scope.

## Run App and the validated build

Run App saves, checks every original Java source, compiles locally when needed,
validates a fresh complete snapshot and opens a managed browser panel. Checking,
building, running and failure states are distinct. Restart destroys the old
runtime before building again. Stop, cancellation, project changes and extension
disposal abort owned work and destroy the executing frame and audio; a late build
cannot reopen it. A failed build preserves the previous files without calling
them a fresh running app. Run never requires GitHub sign-in.

The managed preview serves cloned immutable output bytes from a token-protected
loopback server. Rebuilding/exporting later cannot change an already running
app's assets. This differs from merely closing an HTTP server while JavaScript
continues in an external browser. Explicit **Run App Natively (diagnostic)** stays
available in the Command Palette; browser failures never silently fall back to it.

Run, Export and Publish share a snapshot validator. It binds Java, resources,
pom.xml, Maven wrappers/config, the complete exporter/compatibility profile and
all output hashes; it verifies ZIP contents against the site and rejects missing,
changed, additional or stale output. Unchanged successful builds can be reused.
Changing any input or compiler rule requires another local build. Publishing
compares all build inputs against the reviewed uploaded commit, including files
Git status might hide as ignored. Standard CRLF/LF equivalence is allowed only
for Java/known textual Maven inputs; resources must match the commit exactly.

## Strict WebFX compatibility

A local JDK semantic checker attributes original sources before browser adapters
or GWT optimizations. Annotation processing is disabled and student application
code is not executed by this checker. A versioned explicit contract approves
resolved constructor/method/field signatures, their declaring owners and overloads.
It covers inherited calls, method/constructor references, static imports, Java
APIs and all application bodies, including dead code. Class permission does not
approve every inherited API. Unsupported or unresolved use produces original
file/line/column diagnostics in Problems. Native methods/JSNI and source-defined
runtime namespace spoofing are rejected.

Only seven helpers at exact reviewed paths/hashes receive trusted adapters; a
package name is not an exemption. Keep ordinary JavaFX control names and explicit
object updates. Ordinary class-resource lookup is supported in
`Main.class.getResource(...)` and `getClass().getResource(...)`; unrelated
reflection remains unavailable. Resource URL types are resolved before adaptation,
including fields, parameters and return values shared between Java files. Source
adapters operate on temporary copies.
Canonical framework sources and the original game remain unchanged.

JavaFX dependencies use the reviewed pinned version; arbitrary libraries, inherited
POM dependencies/profiles/BOMs and unapproved API members are rejected. Attribution
jars and wrapper/properties are hash-checked. A pinned Maven distribution ZIP is
verified before installation; its complete reviewed 96-file inventory is checked
before and after compilation, including cached launchers and libraries. Compilation
executes frozen reviewed wrapper copies with generated build settings, not project
Maven hooks. The checksum
catalogue verifies present compiler/runtime Maven jar/POM bytes before and after
compilation; extra catalogue entries do not approve application dependencies or
require downloading that entire catalogue. The real pinned GWT compilation remains
mandatory after semantic checks. Successful output contains a compatibility receipt.

The source-based examples use the reviewed teaching subset. The maintained
external-stylesheet greeting is outside the browser profile: the pinned WebFX
Parent has no getStylesheets() API, so attribution rejects it with its original
source position before compilation. Its Java and CSS remain unchanged for native
use. The two packaged examples using the separate starter-ui JAR also remain
outside this dependency profile; their source-composed counterparts stay available.
WebFX uses browser CSS rather than emulating JavaFX CSS; see its
[documentation](https://docs.webfx.dev/). No stylesheet shim or silent styling
removal is introduced. This is an approved teaching subset,
not all Java/JavaFX. New APIs require explicit contract review and positive/negative
coverage, actual WebFX compilation and browser behavior checks. No per-control
wrapper language or second transpiler is introduced.

## Student flow

Choose **Publish app** in Zero's sidebar after merging and pushing a
change on `main`. Sign in and connect your repository to enable it. First setup
shows a short public-visibility warning and destination, prepares a small
deployment-only publishing kit, asks VS Code for GitHub workflow permission,
and uses the Commit & push message input. Zero validates the uploaded version
and continues publishing without another confirmation.
Later publishes reuse the approved destination and stable URL. Repository
visibility is never changed. The deployed game and its included assets are public,
including when the source repository is private and the account supports Pages.

Wait for **Your playable game is live** in the sidebar, then use its **Open app**
or **Copy playable link** buttons. Successful actions no longer show popups. These commands also live in the Zero title menu and Command
Palette. Pika still receives the separate source repository link. Publishing
tracks the exact GitHub workflow run and checks an unauthenticated public marker
containing both source SHA and run ID before offering the link. A previous live
page remains available when an update fails. Pending runs and the last verified
link survive editor restarts.

A school policy, missing capability, account plan, protected environment or
existing unknown Pages setup produces a specific next action and **Recheck**.
Zero does not replace an existing website/workflow or change a custom domain.
Simulation mode exits before saving, requesting authentication, writing setup
files or making network calls. Live is the default. First/new-destination publishing
requires review and confirmation. Later explicit Publish actions revalidate and
update the approved site without another destination dialog.

For a separate export choose **Export for web** from the title menu or Command
Palette. After the cancellable build finishes, the sidebar offers **Preview export**,
**Save ZIP**, and **Share export…**. The managed preview is local; other people cannot use its loopback URL. A
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
quiz/shared score component, drawing, dedicated audio and resource/control greeting fixtures, then checks interaction in
Chrome. The pull-request workflow runs those same checks. New framework methods
need corresponding fixture coverage; new or changed adapter-sensitive helpers
must be reviewed before their profile fingerprints are updated. Publishing requires a validated local compiler result; the PR workflow exposes the separate
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

GitHub setup commits a small deployment-only `.zero-web` kit and one owned
workflow. Zero validates and packages the local output, uploads it as a uniquely
named temporary draft-release asset and dispatches its exact asset/release IDs,
source SHA, profile hash and archive digest. The runner only downloads, validates
and extracts data, adds a source/run marker, then uploads a Pages artifact; it
never compiles Java or executes the bundled game. App bytes stay unchanged.

Extraction rejects traversal, links (the archive format has no link entries),
duplicate/conflicting paths, bad hashes and incomplete output. Transfer is bounded
to128MiB of app data/20,000 files; this is a publishing transport limit, not an
image/audio format policy or automatic asset transformation. Uploads have a separate
180-second timeout and remain cancellable. Operational errors preserve the old page.

Workflow finalization and client retries delete only the exact owned staging draft.
A lost creation response retains its unique name and blocks further staging until
bounded recovery identifies it safely. Drafts have no automatic expiry; an offline
client, revoked access or unresolved creation can require repository draft cleanup.
Recheck retries rather than silently accumulating uploads. Pages artifacts use
one-day retention; the live site remains independently available. Normal GitHub
run/deployment history and account limits still apply. Compiled app bytes never
enter source Git history or ZeroHub storage.

Local manifests and public markers bind delivery to the selected source/run; they
are owner-supplied evidence, not an unforgeable proof of compilation. ZeroHub's
trusted checker still verifies its existing repository/workflow/run/Pages receipt
contract. Its separate acceptance and activation hold remains in force.

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
The installed macOS preview and real test Pages publication are now accepted.
Sky Hop at <https://armorup.github.io/zero-sharing-proof/> serves the same68files
as tested locally; all public lengths/SHA256 values match. Native Upload, Publish,
Copy playable link and saved Open Published App passed using an existing VS Code
session. Independent reviews cover the compiler path and workflow-session retry
fixes; see [verification](VERIFICATION.md). Physical Windows/classroom hardware,
other browser engines, first-time workflow OAuth consent and physical audio remain
untested. This test publication did not authorize a Zero distribution release or
ZeroHub activation. The0.5.16 preparation and remaining coordinated policy rollout
are recorded in [release readiness](RELEASE-0.5.16.md).


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
