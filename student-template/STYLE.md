# Make it look good

Start with the [Hello app](examples/hello-app/README.md) for controls or
[Reach the coin](examples/reach-the-coin/README.md) for a canvas game.
Keep the layout clear, then change a few deliberate values.

## A small visual recipe

Use one font family, a larger bold heading, and a small palette:

| Purpose | Colour |
| --- | --- |
| Background | `#f6f5ff` |
| Text and keyboard focus | `#22213b` |
| Main action or player | `#6457e8` |
| Main action hover | `#5344cf` |
| Main action pressed | `#4435b3` |

Hello app uses 16 px body text and a 32 px heading, 12 px between buttons,
16 px between rows and 28 px inside the screen edge. Use layouts instead of
individual control coordinates so controls can adapt to their text and window size.

Clear button labels, feedback near the action and visible keyboard focus help
people use the app. Try Tab to reach each control and Space to activate a button.
Keep a written win message in a game so colour alone does not communicate a win.

## App appearance: a stylesheet

Hello app supplies an editable `theme.css`. Copy it into your standalone starter
at `src/main/resources/hello-app/theme.css`, along with Main as described in
[its copy instructions](examples/hello-app/README.md).

Load it onto your `VBox screen` in setup, before `show(screen)`:

```java
var stylesheet = getClass().getResource("/hello-app/theme.css");
if (stylesheet == null) {
    throw new IllegalArgumentException("Missing /hello-app/theme.css");
}
screen.getStylesheets().add(stylesheet.toExternalForm());
show(screen);
```

The leading `/` means the root of the bundled resources. Put the file in
`src/main/resources/`, not beside Main. Save changes and Run App again.

JavaFX uses CSS properties starting with `-fx-`. For example, this small button
style has rounded corners and visible interaction states:

```css
.button {
    -fx-background-color: #6457e8;
    -fx-text-fill: white;
    -fx-font-weight: bold;
    -fx-background-radius: 10;
    -fx-border-radius: 10;
    -fx-border-color: transparent;
    -fx-border-width: 3;
    -fx-padding: 9 21;
}
.button:hover { -fx-background-color: #5344cf; }
.button:pressed { -fx-background-color: #4435b3; }
.button:focused { -fx-border-color: #22213b; }
.button:disabled {
    -fx-background-color: #64748b;
    -fx-opacity: 0.65;
}
```

The focus border shows which button the keyboard will activate. Disabled
controls cannot be activated. Check these states after changing the palette.
The complete stylesheet also styles the background, heading, labels and input.
Change those existing rules before adding more.

To give one control a role, add a style class:

```java
heading.getStyleClass().add("heading");
```

Then select it in the stylesheet:

```css
.heading {
    -fx-font-size: 32px;
    -fx-font-weight: bold;
}
```

JavaFX CSS has its own supported properties; use the
[JavaFX 21 CSS reference](https://openjfx.io/javadoc/21/javafx.graphics/javafx/scene/doc-files/cssref.html)
when you want to extend the stylesheet.

## Game appearance: drawing values

Canvas shapes and text use drawing code. A control stylesheet does not theme
the pixels drawn by `rect(...)` or `text(...)`.

Keep colours in ordinary fields so they are easy to change:

```java
private Color backgroundColour = Color.web("#f6f5ff");
private Color textColour = Color.web("#22213b");
```

Use them in draw:

```java
background(backgroundColour);
fill(textColour);
textSize(16);
text("Arrow keys: move    R: restart", 24, 74);
```

For a bold heading, use the ordinary JavaFX drawing context:

```java
// Imports: javafx.scene.text.Font and javafx.scene.text.FontWeight
graphics().setFont(Font.font("System", FontWeight.BOLD, 28));
text("Reach the coin", 24, 44);
```

`textSize(...)` replaces the font with the default JavaFX family at that size.
Call `graphics().setFont(...)` after it when you need a different family or
weight. Drawing styles persist until you change them.

## Later: bundle a font or image

The System font is a good starting point; its appearance can differ by computer.
To use a specific font, put a font file in `src/main/resources/fonts/`, then
load it once in setup. Use a font whose license permits redistribution and
include its required license file with your project.

```java
var fontFile = getClass().getResource("/fonts/MyFont-Regular.ttf");
if (fontFile == null) {
    throw new IllegalArgumentException("Missing font /fonts/MyFont-Regular.ttf");
}
Font bodyFont = Font.loadFont(fontFile.toExternalForm(), 16);
if (bodyFont == null) {
    throw new IllegalArgumentException("Cannot load MyFont-Regular.ttf");
}
// SimpleApp: feedback.setFont(bodyFont);
// SketchApp: graphics().setFont(bodyFont);
```

See the [JavaFX Font reference](https://openjfx.io/javadoc/21/javafx.graphics/javafx/scene/text/Font.html)
for font families and loading. In an app, a stylesheet's font rule can override
`setFont(...)`; use one approach consistently for each control.

For a game image, put `player.png` in `src/main/resources/images/`, declare
`private Image playerImage;`, and import `javafx.scene.image.Image`.
Load it once in setup:

```java
playerImage = loadImage("/images/player.png");
```

Then draw it each frame with `image(playerImage, x, y, 24, 24)`.
`loadImage(...)` reports a useful error if the resource is missing or unreadable.
Use your own artwork or artwork you have permission to redistribute. The
[full API reference](API.md) explains resource paths and more drawing options.
