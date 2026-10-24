# 11. Improve and propose a component

**First checkpoint: improve a component while keeping its existing users working.**

![A local ScoreDisplay class in a quiz and a Coin game, beside a separate original project for optional sharing](visuals/11.svg)

Reopen the **Study quiz** and **Coin game** from lesson 10. There is no lesson 11 download or new tutorial project. Keep practising in these folders. Actual ZeroHub sharing later uses an **original game project** you own, separate from the three tutorial projects.

Previous: [Refactor a busy Main](10-components.md).

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

## 4. Optionally improve PlayerInput with WASD

The game now has one place to improve keyboard input. As an optional feature,
let A/D and W/S work alongside the arrow keys. In the game's `PlayerInput.java`,
replace only its two direction methods:

```java
public int horizontal() {
    int direction = 0;
    if (game.keyDown(Key.LEFT) || game.keyDown(Key.A)) direction--;
    if (game.keyDown(Key.RIGHT) || game.keyDown(Key.D)) direction++;
    return direction;
}

public int vertical() {
    int direction = 0;
    if (game.keyDown(Key.UP) || game.keyDown(Key.W)) direction--;
    if (game.keyDown(Key.DOWN) || game.keyDown(Key.S)) direction++;
    return direction;
}
```

`||` means “or.” Right + D contributes +1 once, rather than +2. Left or A
opposes Right or D, so A + Right cancels just as Left + Right does. Main still
asks for two directions; Player still owns movement. Keep the constructor and
`GameApp game` field from lesson 10. No Zero framework change is needed.

Run App and check all arrows still work, each WASD direction, W + D diagonally,
Right + D at the same speed as Right, A + Right cancelling horizontal motion,
and W + Down cancelling vertical motion. Try both opposing arrows too. Preserve
Player's existing diagonal speed rule. Release all keys, switch windows while
holding a key, return and click the canvas, and test Restart during play and after
winning. Input should clear on focus loss and Restart; all three coins, scoring
and reset behaviour should still work. Update Main's drawn help text to
`Click the canvas, then hold arrows or WASD.` so the player can discover the keys.

## 5. Record the API and save your tested changes

If both projects compile after copying ScoreDisplay, you have a small
two-consumer API check. Record what you checked in README, including the expected
result and what you observed. Record this API in a comment: `view()` gives Main an
Element; `setScore(int)` displays Main's score; `setCaption(String)` changes the
caption while retaining that displayed value. Existing `new ScoreDisplay()` calls
still work, as do view() and setScore(int); this is a compatible improvement.

Compare your [game Main](../../teaching/checkpoints/11/game/Main.java),
[study Main](../../teaching/checkpoints/11/study/Main.java) and
[ScoreDisplay.java](../../teaching/checkpoints/11/game/ScoreDisplay.java) with
checkpoint 11. Its [PlayerInput.java](../../teaching/checkpoints/11/game/PlayerInput.java)
includes the optional WASD change; checkpoint 10 is the arrow-only comparison if
you skipped it. Checkpoint 12 carries that same WASD helper forward.

Save your tested changes through the normal reviewed **Commit & push** and
**Merge to main** workflow for each tutorial repository. A useful method, clear
error and unchanged caller matter more than making a large library.

## 6. Recognize an original contribution

You have practised a useful pattern: build something in an app, extract one job,
then improve it without rewriting its users. The supplied PlayerInput and
ScoreDisplay are teaching examples. Uploading those examples verbatim does not
make them an original ZeroHub contribution. Credit Zero and any other source
when adapting code, and follow its license.

For your own original work, look for a small capability you actually needed:
a configurable input mapping, a display with a useful new behaviour, or another
helper you can explain. First keep it in your own project's package, outside
`zero.*`, using Zero's public methods. Reuse the three tutorial folders for these
practice exercises; this lesson does not require creating a fourth project.

You can write a proposal in the existing README with a design and a short Java
snippet. Explain the problem, what belongs to Main and what belongs to the helper,
and the proposed constructor and methods. That is enough to discuss an idea;
a proposal needs no new repository or publication. Actual community sharing uses
an original game repository you own under the existing contribution policy.
If you already have one, develop the original helper there.

## 7. Optionally check and share an original library

Before sharing original code, make it understandable to another student:

- Keep the source readable and document the public methods, ownership, useful
  errors and an example in README. Retain attribution and an appropriate license.
- Add meaningful behaviour checks and two small consumer examples that exercise
  the helper's actual API. The Study and Coin ScoreDisplay exercise showed why
  a second caller can catch a change that breaks reuse.
- In your original game repository, **Libraries and Games → Extract library**
  previews moving complete related classes into `libraries/<slug>/` with the
  required package/import/build changes. Review those changes and rerun the game.
- Run **Check library** locally for independent compilation, API/source boundaries,
  behaviour checks and two finite examples using the actual JAR. Record the exact
  source/version and results. Local Check reports on that version; it does not
  publish it or establish browser playability.

For a library intended for browser apps, also export its consumers using the
supported browser path and actually try the relevant behaviour in the browser.
Record native results and browser results separately. A successful export shows
compilation; playing the controls and checking results supplies different evidence.

If your teacher enables sharing and hosted acceptance is available, use your own
GitHub account and original project. Upload the reviewed commit through the
supported Zero workflow. **Share library** prepares a request for that exact
commit and opens the official browser form; review before submitting. The hosted
library checker and public game admission remain pending acceptance, so a local
pass or submitted request is not a ZeroHub listing. Optional GitHub Pages
publishing is a separate explicit action. Browse
[ZeroHub](https://zero.codepet.ca/hub) for published exact versions; **Add library**,
Update and Revert are deliberate choices. Submit coursework repository links in
Pika separately.

## 8. Propose a proven idea for Zero core

After original code has helped more than one app, collect what reuse taught you:
which methods stayed useful, which changed, and which failure or input cases you
checked. An accepted community library can keep improving independently.
You can also propose that a broadly useful capability join Zero itself.

Include the original source/version and contributor credit, two consumers,
behaviour and native/browser evidence, README/API and license, plus a small
proposed API and explanation of how existing callers would keep working or
migrate. The proposal can start as a README design and snippet; it does not
require modifying framework source or publishing anything now. Keep the working
helper in your own package while the idea is discussed.

Maintainers review teaching value, compatibility and evidence. They may adopt or
adapt the idea, keep it as a community library, or defer it. Local Check, a ZeroHub
listing or popularity does not automatically promote code into core or promise
admission. A core change goes through normal source review, CI and an authorized
release, with attribution retained. Existing library versions and installed pins
stay unchanged; users choose whether to migrate.

Continue growing your **same Coin game** with media in [lesson 12](12-media.md).
