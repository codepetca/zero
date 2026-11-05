# 1. Hello, world!

![A window saying Hello, Java!](visuals/00.svg)

Target illustration: your greeting after you write it.

## 1. Create your project

In Zero, sign in to GitHub and complete access setup if needed. On the Start Page, choose:

**Project → New**

Name your project (for example, `zero-greeting`) and choose a clone location. Zero creates your public repository and opens its clone. In Project Explorer, open **java → Main.java** (`java/Main.java`). Replace its contents with this starting file and save it:

```java
import zero.App;

public class Main extends App {
    @Override public void settings() { padding(20); }

    @Override public void setup() {
        // Build your interface here.
    }

    public static void main(String[] args) { launch(args); }
}
```

## 2. Add this import after `import zero.App;`

This starting `Main.java` has `Main extends App`, `settings()` with `padding(20)`, an empty `setup()` and a `main` method. Keep those lines. The empty setup opens a blank window, so your first control is yours to write. Add the `Label` import in `Main.java`; replace the matching lines with the copied code:

```java-after-2
import zero.App;
import zero.ui.Label;
```

## 3. Write the greeting inside `setup()`

Replace the empty `setup()` method with the copied code:

```java-after-3-4-r2
    @Override public void setup() {
        // Build your interface here.
        Label greeting = new Label("Hello, world!");
        show(greeting);
    }
```

`new Label(...)` creates a UI component. `show(greeting)` displays it in the
app window, replacing whatever UI was shown there before.

## 4. Run App, then change the greeting

Click **Run App**. The window says **Hello, world!**. Replace the matching line with the copied code:

```java-after-2-r1
        Label greeting = new Label("Hello, world!");
        Label greeting = new Label("Hello, Java!");
```

Click **Run App** again. The window should now say **Hello, Java!**.
Keep this **same Greeting project** for lessons 2 and 3. You will add to this
code rather than replace `Main.java`.

### App startup

Your Main extends `zero.App`. The starter's
`main(...)` calls `launch(args)`. Zero then calls `settings()` once, calls
`setup()` once to build your interface, and shows the window. Keep that entry
point; you do not need to construct another Main.

The starter already uses `padding(20)` to leave space around the content.
For an optional window title and initial size, replace the matching method with the copied code:

```java-after-2-3-4-5-6-r1
    @Override public void settings() { padding(20); }
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
respond; sleeping or a long loop can make the window stop responding.

Next: [Add a button](01-hello-button.md).
