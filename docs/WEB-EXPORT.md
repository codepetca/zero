# Browser games and playable links

Mac 0.5.43 uses native JavaFX for Run App. To publish, stop the app, open the
arrow beside **Run**, then choose **Publish app**. GitHub setup and a connected
repository are required for publishing. Earlier downloads retain their
bundled Run behavior. Publish app or advanced Export for web performs browser
compatibility checks and compilation.

Zero remains a local Java teaching kit. Students write ordinary Java and JavaFX
in local VS Code. Run App uses the project Maven wrapper to open a native desktop
window. Browser compilation is deferred to Publish app or the explicit advanced
Export for web action. Their computer performs the pinned WebFX/GWT compilation;
GitHub owns source and Pages hosts static apps. Cloud development, hosted Java
compilation and online playgrounds are outside scope.

## Native Run and explicit browser builds

Run App saves files, stops a previous run and invokes the project Maven wrapper
with `clean compile javafx:run`. Stop cancels the owned build or JavaFX process;
closing the app window returns Run to idle. Build errors appear in the task
terminal and Problems. Local Run does not invoke the browser API checker or
WebFX compiler and never requires GitHub sign-in. A successful native run does
not prove that an app can be published for the browser.

After Export for web, Preview export opens a managed browser preview. It serves
cloned immutable output bytes from a token-protected
loopback server. Rebuilding/exporting later cannot change an already running
app's assets. **Open in browser** in the export preview opens a preview-only
page in the default browser around those same output bytes. A persistent liveness
connection removes its child app frame when Stop, rerun or disposal ends that run.
The server sends one-second heartbeats; a silent channel expires within4.5seconds
while browser timers/events run. Suspended tabs or blocked browser execution can
delay teardown. This shell is never added to exported/published files and its
loopback URL is not shareable publicly. This preview is separate from normal
native Run.

Export and Publish share a browser snapshot validator. It binds Java, resources,
pom.xml, Maven wrappers/config, the complete exporter/compatibility profile and
all output hashes; it verifies ZIP contents against the site and rejects missing,
changed, additional or stale output. Unchanged successful builds can be reused.
Changing any input or compiler rule requires another local build. Publishing
compares all build inputs against the reviewed uploaded commit, including files
Git status might hide as ignored. Standard CRLF/LF equivalence is allowed only
for Java/known textual Maven inputs; resources must match the commit exactly.

Unreleased preservation implementation: newly assembled projects track their
complete browser builder in `.zero-build`, alongside `zero-core.json`, Java
source and Maven setup. A newer editor reads bounded metadata on open and leaves
those files unchanged. An explicit browser action in a trusted workspace verifies
the saved closure, runs a frozen copy with a separate Node/JDK process, withholds
GitHub credentials, and checks its inputs and output before accepting the build.
Missing tools or saved files produce a tooling-unavailable result; the editor
does not silently use its latest compiler. Publish no longer upgrades helpers.
Current runtime requirements and standalone commands live in that project's
`.zero-build/README.md`; no central historical-kit database is required.

Finished site/ZIP validation is separate. Previewing or saving retained output
checks its own file hashes and ZIP bytes without the Java compiler, current
framework source, current browser profile or live library catalog. Publishing a
new source version still requires current saved-builder validation and exact
uploaded-commit binding. Local implementation/review is separate from released
kits, private runtime provisioning and real authenticated Pages acceptance.

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

Only the inventoried helpers at exact reviewed paths/hashes receive trusted
adapters; a package name is not an exemption. The normal teaching path uses Zero
controls with explicit object updates; supported JavaFX remains an advanced path. Ordinary class-resource lookup is supported in
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

The verified game subset includes `Math.hypot(double, double)`, `Math.abs(double)`,
`Math.atan2(double, double)`, `Math.sin(double)`, `Math.cos(double)` and `Math.PI`.
The live-control simulation also uses `Integer.parseInt(String)` with ordinary
`IllegalArgumentException` handling and range validation before state changes.
The radix overload is not admitted.

Angles in those Math methods use radians. `Actor` uses clockwise degrees from the
right, with explicit `update(seconds)` and `draw(app)` calls. Its reviewed browser
fixture exercises subclass inheritance, movement and aiming, image replacement,
animation advancement and centered drawing. Actors do not register themselves
with the game loop. `ArrayList.isEmpty()` and `ArrayList.remove(Object)` work with
ordinary Java semantics: object removal deletes the first equal item and returns
whether it found one; `remove(int)` still removes by index and returns the item.
The declared receiver must be an `ArrayList`; approval does not extend to every
`List` implementation. Number-row `KeyCode.DIGIT1`, `DIGIT2`, `DIGIT3` and
`KeyCode.ESCAPE` are verified through real browser key events. `Color.rgb(int,
int, int)` accepts channels from 0 through 255 and creates an opaque color.
Other overloads and neighboring key constants remain outside this verified subset.
The same math and collection assertion source runs on the native JDK and in the
pinned browser build; browser checks also verify RGB pixels and invalid channels.
Some unsupported signatures include concrete alternatives in Problems, such as
`new ArrayList<>()` instead of its capacity constructor, string concatenation for
simple labels, and a timer advanced from `update(seconds)` instead of sleeping.

