# 11. Share with ZeroHub

**First checkpoint: run your own component preview.**

![Prepare then build then upload then automatic checks](visuals/11.svg)

The [public catalog](https://zero.codepet.ca/hub) is open for browsing and using libraries. Sharing is not open yet; this lesson uses a configured local developer preview provided by your teacher.

1. Open that preview's ZeroHub page, choose **Make a library**, use its sign-in flow, and choose a class name such as `ScorePanel`.
2. Download and extract the project. Open its folder in Zero and use **Run App**.
3. Change the displayed greeting in your component, save and run again.

**Done:** Your component appears in its preview window with your changed greeting.

A local demo account is not your GitHub identity.

## What you received

ZeroHub supplies a permanent short library ID and matching Java package. For an example ID `ui7`, your class is `zero.ui7.ScorePanel`. Use the actual ID in your downloaded project. Keep that package; your GitHub username never becomes an import.

| File | Your next change |
| --- | --- |
| `src/zero/ui7/ScorePanel.java` | Ordinary JavaFX component with `view()` and value setters |
| `src/Main.java` | Editable preview; Run App opens this |
| `API.md` | Explain methods and one short usage example |
| `checks/BehaviorCheck.java` | Check useful behavior, including reset or boundaries |
| `examples/first/Main.java`, `examples/second/Main.java` | Demonstrate the same component in two finite apps |
| `preview.png` | Image of what someone can build with it |
| `CHANGELOG.md`, `LICENSE` | Describe this version; retain the MIT notice |

A library can contain related classes such as Hud, ScoreDisplay and StartScreen. Each exported component exposes `public Node view()`. The first checker supports self-contained JavaFX widgets without additional library dependencies.

## Check and upload

Try your preview locally. After upload, the service compiles your library and runs BehaviorCheck plus both finite consumer examples; the downloaded project does not provide a local check-running task. Keep application rules in the consumer: pass numbers with setters and actions with callbacks. Create separate instances when using the component in different layouts.

Return to **Make a library** and upload the project folder. The site submits source, documentation, tests, examples and the preview image; generated build output and development scripts are excluded.

Read the result. If it fails, fix the indicated file and resubmit the same unpublished version. Passing submissions become listed versions automatically, with **By @your-account** credit. There is no source-fork or maintainer approval step.

The label **Automatically checked** describes the checks and platform that ran. It does not prove every behavior or usefulness. Improve your tests and examples when you discover a bug.

## Use it in another app

The editor commands below require your teacher's locally built ZeroHub extension.
With the current public downloads, follow the [library guide](https://zero.codepet.ca/docs/components#use-a-component)
to add the exact dependency to `pom.xml` and use the shown Java import manually.

In the other app, open Zero's (…) menu → **Browse ZeroHub**. Choose the component and **Add library**. Use the exact import shown on its card:

```java
import zero.ui7.ScorePanel;
```

Run the second app. Maven retrieves the exact library version; you do not copy its source into your app.

Once listed, a version cannot be replaced. Make fixes in a new version and explain them in CHANGELOG.md. In the local extension, other students choose **Update** explicitly; **Revert** restores the preceding pin. Related classes share the library's version.

Keep your library source in your own GitHub repository. Pika coursework submission still uses your repository link separately.

Previous: [10. Make a reusable component](10-components.md). Next: [12. Sprites and sounds](12-media.md). [Lesson index](README.md).
