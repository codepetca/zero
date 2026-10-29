# 2. Hello, world!

**Make your first greeting.**

![A window saying Hello, Java!](visuals/00.svg)

Target illustration: your greeting after you write it.

[Start Greeting project](README.md#start-a-lesson) once. Open `src/main/java/Main.java` in your **Greeting** project.

## 1. Add this import above `public class Main`

The new `Main.java` has `Main extends App`, `settings()` with `padding(20)`, an empty
`setup()` and a `main` method. Keep those lines. The empty setup opens a blank window, so your
first control is yours to write. Find this existing import:

`import zero.App;`

Add below it:

```java
import zero.ui.Label;
```

## 2. Write the greeting inside `setup()`

Find the empty method:

`@Override public void setup() {` `// Build your interface here.` `}`

Replace the comment inside its braces with:

```java
Label greeting = new Label("Hello, world!");
show(greeting);
```

`new Label(...)` creates text. `show(greeting)` puts that label in the
window.

## 3. Run App, then change the greeting

Click **Run App**. The window says **Hello, world!**. Edit the quoted words to `Hello, Java!` and click **Run App** again. The window should now say **Hello, Java!**.
Keep this **same Greeting project** for lessons 3 and 4. You will add to this
code rather than replace `Main.java`.

### App startup

Your Main extends `zero.App`. Zero uses JavaFX underneath to display the interface. The starter's
`main(...)` calls `launch(args)`. Zero then calls `settings()` once, calls
`setup()` once to build your interface, and shows the window. Keep that entry
point; you do not need to construct another Main.

The starter already uses `padding(20)` to leave space around the content.
For an optional window title and initial size, find the existing method:

`@Override public void settings() { padding(20); }`

Replace it with:

```java
@Override public void settings() {
    title("Greeting");
    size(420, 240);
    padding(20);
}
```

Keep one `settings()` method. Call `title(...)` and `size(...)` there, before
the interface exists. `padding(20)` leaves space
around your content. In `setup()`, `show(greeting)` displays a Zero
Label; later lessons arrange several controls before calling `show(...)`.

App responds to events rather than calling an automatic `update()` or `draw()`.
In the next lesson, a button action changes your existing label with `setText(...)`,
and Zero displays the change. Keep setup and actions short so the window can
respond; sleeping or a long loop blocks its JavaFX application thread.

Next: [Add a button](01-hello-button.md).
