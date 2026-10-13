# 11. Reuse locally, then share your own work

**First checkpoint: practise with an ordinary component.**

![The same ordinary Java component used in two apps](visuals/11.svg)

The [fresh Lesson 11 project](README.md#start-a-lesson) is a local study app with Main, Question and
ScoreDisplay. Unzip it, open its folder in VS Code and click **Zero → Run App**.
This sample stays on your computer. Do not upload it to GitHub or share it with
ZeroHub.

1. Find `score.setScore(points)` in Main and `setScore(int)` in ScoreDisplay.
2. Change ScoreDisplay's label style, then click **Run App** again.
3. Answer `3`, restart and confirm the score returns to zero with your style.

**Done:** You can explain which code belongs in the reusable display and which
scoring rules stay in Main.

## Work on your own game

When you have made a useful component in **your own separate game repository**,
run and test it there first. A library supplies reusable Java classes; a game
project gives another student an editable copy of your entire game. Keep the
fresh lesson projects separate from this work.

In your own game, **Libraries and Games → Extract library** can move
complete classes into `libraries/<slug>/` in your own game. Review its source and
import changes. Keep application rules in Main. Give the library useful behavior
checks, two small consumers, API notes and a license; then run **Check library**.
Local Check alone does not publish anything. Generic hosted library checking is
not activated yet; your teacher will explain available paths in the classroom
build.

## Request sharing from your own repository

If your teacher enables sharing, upload your completed **own game** to your
public GitHub repository first. **Share library** prepares a request for that
exact uploaded commit. Review and submit the browser form. To share your whole
own game, choose **Share game**, supply its title, description, controls and
license, then request its exact version. Shared games open into new editable
folders; run them only when you choose to.

Browse [ZeroHub](https://zero.codepet.ca/hub) to choose a published library and
exact version. **Add library** uses its pinned Maven JAR; Update and Revert are
explicit. Published versions cannot be replaced. Coursework links go to Pika
separately from any ZeroHub request.

Previous: [10. Reuse a component](10-components.md). Next:
[12. Build a platformer](12-media.md). [Lesson index](README.md).
