# Website function bundle publication — 2026-10-27

Owner authorized PR/merge/deploy and hosted storage verification, keeping ZeroJams
hidden. PR213 is synchronized with main9b030d24 (PR212 tutorial repair and PR214
Mac53 promotion); unfinished pilotPR202 is excluded. Release/feed metadata is
separated from learner docs/source. Five route traces omit unnecessary build/UI,
test and duplicate static copies while retaining runtime libraries/templates.
Metadata/feed bytes and learner content match the baseline for the same release.
New trace/runtime audits run in CI; do not skip real merge gates.

Local original-main trace union12.66MB→about7.4MB (~41%); not hosted billing.
Website243tests/build/typecheck and traced-only runtime checks passed before the
latest release-only base sync; rerun relevant metadata/website checks on that sync.
Compiled production Jam endpoints remain404 even after changing process env;
Game/App source generators separately verify staged canonical assets.
Vercel before: download/template functions3.18MB. Reviewed preview29803919:
874kB each (~73% smaller); final production measurements remain pending.
Usage209.53MB deployments/515.12MB functions/14.55MB Blob may lag and include
retained deployments. Do not infer billed savings from local traces or sum shared
function rows. Receipts/PR updates: .verification/function-bundles/ and PR213.

Mac53 is public through PR214/main9b030d24: preserve exact published installer,
signed feed, immutable assets and tutorial metadata. This bundle PR does not
publish native assets or reverse that promotion. Details:
docs/MAC-CANDIDATE-0.5.53.md and docs/EVIDENCE.md. Native Windows21/manualkit17,
older Mac assets, primary funding work, student projects/profiles and Dev watcher
remain. Separate local Tutorial-label/footer work is outside this PR. Normal
Greeting project was edited by the owner; preserve it. Keep active pilot/recovery
copies; no credential, protection, invitation or Jam-cap change. Safari/device/zoom
and sponsor/merch work stay paused; no new task or automation.
