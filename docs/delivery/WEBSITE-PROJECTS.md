# Website course projects and readers

ZeroHub now opens a minimal original-course starter, with four complete practice
examples and three optional advanced projects. All 26 earlier example links and
source downloads remain available. The five already-published codepetca template
repositories provide Use template, cloning guidance and a separate ZIP alternative;
students create and submit their own repositories in Pika.

Docs opens setup directly in the shared themed reader. Lessons open their sections
by default, retain optional collapse and fragment navigation, and use Lucide SVG
controls. Existing local-only lesson scaffolds and native GitHub account buttons
are preserved from current main. Source ZIPs use explicit canonical manifests,
pinned build files, shared archive inspection and regular-file/path guards.

Delivery branch: `codex/website-project-templates`, based on
`5c4a3fd08f4332e4927e646c97b9e50a5b2dbdd2`. Only approved website, preview, preparation
and related documentation changes were transferred from the earlier local branch.
Main's lesson progression, framework, extension and release files remain intact,
including the newer Study edge-padding update merged in PR 44.
Tracked assets are 28 native-app preview PNGs and authored template metadata;
generated ZIPs, snapshots, compiled files, dependencies and receipts stay ignored.

Validation on macOS, 2026-10-13:

- Website tests: 78 passed, no failures or skips.
- Website TypeScript/route generation: passed.
- Production build: passed, 61 generated pages.
- Shared design generation/drift check and playground tests: 3 passed.
- All 27 newly assembled current-main projects: Maven clean compile passed.
- Production HTTP smoke: all 27 Hub pages and exact ZIP sizes/hashes passed;
  Docs/course guide, three local-only lesson starts, community account actions
  and unknown/repeated/ambiguous selector rejection passed.
- Fresh read-only GitHub requests confirmed all five repository IDs, public
  visibility, template flags, main commits and tree IDs match tracked metadata.
- Diff whitespace and path inventory: passed; no extension/framework/release
  files, credentials, generated packages or private files enter this PR.

Earlier browser evidence is retained in the source worktree's ignored
`.verification/template-repos/`, `.verification/course-project/` and
`.verification/hub-examples/`: desktop and 320px selectors, template/repository
links, contained clone instructions, the real starter template form without
submission, and source ZIP download/hash checks. Prior anonymous clones of the
five templates matched all 85 approved file bytes/modes and compiled. Fresh
27-project compile and GitHub metadata receipts are in this worktree's ignored
`.verification/website-delivery/`.

The Study PNG retains the actual app capture from before PR 44 added edge padding;
its current-main source ZIP includes that newer padding. Previously published
template commits remain fixed at their recorded sources.

Windows, WebKit, enlarged text/400% zoom, novice authenticated native upload and
website deployment are unverified. Template repositories were already published;
this delivery does not republish them or create a student repository. Independent
PR review, exact-head CI and the authorized coordinator merge remain pending.

The first local build attempt rejected cross-worktree dependency symlinks.
A fresh healthy storage check (320 GB available) preceded local pinned `npm ci`;
zero audit vulnerabilities were reported. Dependency symlinks were removed before
rerunning the production build. No source correction was needed for that setup.