## Student flow

Choose **Publish app** from the arrow beside Run after testing the app.
Sign in and connect your repository to enable it. Publish saves open files, commits
pending changes through the normal message input, pushes any unuploaded commits,
and validates that the deployed source matches the uploaded commit. A clean,
uploaded `main` skips the upload; already committed work needs no new message.
A cancelled or failed upload stops deployment. A change branch gets guidance to
finish with **Merge to main** first; Publish never merges or switches branches.
First setup
shows a short public-visibility warning and destination, prepares a small
deployment-only publishing kit, asks VS Code for GitHub workflow permission,
and uses the Commit & push message input. Zero validates the uploaded version
and continues publishing without another confirmation.
When an unchanged publishing kit from a recognized earlier Zero version needs
an update, **Publish app** offers **Update publishing files**. The review lists
the affected deployment files; the app source and public destination stay the
same. The old files remain recoverable in project
history. Zero then uses ordinary **Commit & push** and checks the exact uploaded
version again before publishing. Cancelling the update decision leaves the old
kit and live site untouched. Cancelling Commit & push after accepting the update
keeps the updated files locally; finish the upload before retrying Publish app.
Edited, incomplete, unknown or symbolic-link setups are preserved and
need review; Zero does not treat an ownership marker alone as permission to
overwrite files. Managed-kit updates currently need an ordinary Git clone; a
linked worktree keeps its files and gets guidance to use a standalone clone.

Later publishes reuse the approved destination and stable URL. Repository
visibility is never changed. The deployed game and its included assets are public,
including when the source repository is private and the account supports Pages.

Wait for **App published** in the sidebar, then use its **Open app**
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

For advanced manual publishing preparation, choose **Export for web** from the title menu or Command
Palette. After the cancellable build finishes, the sidebar offers **Preview export**,
**Save ZIP**, and **Share export…**. The managed preview is local; other people cannot use its loopback URL. A
saved ZIP can instead be uploaded as an HTML game on itch.io. Students choose
visibility there themselves.

## Ordinary Java and compatibility

### Screen size and touch

Browser builds of `GameApp` fit the complete game view inside the available
screen, preserving its aspect ratio. Small screens shrink the view; larger
screens keep its original size and center it. The canvas, `width()`, `height()`
and game coordinates stay unchanged. Padding and controls added around the canvas
are included in the fitted view. Resizing or rotating the browser recalculates
the fit. Ordinary `App` forms keep their normal JavaFX layout.

A finger on the game canvas acts as the primary mouse button. `mouseX()` and
`mouseY()` use the original game coordinates after scaling, and dragging can
continue outside the canvas until release. The canvas owns one touch at a time;
the GameApp view ignores additional fingers before they can change mouse input.
Cancelled touches and
lost focus release held input. Normal buttons and text fields retain their own
browser interactions.
Desktop games can check `MouseButton.PRIMARY`, `MIDDLE` and `SECONDARY` through
the same `mouseDown(...)` and `mousePressed(...)` methods.

Fitting the view does not make every game suitable for a phone. Students still
choose readable text, large enough targets and controls that work without a
keyboard. Zero does not create on-screen arrow keys or a joystick. Native JavaFX
window behavior is unchanged. Existing exported or published games need a fresh
build with this runtime before they receive the fitting behavior.

Students keep `Main.java`, explicit object updates, ordinary Java classes and
their supported Zero or advanced JavaFX APIs. The exporter compiles a temporary copy with pinned WebFX/GWT modules.
Its adapters cover the reviewed Zero helpers, canvas images and sprite regions,
keyboard/mouse state, focus, supported JavaFX controls and the bounded JavaFX
media calls used by the tested game. Reviewed helpers, including `Sound`,
`Music` and the Zero UI facade, retain their ordinary Java API. Image preloading completes before `setup`.
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
quiz/shared score component, drawing, dedicated audio, resource/control greeting
and padded portrait-game fixtures, then checks interaction in
Chrome. The pull-request workflow runs those same checks. New framework methods
need corresponding fixture coverage; new or changed adapter-sensitive helpers
must be reviewed before their profile fingerprints are updated. Publishing requires a validated local compiler result; the PR workflow exposes the separate
compatibility check. Branch-protection settings remain an owner decision and
were not changed.

The supported profile guards the exact helper inventory and public/protected
Java declaration count in `scripts/web-profiles.mjs`. Changes must update reviewed adapters and behavior coverage;
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
