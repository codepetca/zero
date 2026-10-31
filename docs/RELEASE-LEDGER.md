# Zero release ledger

Last reconciled: 2026-10-31 (America/Toronto). This is a dated working record,
not proof of current live status. Before reporting or releasing, check the live
service, exact source revision and applicable release gates. Do not infer
permission to publish from this ledger.

| Surface | Last verified state | What's next |
| --- | --- | --- |
| Website | Tutorial changes through PR #239 (`88295b04`) deployed automatically from main on October 30. | Confirm the live deployment when reporting later changes. |
| Mac installer | [0.5.55](https://github.com/codepetca/zero/releases/tag/setup-v0.5.55) published October 28. | Merged app changes since 0.5.55 need a separately authorized release. |
| Windows Store | Product 0.5.58 candidate at `f74ed9ce` was submitted October 30. On October 31 Partner Center showed certification in progress; publishing is held for **Publish now**. The candidate includes main through PR #239. | Recheck Partner Center before reporting or taking any action. Certification approval and public availability are not yet confirmed. |
| Windows standalone download | [0.5.59 unsigned preview](https://github.com/codepetca/zero/releases/tag/windows-preview-v0.5.59) and its [matching manual kit](https://github.com/codepetca/zero/releases/tag/windows-manual-v0.5.59) published October 31. | Physical Windows and school-device acceptance remains outstanding; updates are disabled. |

The 0.5.58 Store candidate includes Project Explorer and online Tutorial Docs
updates, recent tutorial changes, and Store Java/VS Code startup fixes. Its exact
package passed a Windows first-run test; WACK reported a DPI warning and an optional
blocked-executables finding, disclosed with the submission. See the
[Windows validation run](https://github.com/codepetca/zero/actions/runs/41134687731).
The candidate source is on a release branch; do not assume its Store fixes are
merged into main. The Store submission does not publish a Mac or standalone Windows
installer.

## In-progress Mac candidate (2026-10-31)

0.5.59 has been built, Apple-notarized, stapled and sealed locally at
`dist/candidates/mac-0.5.59-4bb9ba15c24d`. The installer metadata is in draft
[PR #242](https://github.com/codepetca/zero/pull/242). The existing Mac launcher was replaced from the candidate DMG after backing up
0.5.55; the installed app, managed kit and extension report 0.5.59. The existing
Coin project opened and reached its first game frame when launched from the DMG,
and the installed launcher reopened the editor. Automatic update delivery and a
fresh Mac remain untested. The candidate and update feed are not yet published.

## Updating this record

- When app changes merge, record their PRs and affected surfaces as pending until
  the corresponding release includes them. Website deployment can happen separately.
- When building or releasing, record version, full source commit, artifacts,
  checks and live status; link to detailed evidence instead of duplicating it.
- Distinguish built, submitted, certified and publicly available. Preserve dates,
  uncertainty and explicit publication holds. Verify GitHub, the live website or
  Partner Center as applicable; do not rely on a previous chat alone.
- Update this file in the same source change when practical, or leave an explicit
  handoff if the release state changes after the source PR is merged.
