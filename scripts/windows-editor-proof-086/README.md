# Temporary Zero 0.5.86 Windows editor proof

This branch replaces `windows-native.yml` with a manually dispatched diagnostic.
It is not a replacement for the canonical packaging workflow and must not merge
into the release branch. Source packaging must already have succeeded.

The dispatch takes the packaging run ID/attempt, immutable MSIX artifact ID,
reviewed source SHA and original unsigned package SHA-256. It validates all of
them against GitHub and the original build receipts before installation. The
original bytes remain unchanged; the existing deployment harness signs only a
temporary copy, activates it, checks native first-run setup and cleans up test
package/certificate state.

After real first-run, the scoped helper compares all installed extension files
except installation-modified `package.json` with the embedded VSIX. VS Code's
[Extension Development Host](https://code.visualstudio.com/api/get-started/your-first-extension)
opens those same installed files and a tiny synthetic driver as two
`--extensionDevelopmentPath` entries, with a new profile and a copied synthetic
starter project. The runtime-created driver uses `onStartupFinished` and records
its actual `ExtensionContext.extensionMode` before activating Zero or executing
commands; it requires `ExtensionMode.Development`. No `--extensionTestsPath` is
passed, since that selects Test mode, which Zero's offline development policy
does not recognize. The existing Development-mode policy permits offline use.
No source files in the installed extension are patched, no account is signed
in, and automatic public reports and telemetry are off in the disposable profile.
The Java language extension is disabled in the development host so only Zero's actual
native compiler path can create the source-error diagnostics being asserted.

The test executes public Zero commands and observes public VS Code task and
diagnostic APIs. Windows UI Automation independently checks visible text and
buttons. It requires `Zero 0.5.86` below `Starting from zero`, then a real native
compile of an intentionally invalid local `Main.java`. After task completion,
Zero must expose an error diagnostic with a local source line and exactly one
visible `Show Problems` button. Visible `Show Output` and `Report a problem`
buttons are forbidden in that state. The check observes the entire owned window,
which is stronger than merely checking one inline region. Synthetic screenshots
and sanitized JSON receipts are retained for 14 days as workflow artifacts.

Only the newly created profile/project and processes bound to that profile are
removed by the helper. The existing first-run harness's cleanup receipt still
covers package, certificate, temporary signing files and original-candidate
integrity; it does not claim to delete the first-run runtime/editor caches.

This proves neither an authenticated ordinary student session nor Store signing,
certification, physical Windows 10/11 use, browser builds, actual problem reports,
live GitHub actions or publication. The desktop is Windows Server 2022. Successful
source-bound unit tests are recorded separately from visible native UI proof.

The focused source step covers Start Page, sidebar updates, native/browser runtime
events and controls, browser update/publishing UI, and structured reporting. It
prepares the exact checkout's starter, lesson bundles and extension theme before
running those tests, matching their generated-fixture prerequisites. It
excludes unrelated Student Explorer Git fixtures: diagnostic run `45401485820`
passed package provenance, then four fixtures failed at `git init -q` because they
pass Node's Windows `os.devNull` (`\\.\nul`) as `GIT_CONFIG_GLOBAL`, which Git for
Windows rejects. Their assertions never ran. Canonical CI retains those tests;
this temporary diagnostic does not modify them or claim they passed. That failed
run did not reach package activation or visible editor verification.

After this branch is separately reviewed and made available remotely by the
coordinator, dispatch with the exact successful candidate values:

```sh
gh workflow run windows-native.yml --repo codepetca/zero \
  --ref codex/zero-086-windows-editor-proof \
  -f source_run_id=PACKAGING_RUN_ID \
  -f source_run_attempt=PACKAGING_RUN_ATTEMPT \
  -f source_artifact_id=IMMUTABLE_MSIX_ARTIFACT_ID \
  -f source_revision=FULL_REVIEWED_40_CHARACTER_SOURCE_SHA \
  -f package_sha256=ORIGINAL_UNSIGNED_MSIX_SHA256
```

Inspect the exact dispatched run and all three JSON receipts plus both screenshots.
A green source test step alone is not a passed walkthrough. An accessibility
timeout is an unproven UI check, not a Zero defect or an accepted fallback.

Local checks available on the Mac:

```sh
node --check scripts/windows-editor-proof-086/host.cjs
git diff --check
/usr/bin/ruby --disable-gems -e 'require "yaml"; YAML.load_file(".github/workflows/windows-native.yml")'
```

PowerShell parsing and all actual Windows execution remain runner checks. The
canonical `scripts/windows-editor-window.test.mjs` deliberately asserts the normal
packaging workflow shape and fails on this transient diagnostic workflow; do not
alter that canonical test to make a temporary branch look like release CI.
