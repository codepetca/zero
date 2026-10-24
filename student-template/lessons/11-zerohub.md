# 11. Check a component, then share original work

**First checkpoint: change ScoreDisplay in both of your projects.**

![A local ScoreDisplay class in a quiz and a Coin game, beside a separate original project for optional sharing](visuals/11.svg)

Reopen the **Study quiz** and **Coin game** from lesson 10. There is no lesson 11 download. ZeroHub sharing later uses a **separate original game project** you own.

Previous: [Reuse the score display](10-components.md).

## 1. Retain the displayed value

In `ScoreDisplay.java`, keep the private Label and Element view from lesson 10.
Add two fields beside the label:

```java
private String caption = "Score";
private int points;
```

Main still owns the real score and when it changes. These fields remember only
what this display was last told to show. Replace the existing setScore method
and add a private refresh method:

```java
public void setScore(int points) {
    this.points = points;
    refresh();
}

private void refresh() {
    label.setText(caption + ": " + points);
}
```

`this.points` is the display's field; the parameter points is the value supplied
by Main. One refresh method keeps formatting in one place.

## 2. Add a caption method

Add this ordinary Java method inside ScoreDisplay:

```java
public void setCaption(String caption) {
    if (caption == null) {
        throw new IllegalArgumentException("Score caption must not be null.");
    }
    this.caption = caption;
    refresh();
}
```

Changing the caption refreshes the existing label without losing its displayed
points. The null check runs before either field changes, so a bad argument gives
a useful error and leaves the previous caption and value intact. No Zero core
change or access to the private Label is needed.

Copy the changed `ScoreDisplay.java` into the other project's `src/main/java/`
folder. In **both** Main classes, immediately after `score = new ScoreDisplay();`,
add `score.setCaption("Score");`. Keep all scoring rules and setScore calls in Main.

## 3. Run both apps and check the component

Try `score.setCaption("Correct")` in the study app and `score.setCaption("Coins")`
in the game. Run both apps. Answer the first study question or collect one coin;
the caption and displayed value should agree. Finish and restart each app twice.
Each app has its own ScoreDisplay instance, so changing one does not change the
other running app.

To check changing a caption **after** a value, temporarily add
`score.setCaption("Coins");` immediately after the existing
`score.setScore(points);` inside the game's coin-collection block. Collect one
coin: the display should show `Coins: 1`, proving the caption change kept that
value. Stay on the coin and check it still shows 1.

Remove that experimental line and **restore `score.setCaption("Score")` in both
Main setup methods before continuing**. Keep view() and setScore(int) as the
public ways to mount and update the display.

## 4. Record the component API and save your tested changes

If both projects compile after you copy this one class, you have a small
two-consumer API check. Compare your [game Main](../../teaching/checkpoints/11/game/Main.java),
[study Main](../../teaching/checkpoints/11/study/Main.java) and
[ScoreDisplay.java](../../teaching/checkpoints/11/game/ScoreDisplay.java) with
checkpoint 11. Record the API in a comment: `view()` gives Main an Element;
`setScore(int)` displays Main's score; `setCaption(String)` changes the caption
while retaining that displayed value. A useful error or method name matters more
than making a large library. Upload the tested change in both tutorial repositories
and Finish each change.

## 5. Optionally check a reusable part in a separate original project

These lesson projects already use your GitHub repositories. ZeroHub contributions require original work. For an optional fourth project, create your **own separate game** and write an original helper that another app could use. Test it in your game and one small second consumer. Keep game rules in Main. In that original repository, **Libraries and Games → Extract library** can move complete classes into `libraries/<slug>/`; review the moved source and imports. Write API notes, a meaningful behavior check and license, then run **Check library** locally. Local Check reports on that version; it does not publish it. The generic hosted library checker remains unavailable pending acceptance, so do not describe a local pass as a ZeroHub listing.

## 6. Optionally review a sharing request

If your teacher enables sharing, use your own GitHub account and a separate original project. Upload that project's reviewed commit using the supported Zero workflow, then, when library acceptance is available, **Share library** prepares a request for that exact commit and opens the official browser form. Review before submitting. Public ZeroHub game admission is also pending; optional GitHub Pages publishing is a separate explicit action. Browse [ZeroHub](https://zero.codepet.ca/hub) for published exact versions; **Add library**, Update and Revert are deliberate choices. Coursework repository links are submitted in Pika separately.

Continue growing your **same Coin game** with media in [lesson 12](12-media.md).
