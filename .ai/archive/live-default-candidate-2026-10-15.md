# Current state — Zero 0.5.16 candidate defaults to live GitHub actions

## Goal and authority

Coordinator: Lead publishing task, thread
`01a13f98-55fc-7471-9038-1198b14d5a98`. Ordinary Java, explicit object updates,
strict browser compatibility, locally tested-build publishing in GitHub, and
ZeroHub links to student-hosted apps. Pika source submission stays separate.

Owner authorized local implementation/testing and the earlier scoped Sky Hop
Pages test. Latest decision: remove confusing simulation default. Owner also
confirmed there are no real users; old development projects may be discarded,
so old-project compatibility/migration is not a release gate. No projects deleted.
Source push/merge, distribution/signing/deployment, new game publication and
ZeroHub activation remain held. Overall goal remains incomplete.

## Current delivery

Use `/Users/stew/.codex/worktrees/web-export/zero`, branch `codex/web-export`.
Reviewed source `44e50e4`: kit/extension0.5.16, readable core0.1.3, native build3.
Live is the manifest/runtime/setup default. Explicit simulation settings remain
honored as an optional testing mode. Tutorial projects remain local-only.
Activation/sign-in/connection do not upload automatically; Upload and branch
changes retain reviews. First/new-destination Publish confirms its public target;
later explicit Publish actions revalidate and update the approved same site
without another destination dialog. No new account grant or publication occurred.

Latest immutable local kit/starter/VSIX:
`dist/candidates/zero-0.5.16-live-44e50e4`. Exact hashes/sizes in its release.json
and `.verification/live-default/package-receipt.json`. Package, verify:kit,
extracted Maven compile, source/license/mode parity, manifest/fallback inspection
and all three checksums pass. No GitHub CI preparation is claimed.

Previous candidate `zero-0.5.16-local-515c064` and Mac development DMG at8badf36
are historical. The old development DMG lacks the live-default change and must
be rebuilt before release. Installed managed preview is still0.5.15; new candidate
is not installed. Public kit0.5.14, signed Mac installer/feed0.5.15/build2 and
sharing policy pin remain unchanged. Original root/game checkouts preserved.

## Acceptance and next gates

Full source regression atd93dd56:427tests,426pass/1PowerShellskip/0fail/cancel.
Final wording-only correction passes24focused +16website example tests and npm
check. Prior full website104/type/build applies to unchanged behavior; current
README generation has its affected16-test acceptance. Prior candidate browser/GWT
and live Sky Hop proof apply to unchanged engine/profilee95aef93…. Current rebuilt
VSIX/starter source parity and extracted Maven compile pass; no fresh native or
full installed-candidate end-to-end run is claimed.

Two independent GPT-6.1 Sol/high initial reviewers accepted two distinct P2 docs
issues (stale default guidance and repeat-Publish confirmation wording). One batch
fixed both; one targeted review is clean at44e50e4. Two launches/three turns,
one initial/one targeted wave,one fix batch. Effective model/tokens unknown.
No added integration wave: complete targeted coverage plus unchanged initial
runtime coverage leaves no concrete gap. Reports/receipt `.verification/live-default/`.

Before release, finish [release gates](../../docs/RELEASE-0.5.16.md):

1. Install the final candidate and accept the entire fresh-project flow: setup,
   ordinary Java edit/Run/Stop, tutorial restrictions, GitHub connection, upload
   cancellation/success, branches, first/repeat Publish and Open/Copy.
2. Align a publicly available trusted-publisher source SHA, operator policy,
   kit pin and enriched website; accept a real linked request and public Play.
   Current pinbeaaca4e rejects web receipts. Library execution remains closed.
3. Resolve native phase2 focus smoke timeout; test fresh workflow consent,
   physical Windows/school setup, classroom network/hardware and sound.
4. Authorize source integration/finalCI; rebuild/sign/notarize/staple Mac build3,
   verify payload/Gatekeeper, seal artifacts/feed and publish/promote exact bytes.

Sky Hop <https://armorup.github.io/zero-sharing-proof/> remains the earlier accepted
live test: sourceb3b6591/run38789445991;68files/8208661bytes match tested build
95dc6665-5860-4674-a5cd-50fcd04a7c7c. Evidence `.verification/live-sky-hop/acceptance.json`.
Local Hub Play passed against a fixture, not a public registry entry. Latest
source receipt `.verification/live-default/acceptance.json`; earlier preparation
[history](student-release-preparation-2026-10-15.md). Storage340GB healthy;
last account weekly reading71%remaining, not task cost. DeepSeek stays paused.
