# 0. Hello, world!

**Make your first greeting.**

![A window saying Hello, Java!](visuals/00.svg)

Target illustration: your greeting after you write it.

[Start Greeting project](README.md#start-a-lesson) once. Open `src/main/java/Main.java` in your **Greeting** project.

## 1. Add this import above `public class Main`

The new `Main.java` has `Main extends App`, an empty `setup()` and a
`main` method. Keep those lines. The empty setup opens a blank window, so your
first control is yours to write. Add this import above `public class Main`:

```java
import javafx.scene.control.Label;
```

## 2. Write the greeting inside `setup()`

Inside the two braces of `setup()`, write:

```java
Label greeting = new Label("Hello, world!");
show(greeting);
```

`new Label(...)` creates text. `show(greeting)` puts that label in the
window.

## 3. Run App, then change the greeting

Click **Run App**. The window says **Hello, world!**. Edit the quoted words to `Hello, Java!` and click **Run App** again. The window should now say **Hello, Java!**.
Keep this **same Greeting project** for lessons 1 and 2. You will add to this
code rather than replace `Main.java`.

Next: [Add a button](01-hello-button.md).
