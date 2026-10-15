# Current state — Mac automatic updater release0.5.15

Owner authorized implementation, verification and release. Source
[PR62](https://github.com/codepetca/zero/pull/62) merged8de180b after reviewed06c2e0a
and CI38670662418 passed. New native setup-v0.5.15 is published; its one immutable
DMG was anonymously downloaded and verified against the sealed candidate. This
metadata promotes that exact download and signed feed through the normal website
build. Kit15 stays local; the published Windows kit14 and core0.1.2 stay separate.
Primary funding checkout untouched; no new chat, automation or tool-backed goal.

Build06c2e0a/preparatione5b566e, sealed
`dist/candidates/mac-0.5.15-e5b566e91c36`. DMG1920629bytes,
SHA2560e8c29d37926a6fae98c1651cd621edc6d358024d1840acf0089c31aea2302e9.
Apple Accepted d25332c4-278d-4b08-9151-a457c0112bdc, DMG staple and app+DMG
Gatekeeper passed. Only the DMG staple is claimed. Ed25519 verifies the exact
archive and signed feed; no key/credential values entered Git or logs.

Independent source, integration, remediation and artifact scopes complete with
no unresolved findings:7launches,2batched fixes, complete within60min; full
receipts in [EVIDENCE](../docs/EVIDENCE.md). Native293/root263+1skip,95website
checks/type/build, focused updater/dependency/provenance/kit checks passed.
Actual isolated signed/notarized automatic and manual A→B upgrades passed,
without app relaunch and with sentinel files/dummy editor preserved. The first
manual observation reopened the closed fixture through Cua; a clean repeat
proved updater behavior correct without changing native code.

Next: independently review this exact publication metadata, verify its CI,
merge, then verify live downloads/feed signatures and record final receipts in
`.verification/release-0.5.15-synced/`. Do not replace public assets or rebuild.
Older installed0.5.14 apps need one manual replacement to gain the updater.
Real unsaved buffers/Java processes, managed devices, Intel/macOS12 and fresh
classroom installs remain untested. Windows EXE/kit15/Hub publication excluded.
Weekly60%remaining; storage311GBhealthy; DeepSeek paused through2026-12-31.
