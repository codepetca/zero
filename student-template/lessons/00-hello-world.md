# 0. Hello, world!

**Make your first greeting.**

![A window saying Hello, Java!](visuals/00.svg)

Target illustration: your greeting after you write it.

1. [Start Greeting project](README.md#start-a-lesson) once. Open `src/main/java/Main.java` in your **Greeting** project.
2. Add a `Label` in `setup()` and show it. Click **Run App**.
3. Change the words to `Hello, Java!` and click **Run App** again.

**Done:** The window says **Hello, Java!**.

## Code and explanation

The new `Main.java` has `Main extends SimpleApp`, an empty `setup()` and a
`main` method. Keep those lines. The empty setup opens a blank window, so your
first control is yours to write. Add this import above `public class Main`:

```java
import javafx.scene.control.Label;
```

Inside the two braces of `setup()`, write:

```java
Label greeting = new Label("Hello, world!");
show(greeting);
```

`new Label(...)` creates text. `show(greeting)` puts that label in the
window. Run the app, then edit the quoted words to `Hello, Java!` and rerun.
Keep this **same Greeting project** for lessons 1 and 2. You will add to this
code rather than replace `Main.java`.

Next: [Add a button](01-hello-button.md).
