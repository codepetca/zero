# Exact API evidence (execution pending)

`api-signatures.json` records all 183 attributed source declarations, including
protected hooks, constants and exact overloads. Every declaration now has a
meaningful native and browser assertion mapping. `coverage-gaps.json` records
zero unmapped declarations and **zero executed target outcomes**. All 366 actual
outcomes remain pending until the selected real runs produce current receipts.
Source generation, compilation, attribution and unit tests count as no framework
execution evidence.

The native harness retains its seven serial finite checks. Six emit API events:
ActorCheck, UiCheck, GameHelpersCheck, AudioCheck, NavigationCheck and
PaddingLauncher. The four browser families are helpers, zero-ui, audio and
lifecycle. Core/source, producer/profile, contract, tools, harnesses, fixture
sources, Java observations and actual compiled outputs are bound by retained
hashes. Loading receipts remeasures current input bytes. Actual POM, wrappers, `.mvn`
files and `zero.json` are retained and compared with current canonical bytes.
Native receipts bind the transitive assembly producer closure, actual Node,
Java and javac, JDK runtime modules/JVM, and the Maven distribution identified
by its startup banner (launcher, libraries and configuration). Native runs use
an explicit recorded local Maven repository. Ordinary INFO goal headers identify
the executed plugin versions; each plugin JAR and the complete resolved
dependency list in its plugin descriptor are bound, including every cached JAR
classifier at each listed GAV/version. Loading receipts rechecks that closure
and rejects missing, changed or newly added dependency JARs. No debug output or
whole-repository inventory is used. Receipts are trusted
local harness evidence, not cryptographic attestation against a hostile writer.

Drawing uses fixed atlas cells with immediate before/after witnesses. All four
Actor artwork setters replace blue with orange; animation replacements then
advance their owned playback to blue without advancing the reusable source.
Image constructors must also paint their supplied artwork. Native checks snapshot the actual Canvas
immediately; browser wrappers emit off-canvas markers immediately after Java
calls, and the harness samples real RGBA bytes before later draws can overwrite
them. Text checks require nontransparent ink in the expected region. Pending P
records require those retained samples.

UI, frame and media effects can remain O records until an actual observation
passes. Native later phases call `ApiProof.complete`; browser observations come
from actual DOM, rendered frame counters and media elements/public playing text.
Failed, missing or duplicate completions cannot produce passed outcomes. The
final GameApp hooks are reached through the real App.start/stop call path and
completed by configured Canvas/Scene observations, delivered frames, retained
controls and stopped-frame checks. The first update/draw callbacks also check
zero initial time and ordering. No unused factory call establishes coverage.

Known finite numeric fixture fields pass explicitly through `ApiProof.number`
before string transport, so an integral double has the same spelling on the JVM
and GWT. Text fields, labels, booleans and completion strings still use exact
String comparison; numeric-looking text is never coerced. Java tests retain
fractional and negative numeric witnesses and reject altered text and nonfinite
numeric observations. Browser startup checks surface Java assertion errors
promptly; failed cases retain their observed diagnostics and a screenshot when
available, and the verifier saves the failed harness log.

Button callback replacement uses actual activation. Disabled-control evidence
retains before/after state around attempted blocked input. Media evidence checks
real playing voices, held pause position, rewind, and continued looping across
an actual media duration. Browser audio receipts retain the first complete flow
before the fixture reloads for its separate restoration checks. Helpers likewise
capture their successful Java transport before delayed-image and deliberately
failed loading reloads, so those later pages cannot discard or replace it.

The lifecycle case combines two fresh page executions (UI stop, then game/fault
flow), retaining both Java blocks. It has menu, first-frame and independent
setup/update/draw/UI/shutdown/missing-asset fault controls plus an actual rejected
browser promise. Parent preview tests establish message-port identities and
protocol messages; these fixtures establish observed UI/frame/error behavior.

The browser type contract permits Scene so an ordinary App.createScene override
can name its advertised return type. No Scene constructor or member surface was
added; a semantic regression still rejects Scene.getRoot. The core API remains
183 declarations.

The default native verifier retains receipts in a unique ignored run directory.
When all six emitting native cases are selected it requires zero native gaps.
The browser verifier similarly gates all four API families when they are
selected together. Partial selections retain partial evidence and cannot claim
complete coverage. Logical pointer targets are scaled through the actual Canvas
bounds and checked within one thousandth; this hardening addresses a source
inference, not an observed browser failure.

After the authorized actual runs:

```
node scripts/verify-framework.mjs --evidence=.verification/api-evidence
node scripts/verify-web-export.mjs --only=helpers,zero-ui,audio,lifecycle --browser --output .verification/web-export-checks
node scripts/api-evidence.mjs --report --receipts .verification/api-evidence
node scripts/api-evidence.mjs --report --receipts .verification/web-export-checks/api-evidence
```

Copy the distinct native/browser case directories into one directory for a
combined `--require-complete` report. That gate must keep failing until all 366
outcomes have current executed receipts. Physical Windows, additional browser
engines and interactive/platform behavior require their own actual verification.
