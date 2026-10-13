# 11. Share a library or game

**First checkpoint: choose what another student should receive.**

![Prepare then build then upload then automatic checks](visuals/11.svg)

Use your existing game repository. A **library** supplies reusable Java classes; a **game project** gives someone an editable copy of your entire game.

1. Make a useful component in your game and run it there first.
2. Open Zero's (…) menu → **Libraries** → **Extract library**. Select complete classes, choose a short slug, and review source and import changes.
3. Keep application rules in Main. Give the library a behavior check, two small examples, API notes and a license. Run **Check library**.

**Done:** Both examples use the same built library JAR and the checks pass. The generated checks intentionally need your own useful assertions.

## Work in the same repository

Your library lives in `libraries/<slug>/`. Local mode compiles its editable source with your game. Published mode uses an exact Maven version. The editor reviews changes and supports recovery if extraction or a mode switch fails. Do not add a second copy of the same class to your game.

The generated package comes from stable repository number and slug, for example `zero.contrib.r12345.score_panel`. Use your actual generated package. Your GitHub username is credit, not part of the import.

## Request sharing

Upload completed files to your public GitHub repository first. **Share library** prepares a GitHub request for that exact uploaded commit. Review and submit the browser form. Local Check alone does not publish anything. Generic hosted library checking is not activated yet; your teacher will explain available paths in the classroom build.

To share a whole game, choose **Games** → **Share game**. Fill in title, description, controls and license, then upload and request its exact version. A shared game is an editable project, not a Maven dependency. **Open project** extracts verified files into a new folder; run them only when you choose to. Remove private material before uploading a public repository.

## Use a published library

Browse the [Hub](https://zero.codepet.ca/hub), choose a library and exact version, then use **Add library** in Zero. Its card shows the import and usage. Maven fetches the JAR; you do not copy source into your app. **Update** is explicit, and **Revert** restores the previous managed pin.

Published versions cannot be replaced. Fixes use a new version and changelog. Automatic checks do not establish every behavior or usefulness. Submit coursework separately through your repository link in Pika.

Previous: [10. Make a reusable component](10-components.md). Next: [12. Sprites and sounds](12-media.md). [Lesson index](README.md).
