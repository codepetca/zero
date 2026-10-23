# Zero repository boundaries

[codepetca/zero](https://github.com/codepetca/zero) owns the teaching kit and sharing platform. Students own their game repositories. They can extract related classes into `libraries/<slug>/` in that same repository, or share a whole game as an editable project.

| Folder | Responsibility |
| --- | --- |
| `framework/` | Ordinary Java App and GameApp |
| `extension/` | Supported VS Code Run, GitHub and sharing tools |
| `student-template/` | Standalone Maven project, lessons and examples |
| `libraries/` | Maintained sample source, examples and checks |
| `sharing/` | GitHub intake, durable registry, immutable publication and game packaging |
| `website/` | Vercel download, learning and public catalog pages |
| `hub/checker/` | Disconnected former checker reference; no active publication authority |
| `profile/`, `release/`, `scripts/` | Editor settings, release definitions and verification |

## Runtime and extension architecture

Student-led extension and contribution is a core goal, alongside learning Java,
simple apps/games, JavaFX/WebFX browser delivery and student-owned GitHub work.
The runtime plan is [Framework architecture](FRAMEWORK-ARCHITECTURE.md): a small
JavaFX-owned lifecycle, optional active screens and explicitly updated worlds,
with replaceable ordinary Java behaviours, animation playback and UI components.
Normal student code should use Zero packages almost entirely; JavaFX remains the
implementation and advanced interoperability boundary. The
[class model](FRAMEWORK-MODEL.md) distinguishes inheritance from ownership and
specifies GameApp extending App, optional UI Screens and Worlds, with gameplay
update/draw in Main and no public GameScreen. GameApp owns canvas/input/camera;
showing a UI Screen suspends gameplay while a composed HUD/control panel does not. The
[reliability plan](FRAMEWORK-RELIABILITY.md) maps existing local/CI signals and
future automatic coverage/runtime diagnostics, including the PostHog/Clarity
evaluation. These documents do not implement the proposed facade or telemetry.
The [preservation policy](FRAMEWORK-ARCHITECTURE.md#project-versions-and-preservation)
binds projects to exact framework/build-kit releases independently of the editor.
Preserve old kits and finished static output; maintain only the current line.
Missing historical tooling must not silently upgrade a project or bypass checks.
Release-bound selection/archives and upgrade flows remain proposed.
Arcade informs the screen/container structure; Greenfoot informs Actor vocabulary;
Godot informs focused composition. These are design references, not dependencies.

Framework ownership and third-party replacement are different boundaries. The
core owns sequencing, input/resource cleanup and useful errors. A student selects
implementations through documented public contracts; no source-hash exemption,
automatic class discovery, global registration or private hook is required.
Native and WebFX/GWT consumers must use the same public extension API. The plan
is not an implementation of World/Screen, a released Actor API, or admission of
new browser controls/dependencies. Preserve the current simple App/GameApp path.

The dedicated GitHub branch `zero-sharing-registry` stores `registry/state.json`, updated with Git blob compare-and-swap. Issue events are hints; reconciliation discovers requests again. Numeric repository and owner IDs bind source ownership; exact commits freeze submissions. Library IDs and Java namespaces derive from repository ID and slug, so account renames do not rename imports. Publication stages bytes before reserving an exact version, then delivers immutable Maven or game ZIP paths and a content-addressed catalog. Interrupted delivery resumes without replacing accepted bytes.

Vercel serves the website. Its read-only catalog route reads the fixed public Git registry and verifies the immutable catalog from public Blob storage. There is no database, custom website account, OAuth application or artifact proxy. Students need VS Code, Java and the project's Maven wrapper; no Node or Docker. The existing Maven starter remains to avoid introducing a second build tool.

Local library Check runs the student's own code on their computer. It builds a JAR with a generated POM and runs behavior checks and two examples against that JAR. Local success does not authorize remote execution or publication. Generic submitted-library execution remains closed pending the outstanding independent checker acceptance. Game sharing packages validated source without executing it; opening a game extracts into a new folder without running it.

See [the adoption plan](GITHUB-SHARING-PLAN.md) and [actual verification](VERIFICATION.md).
