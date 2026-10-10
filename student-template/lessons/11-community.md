# 11. Share a component

Prepare a small HealthBar improvement for
[Zero Community](https://zero.codepet.ca/community), then propose a source pull
request. Coursework links in Pika stay separate.

## Open the Workshop

Download the portable Workshop from the Community page. Extract the **whole**
`zero-community-workshop-0.1.2` folder and keep its three sibling folders together:
`component-workshop/`, `zero-community/` and `component-repository/`.

Open `component-workshop/` in VS Code. With JDK 17+ installed, run in its terminal:

```sh
./mvnw compile javafx:run
```

Windows PowerShell: `.\mvnw.cmd compile javafx:run`.
First-time dependency downloads need internet. The current Workshop edits,
checks and exports **HealthBar only**; it cannot check Lesson 10's ScoreDisplay.

Try Full, Partial, Empty and Custom caption. Read the Examples and API tabs.
HealthBar displays a value supplied by Main; adventure and study own different
rules and call `setHealth(...)` explicitly.

## Make a small improvement

In the extracted folder, open
`zero-community/src/main/java/zero/community/HealthBar.java`. In its caption
constructor, after `this.maximum = maximum;`, add:

```java
label.setStyle("-fx-font-weight: bold;");
```

Save, then choose **Build local source & check** in Workshop. This builds your
trusted edited HealthBar and checks its API. Try the states again; the caption
should be bold and the numbers/fill unchanged. Choose **Run checks** and read
the report. After another source edit, build and check again.

Choose **Prepare contribution**, then choose a new output folder. Keep its
`packet.zip`, `packet.json` and `checks/report.json`. Export creates local files;
it does not upload, approve or publish anything. No Python is needed for these
Workshop steps.

## Put the source on a contribution branch

Read the current [contribution guide](https://github.com/codepetca/zero-community/blob/main/docs/CONTRIBUTING.md).
On [zero-community](https://github.com/codepetca/zero-community), choose **Fork**
to make your copy. Clone your fork with VS Code's **Git: Clone** command and
open that folder. In **Source Control**, create a branch named
`healthbar-caption`. This community library folder uses its own Maven wrapper;
it is separate from your Zero student app.

Copy your edited Workshop `HealthBar.java` to the same path in your fork.
Compare the diff: it should contain your intended improvement. If the fork's
source has changed since the Workshop download, apply the one-line change to
the newer source and repeat checks rather than replacing the whole file.

The contribution files are:

| File in your fork | Purpose |
| --- | --- |
| `src/main/java/zero/community/HealthBar.java` | Component source |
| `docs/HealthBar.md` | Public API, errors and presentation behavior |
| `examples/adventure/Main.java` | App-owned damage/healing/reset |
| `examples/study/Main.java` | App-owned study energy |
| `src/test/java/zero/community/HealthBarTest.java` | Fractions, captions, bounds, independent instances and errors |
| `catalog/components.json` | Component metadata, API and example paths |
| `pom.xml` | Pinned Java/Maven dependencies |
| `LICENSE` | MIT notice |

Add one sentence about the bold caption to `docs/HealthBar.md`. Keep existing
constructors/methods working, dependency versions pinned, metadata experimental,
and MIT/upstream wrapper notices intact. Keep generated packets, `.proof/` and
`target/` out of your commit. A small presentation change can reuse the existing
behavior tests; add tests when changing behavior.

## Check the exact source you propose

From your fork's terminal, run:

```sh
./mvnw -B test
```

Windows: `.\mvnw.cmd -B test`. A graphical JavaFX session is required.
Record the result, OS and any failures.

Try the **edited source in two apps** using a fresh copy of the Zero starter
with no community library dependency. Create
`src/main/java/zero/community/` there and copy your fork's
`src/main/java/zero/community/HealthBar.java` into that exact folder.
Copy your fork's `examples/adventure/Main.java` to `src/main/java/Main.java`.
Use Run App. Expect full `Health: 100 / 100`, damage to `75`, heal to `85`, and
Restart to `100`; the caption stays bold.

Stop, back up Main outside `src/`, then replace only Main with your fork's
`examples/study/Main.java`. Keep the same HealthBar source. Run: start at
`Study energy: 8 / 8`; answer `3` to reach `7`; answer `9` to reach `5`; New
study session returns to `8`. Check bold captions and unchanged fill in both
apps. Record actions, expected results and observed results.

For fresh Workshop evidence, copy the fork's declared contribution files from
the table into the extracted `zero-community/` folder, keeping their paths.
Build local source & check again, then export to a **new** folder. This binds
the report to the final source, API and metadata. Workshop checks cover the
component; the two app runs supply separate reuse evidence.

## Propose the change

Review and commit only your intended source/documentation changes. Publish the
branch to **your fork**, then use GitHub's **Compare & pull request** with base
`codepetca/zero-community:main` and your branch as the compare branch.

In the PR, explain the improvement, unchanged API, the two app results, Maven
test result and platform limits. Include your final packet/check evidence using
GitHub's attachment control. If attachment is unavailable, include the report
text and source digest and describe where the packet is available. Passing
checks alone does not demonstrate usefulness.

GitHub's Component checks and an independent review by an existing Community
maintain/admin user must cover the current PR revision. Changes need fresh
checks/review. Contributor receipts, AI and CI cannot approve the contribution;
unreviewed work waits. Acceptance and a published library release are separate
maintainer decisions. The current public HealthBar remains experimental.

Previous: [10. Make a reusable component](10-components.md). Next: [12. Sprites and sounds](12-media.md). Continue with the
[lesson index](README.md) or [Community contribution guide](https://github.com/codepetca/zero-community/blob/main/docs/CONTRIBUTING.md).
