# Reporting setup-consent refinement — 2026-11-19

Owner requested the Windows CI correction and actual native walkthrough so the
reporting feature can merge and be enabled after gates. [PR386](https://github.com/codepetca/zero/pull/386)
remains draft and production collection remains disabled. New owner refinement:
one first-run public-consent choice, then silent eligible errors and direct manual
submission when consent is on; opted-out manual submission retains confirmation.
First-run consent and direct reporting are implemented at `1aa465165`; a targeted
revocation/retry correction is `f6b11ceca`. Root owns integration/native acceptance.
No OS installer consent exists. Windows reviewed source `7a929a131` binds published kits to original release
source and hashes, retaining strict new-candidate verification. 24 focused cases,
actionlint/source checks, two independent reviews and one targeted CI correction
review pass. Hosted Windows, browser and source gates all passed at `4f83811f3`; final
consent-source hosted gates follow.

Installed VS Code/current extension verifies the one-time public choice, persisted
Allow selection, no repeated setup notice, and direct manual submission without
another confirmation. The disabled-service Retry/Copy fallback remains safe.
Native success after deployment remains pending. Existing
project windows and the original dirty checkout are preserved. The unused local
editor copy is ignored and is not a shipping artifact.

App `codepet-zero-reports`5827621/installation183555907 has issues-write/metadata-read
access only to public `codepetca/zero-reports`1463652567. Vercel Free Neon resource
`zero-reports`, project `crimson-silence-47818786`, uses restricted runtime and a
direct verified-TLS connection. Nine production-only server variables are staged
with collection disabled, three secrets sensitive, no provisioning-owner binding.
Credentials remain outside Git. Restore history is verified at6h; report records
and public issues persist until operator removal, with no automatic deletion.

Next: stable-head green hosted gates, mark ready and merge within owner authority,
verify exact-source production deployment, enable the service with a fresh build,
retry the native draft and verify its bot issue/receipt, configure and dispatch
reconciliation. Preserve public consent/default-off behavior; no installer/editor
release is included. Physical Windows and future scheduled execution are distinct
acceptance evidence. See [operation](../docs/PROBLEM-REPORTING.md) and
[evidence](../docs/EVIDENCE.md).
