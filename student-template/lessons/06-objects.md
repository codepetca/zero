# 6. Let Counter own attempts

**Move one piece of quiz state into an ordinary object.**

![The quiz still shows Attempts: 0, now supplied by Counter](visuals/06.svg)

Target illustration: the same quiz after Reset, with its count stored in a `Counter` object.

1. Open your **Study project** from lesson 5. Keep its controls and methods.
2. Write a `Counter` class, then change Main to call it for attempts.
3. Click **Run App**; check twice, click **Reset**, then check again.

**Done:** Attempts goes **2 → 0 → 1**. Main asks Counter for the number.

## Code and explanation

Create `src/main/java/Counter.java` beside `Main.java`. Write an ordinary class
with one private number and three public methods:

```java
public class Counter {
    private int count = 0;

    public void increment() { count = count + 1; }
    public void reset() { count = 0; }
    public int value() { return count; }
}
```

No special framework registration is needed. In `Main`, replace the old field
`private int attempts = 0;` with:

```java
private final Counter attempts = new Counter();
```

In `checkAnswer()`, replace the two attempt-counting lines with:

```java
attempts.increment();
attemptsLabel.setText("Attempts: " + attempts.value());
```

In `resetQuiz()`, replace `attempts = 0;` and the next label update with:

```java
attempts.reset();
attemptsLabel.setText("Attempts: " + attempts.value());
```

Keep the answer checking, buttons and layout from lesson 5. Counter owns the
number; Main still explicitly updates the label. If you need to compare,
see the completed [Main](../../teaching/checkpoints/6/Main.java) and
[Counter](../../teaching/checkpoints/6/Counter.java) checkpoints.

Next: [Grow the quiz into a study app](07-study-app.md).
