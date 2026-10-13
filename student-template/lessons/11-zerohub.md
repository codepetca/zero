# 11. Check a component, then share original work

**First checkpoint: change ScoreDisplay in both of your projects.**

![A local ScoreDisplay class in a quiz and a Coin game, beside a separate original project for optional sharing](visuals/11.svg)

1. Reopen the **Study quiz** and **Coin game** from lesson 10. There is no lesson 11 download.
2. Give `ScoreDisplay` a small presentation change, copy that one class between your two local projects, and run both.
3. Write down which methods a second app needs and which scoring decisions remain in each Main.

**Done:** Both apps display the changed score and still score and restart correctly. Local practice stays off GitHub. Sharing later uses a **separate original game project** you own.

Previous: [Reuse the score display](10-components.md).

## 1. Check the component locally

In `ScoreDisplay.java`, add a method so an app can change its label color without accessing the private Label:

```java
public void setColor(javafx.scene.paint.Color color) {
    label.setTextFill(color);
}
```

In each Main's `setup()`, immediately after `score = new ScoreDisplay();`, add `score.setColor(javafx.scene.paint.Color.DARKSLATEBLUE);`. Keep the same `view()` and `setScore(int)` methods. Run both apps. In the study quiz, answer the first question, finish the quiz, then Restart. In the game, collect one coin, Restart, win, and Restart again. ScoreDisplay changes how a number appears; Main still decides when points change.

If both projects compile after you copy this one class, you have a small two-consumer API check. Compare your [game Main](../../teaching/checkpoints/11/game/Main.java), [study Main](../../teaching/checkpoints/11/study/Main.java) and [ScoreDisplay.java](../../teaching/checkpoints/11/game/ScoreDisplay.java) with checkpoint 11. Record the API in a comment: `view()` gives Main a Node; `setScore(int)` displays Main's score; `setColor(Color)` changes presentation. A useful error or method name matters more than making a large library.

## 2. Decide whether your original project has a reusable part

These lesson projects are local practice. For an optional fourth project, create your **own separate game** and write an original helper that another app could use. Test it in your game and one small second consumer. Keep game rules in Main. In that original repository, **Libraries and Games → Extract library** can move complete classes into `libraries/<slug>/`; review the moved source and imports. Write API notes, a meaningful behavior check and license, then run **Check library** locally. Local Check reports on that version; it does not publish it. The generic hosted library checker remains unavailable pending acceptance, so do not describe a local pass as a ZeroHub listing.

If your teacher enables sharing, use your own GitHub account and a separate original project. Upload that project's reviewed commit using the supported Zero workflow, then, when library acceptance is available, **Share library** prepares a request for that exact commit and opens the official browser form. Review before submitting. General game publication is also not yet available. Browse [ZeroHub](https://zero.codepet.ca/hub) for published exact versions; **Add library**, Update and Revert are deliberate choices. Coursework repository links are submitted in Pika separately.

Continue growing your **same Coin game** with media in [lesson 12](12-media.md).
