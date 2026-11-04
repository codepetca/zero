# Zero release ledger

Last reconciled: 2026-11-04 (America/Toronto). This is a dated working record,
not proof of current live status. Before reporting or releasing, check the live
service, exact source revision and applicable release gates. Do not infer
permission to publish from this ledger.

| Surface | Last verified state | What's next |
| --- | --- | --- |
| Website | Mac 0.5.62 download and exact signed feed verified live November 4; 0.5.63 promotion is pending deployment. | Verify the 0.5.63 download and exact signed feed after this change is deployed. |
| Mac installer | [0.5.63](https://github.com/codepetca/zero/releases/tag/setup-v0.5.63) published November 4; anonymous download matches the sealed candidate. | The 0.5.61→0.5.62 live update passed on the maintainer Mac. The 0.5.63 update and fresh Mac installation remain untested. |
| Windows Store | [Zero Studio](https://apps.microsoft.com/detail/9mxkd6dqlfgx) is publicly listed; the owner confirmed publication on November 2. | Verify the installed version and test Store installation and updates on Windows. |
| Windows standalone download | [0.5.59 unsigned preview](https://github.com/codepetca/zero/releases/tag/windows-preview-v0.5.59) and its [matching manual kit](https://github.com/codepetca/zero/releases/tag/windows-manual-v0.5.59) published October 31. | Physical Windows and school-device acceptance remains outstanding; updates are disabled. |

The 0.5.58 Store candidate includes Project Explorer and online Tutorial Docs
updates, recent tutorial changes, and Store Java/VS Code startup fixes. Its exact
package passed a Windows first-run test; WACK reported a DPI warning and an optional
blocked-executables finding, disclosed with the submission. See the
[Windows validation run](https://github.com/codepetca/zero/actions/runs/41134687731).
The candidate source is on a release branch; do not assume its Store fixes are
merged into main. The Store submission does not publish a Mac or standalone Windows
installer.

## Setup Help simplification

A concise version-free guide and platform-specific instructions passed 36 focused tests, website build and a Mac/Windows browser check. Independent Terra/medium review identified broken links and missing Git identity help; both were corrected and the targeted review was clean. Deployment is verified separately after merge.

## Mac 0.5.60 verification

The signed candidate from `c431f824` was Apple-notarized and stapled. Its
anonymously downloaded DMG matches the sealed candidate. The exact bundled VSIX
installed into a disposable VS Code profile and reports 0.5.60. The existing Mac
installation was preserved; launcher, upgrade delivery, fresh-Mac and physical
Intel acceptance remain untested.

## Mac 0.5.59 verification

The 0.5.59 candidate was signed, Apple-notarized and stapled. The existing Mac
launcher was replaced after backing up 0.5.55; the installed app, managed kit
and extension reported 0.5.59. The existing Coin project reached its first game
frame when launched from the candidate. Automatic update delivery and a fresh
Mac remain untested. The public DMG hash matches the sealed candidate.

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
