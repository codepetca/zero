# Zero repository boundaries

[codepetca/zero](https://github.com/codepetca/zero) owns the teaching kit and sharing platform. Students own their game repositories. They can extract related classes into `libraries/<slug>/` in that same repository, or share a whole game as an editable project.

| Folder | Responsibility |
| --- | --- |
| `framework/` | Ordinary Java SimpleApp and GameApp |
| `extension/` | Supported VS Code Run, GitHub and sharing tools |
| `student-template/` | Standalone Maven project, lessons and examples |
| `libraries/` | Maintained sample source, examples and checks |
| `sharing/` | GitHub intake, durable registry, immutable publication and game packaging |
| `website/` | Vercel download, learning and public catalog pages |
| `hub/checker/` | Disconnected former checker reference; no active publication authority |
| `profile/`, `release/`, `scripts/` | Editor settings, release definitions and verification |

The dedicated GitHub branch `zero-sharing-registry` stores `registry/state.json`, updated with Git blob compare-and-swap. Issue events are hints; reconciliation discovers requests again. Numeric repository and owner IDs bind source ownership; exact commits freeze submissions. Library IDs and Java namespaces derive from repository ID and slug, so account renames do not rename imports. Publication stages bytes before reserving an exact version, then delivers immutable Maven or game ZIP paths and a content-addressed catalog. Interrupted delivery resumes without replacing accepted bytes.

Vercel serves the website. Its read-only catalog route reads the fixed public Git registry and verifies the immutable catalog from public Blob storage. There is no database, custom website account, OAuth application or artifact proxy. Students need VS Code, Java and the project's Maven wrapper; no Node or Docker. The existing Maven starter remains to avoid introducing a second build tool.

Local library Check runs the student's own code on their computer. It builds a JAR with a generated POM and runs behavior checks and two examples against that JAR. Local success does not authorize remote execution or publication. Generic submitted-library execution remains closed pending the outstanding independent checker acceptance. Game sharing packages validated source without executing it; opening a game extracts into a new folder without running it.

See [the adoption plan](GITHUB-SHARING-PLAN.md) and [actual verification](VERIFICATION.md).
