// This is an editable example. Its finite checks demonstrate declared behavior;
// the independent hub policy separately checks the build and consumer origins.
const preview = 'iVBORw0KGgoAAAANSUhEUgAAAUAAAAC0CAIAAABqhmJGAAACL0lEQVR4nO3TwQmAMADAwO4/oxM4gYhCd9BHiR7cAPlkHOcNRI3lBcBjBoYwA0OYgSHMwBBmYAgzMIQZGMIMDGEGhjADQ5iBIczAEGZgCDMwhBkYwgwMYQaGMANDmIEhzMAQZmAIMzCEGRjCDAxhBoYwA0OYgSHMwBBmYAgzMIQZGMIMDGEGhjADQ5iBIczAEGZgCDMwhBkYwgwMYQaGMANDmIEhzMAQZmAIMzCEGRjCDAxhBoYwA0OYgSHMwBBmYAgzMIQZGMIMDGEGhjADQ9iygbf9gs8wMIQZGMIMDGEGhjADQ5iBIczAEGZgCDMwhBkYwgwMYQaGMANDmIEhzMAQZmAIMzCEGRjCDAxhBoYwA0OYgSHMwBBmYAgzMIQZGMIMDGEGhjADQ5iBIczAEGZgCDMwhBkYwgwMYQaGMANDmIEhzMAQZmAIMzCEGRjCDAxhBoYwA0OYgSHMwBBmYAgzMIQZGMIMDGEGhjADQ5iBIczAEGZgCDMwhBkYwgwMYb8bGHjPwBBmYAgzMIQZGMIMDGEGhjADQ5iBIczAEGZgCDMwhBkYwgwMYQaGMANDmIEhzMAQZmAIMzCEGRjCDAxhBoYwA0OYgSHMwBBmYAgzMIQZGMIMDGEGhjADQ5iBIczAEGZgCDMwhBkYwgwMYQaGMANDmIEhzMAQZmAIMzCEGRjCDAxhBoYwA0OYgSHMwBBmYAgzMIQZGMIMDGEGhjADQ5iBIczAEGZgCDMwhE0KIVHXaj/K9AAAAABJRU5ErkJggg==';
const mit = `MIT License\n\nCopyright (c) 2026 Zero contributors\n\nPermission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:\n
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.\n
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.\n`;

export function scaffoldBundle({libraryId, className, title, login = 'Zero contributors'}) {
  if (typeof login !== 'string' || !/^[A-Za-z0-9 -]{1,80}$/.test(login)) throw new Error('Invalid scaffold copyright name');
  const usage = `${className} display = new ${className}();\ndisplay.setValue("Hello");\nroot.getChildren().add(display.view());`;
  const example = (value) => `import javafx.application.Application;
import javafx.application.Platform;
import javafx.scene.Scene;
import javafx.scene.control.Label;
import javafx.scene.layout.StackPane;
import javafx.stage.Stage;
import zero.${libraryId}.${className};

public class Main extends Application {
    @Override public void start(Stage stage) {
        ${className} display = new ${className}();
        display.setValue("${value}");
        if (!(display.view() instanceof Label label) || !label.getText().equals("${value}")) {
            throw new AssertionError("The display should show the app-owned value");
        }
        stage.setScene(new Scene(new StackPane(display.view()), 320, 180));
        stage.setTitle("${value}");
        stage.show();
        Platform.runLater(() -> { stage.close(); Platform.exit(); });
    }
    public static void main(String[] args) { launch(args); }
}
`;
  return {
    descriptor: {schema:1, libraryId, version:'0.1.0', title, description:'A small editable value display for ordinary JavaFX apps.',category:'ui', components:[{className,description:'Shows an app-owned text value.',api:['public Node view()','public void setValue(String value)'],usage}]},
    files: {
      [`src/zero/${libraryId}/${className}.java`]: `// SPDX-License-Identifier: MIT
package zero.${libraryId};

import javafx.scene.Node;
import javafx.scene.control.Label;

public class ${className} {
    private final Label label = new Label("");
    public Node view() { return label; }
    public void setValue(String value) { label.setText(value); }
}
`,
      'checks/BehaviorCheck.java': `import javafx.application.Platform;
import javafx.scene.control.Label;
import zero.${libraryId}.${className};
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicReference;

public class BehaviorCheck {
    public static void main(String[] args) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<Throwable> failure = new AtomicReference<>();
        Platform.startup(() -> {
            try {
                ${className} display = new ${className}();
                display.setValue("First");
                if (!(display.view() instanceof Label label) || !label.getText().equals("First"))
                    throw new AssertionError("Expected first value");
                display.setValue("Second");
                if (!((Label) display.view()).getText().equals("Second"))
                    throw new AssertionError("Expected changed value");
            } catch (Throwable error) { failure.set(error); }
            finally { done.countDown(); }
        });
        if (!done.await(10, java.util.concurrent.TimeUnit.SECONDS))
            throw new AssertionError("JavaFX check timed out");
        Platform.exit();
        if (failure.get() != null) throw new AssertionError("Behavior check failed", failure.get());
    }
}
`,
      'examples/first/Main.java': example('Study progress'),
      'examples/second/Main.java': example('Game score'),
      'API.md': `# ${title}\n\nImport \`zero.${libraryId}.${className}\`.\n\nCreate a display, call \`setValue(String)\` when the app changes its value, and add \`view()\` to your layout. Each display has one JavaFX parent.\n\nThe included finite checks exercise two values and two consumer apps. They do not prove every behavior.\n`,
      'CHANGELOG.md': '# Changelog\n\n## 0.1.0\n\nFirst editable value display.\n',
      'LICENSE': mit.replace('Zero contributors',login),
      'preview.png':preview
    }
  };
}
