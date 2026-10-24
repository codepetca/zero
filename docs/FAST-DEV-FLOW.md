# Faster Zero development flow

Status: implemented locally,2026-10-22; independent review and exact-head GitHub
CI gate the owner-authorized PR/merge. Zero Dev is available on main through
[PR173](https://github.com/codepetca/zero/pull/173). No installer release is part
of this CI change.

## Use now

Follow the default loop in [Development](DEVELOPMENT.md#default-iteration-loop)
and the [Zero Dev guide](ZERO-DEV.md). Iterate locally, run focused checks, then
finish review/docs before the final PR push when practical. Stop the sample before
native focus smoke. Preserve scratch game edits before retiring its worktree.
Installer setup/update acceptance remains separate from source-loop acceptance.

## Affected checks

`ci-scope.yml` is called by the three existing workflows. It reads the actual PR
base/head diff at their merge base, includes deleted paths and treats renames as
old+new paths. A small explicit allowlist permits narrow runs; unknown paths,
invalid input, missing history or classifier errors select every lane. A failed
scope job fails the final gate. Mixed changes select the union.

| Input | Checks selected beyond always-running checks |
| --- | --- |
| AGENTS, .ai, design.md | None |
| README and docs Markdown/styles/images | Website typecheck/tests/build (docs are website inputs) |
| Zero Dev launcher/test and root editor launch configuration | Existing Dev contracts |
| Zero Dev implementation or scripts/dev harness | Native sample playthrough and framework/input/media smoke |
| Explicit Start Page/sidebar render/style/control files and tests, design/playground | Broad extension/setup/design/kit contract suite |
| Shared control CSS and design tokens/adapters/preparation | Source contract suite and website |
| Website app/components/styles/tests/public/content and explicit package/build configuration | Website |
| Website libraries/scripts, shared curriculum metadata, framework, starter, teaching, export/Publish/auth, installer/profile/release, manifests, workflow changes and any unknown input | Full existing matrix |

The exact allowlist lives in `scripts/ci-scope.mjs`; a new file defaults to full
coverage until its dependencies have been reviewed. In particular, shared
website curriculum feeds generated extension lessons, branding feeds native
icons, and starter files ship in the kit, so those are not website/docs-only.
Native selections run `dev:smoke`, including actual sample-game frames and the
existing framework checks. Linux virtual-display checks use JavaFX software
rendering to avoid Mesa/LLVM driver crashes; assertions and timeouts are unchanged.
Full runs retain sharing/Maven consumers, lesson
builds/examples/progression, website and release guards, Windows installation/
update/native JavaFX checks, and real WebFX browser checks.

Always-running source checks include CI selection/gate/browser-fallback tests,
Dev contracts, configuration/syntax/local doc links and the immutable release
boundary check. The `source-gate`, `windows` and `compatible` final gates require
successful scope calculation and successful selected work. A selected job that
fails, cancels or skips cannot pass its gate; intentionally unselected platform/
browser work is reported as skipped. No account permissions or publication
credentials were added.

## Cancellation, provisioning and caches

Each workflow groups PR runs by workflow+event+PR number and cancels superseded
runs. Other PRs and manual dispatches have distinct groups; dispatch cancellation
is disabled. There are no scheduled jobs or automatic releases.

Browser CI first launches the runner's Chrome using the pinned Playwright
package. A successful launch reuses it; unavailable/incompatible Chrome falls
back to the existing pinned CLI installation and must then launch successfully.
The helper reports provisioning milliseconds. There is no browser-binary cache
that could silently supply a different pinned toolchain.

Java setup caches Maven downloads by OS/architecture and dependency inputs.
WebFX separately caches only its verified download directories, keyed by
OS/architecture, JDK21, npm lockfile, starter Maven inputs and exporter inputs.
Both native/API and browser evidence jobs use this preparation. On disposable
GitHub-hosted Linux runners, setup snapshots only a linked
`JAVA_HOME/lib/security/cacerts` into an ordinary file with identical bytes before
compilation. Its original shared target remains untouched. Evidence traversal
still rejects other unexpected links; no certificate trust or API coverage check
is disabled. The CLI requires GitHub-hosted Linux runner markers to avoid
modifying normal developer or student JDKs.

It never caches exported builds, lock state, logs or credentials. The existing
exporter still verifies its artifact/distribution inventory. Cache misses use
normal downloads; cache service failure does not omit verification.

## Run and verify

```sh
node --test scripts/ci-*.test.mjs
npm run test:dev
npm run check
```

Local actionlint validates the four workflow files when available. Classifier
tests cover guidance/Dev/UI/framework/export/auth/installer/shared/unknown cases,
mixed inputs and actual Git rename/deletion history. Gate tests reject selected
skips/failures and failed classification. Browser tests cover warm reuse, cold
fallback and failing installs/launches.

For an explicit full run on a selected ref, dispatch **Release checks and
preparation** (supply its exact current kit version), **Windows launcher checks**
and **Browser export compatibility** from Actions. Every manual dispatch selects
all lanes; release preparation retains its existing version/immutable-asset rules
and does not publish. PR checks are scoped automatically; no manual skip flags
are provided.

PR173's browser install took382seconds. Treat that as one baseline observation;
compare actual GitHub job/step timings and cache-hit receipts for this PR and a
warm full dispatch before claiming measured improvement. Fixture selection is
not a measured small-PR runtime or physical Windows/Linux Zero Dev acceptance.
