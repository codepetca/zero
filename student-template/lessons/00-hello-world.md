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

### App startup

Your Main extends `zero.App`, a JavaFX application. The starter's
`main(...)` calls `launch(args)`. Zero then calls `settings()` once, calls
`setup()` once to build your interface, and shows the window. Keep that entry
point; you do not need to construct another Main.

For an optional window title and initial size, add this method inside Main,
beside `setup()` rather than inside it:

```java
@Override public void settings() {
    title("Greeting");
    size(420, 240);
    padding(20);
}
```

If Main already has `settings()`, edit that method instead. Call `title(...)`
and `size(...)` there, before the interface exists. `padding(20)` leaves space
around your content. In `setup()`, `show(greeting)` displays an ordinary JavaFX
Label; later lessons arrange several controls before calling `show(...)`.

App responds to events rather than calling an automatic `update()` or `draw()`.
In the next lesson, a button action changes your existing label with `setText(...)`,
and JavaFX displays the change. Keep setup and actions short so the window can
respond; sleeping or a long loop blocks its JavaFX application thread.

Next: [Add a button](01-hello-button.md).
