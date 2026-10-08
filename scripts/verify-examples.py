from pathlib import Path
import shutil, tempfile, subprocess
source=Path(__file__).resolve().parent.parent / 'student-template'
root=Path(tempfile.mkdtemp(prefix='zero-examples-'))
checks={
'keyboard': '''Object mover = field(app, "mover");
        double before = (double) field(mover, "x");
        Event.fireEvent(stage.getScene(), new KeyEvent(KeyEvent.KEY_PRESSED, "", "", KeyCode.RIGHT, false, false, false, false));
        app.update(0.1);
        Event.fireEvent(stage.getScene(), new KeyEvent(KeyEvent.KEY_RELEASED, "", "", KeyCode.RIGHT, false, false, false, false));
        require((double) field(mover, "x") > before, "Right arrow must move object");
        mover.getClass().getMethod("update", int.class, int.class, double.class, double.class, double.class).invoke(mover, 1, 1, 100.0, app.width(), app.height());
        require((double) field(mover, "x") == app.width() - 18, "Right edge clamp");
        require((double) field(mover, "y") == app.height() - 18, "Bottom edge clamp");
        app.draw();
        require(app.canvas().snapshot(null, null).getPixelReader().getColor(622, 382).equals(Color.CORNFLOWERBLUE), "Mover must draw");''',
'counter': '''HBox controls = (HBox) app.layout().getBottom();
        ((Button) controls.getChildren().get(0)).fire();
        require((int) field(app, "count") == 1, "Add one changes count");
        require(((Label) field(app, "total")).getText().equals("Count: 1"), "Label updates");
        ((Button) controls.getChildren().get(1)).fire();
        require((int) field(app, "count") == 0, "Reset changes count");
        require(((Label) field(app, "total")).getText().equals("Count: 0"), "Reset label");''',
'drawing': '''mouse(app, MouseEvent.MOUSE_PRESSED, 100, 100, MouseButton.PRIMARY);
        app.draw();
        mouse(app, MouseEvent.MOUSE_DRAGGED, 150, 100, MouseButton.PRIMARY);
        app.draw();
        require(app.canvas().snapshot(null, null).getPixelReader().getColor(125, 100).equals(Color.DARKBLUE), "Drag paints line");
        mouse(app, MouseEvent.MOUSE_RELEASED, 150, 100, MouseButton.PRIMARY);
        app.draw();
        mouse(app, MouseEvent.MOUSE_PRESSED, 100, 100, MouseButton.SECONDARY);
        app.draw();
        require(app.canvas().snapshot(null, null).getPixelReader().getColor(125, 100).equals(Color.WHITE), "Secondary button clears");'''
}
harness='''import javafx.application.Application;
import javafx.application.Platform;
import javafx.animation.PauseTransition;
import javafx.util.Duration;
import javafx.stage.Stage;
import javafx.event.Event;
import javafx.scene.input.*;
import javafx.scene.control.*;
import javafx.scene.layout.HBox;
import javafx.scene.paint.Color;
import zero.SimpleApp;
public class ExampleCheck extends Application {
    static Object field(Object object, String name) throws Exception {
        var field = object.getClass().getDeclaredField(name);
        field.setAccessible(true);
        return field.get(object);
    }
    static void require(boolean value, String message) {
        if (!value) throw new AssertionError(message);
    }
    static void mouse(SimpleApp app, javafx.event.EventType<MouseEvent> type, double x, double y, MouseButton button) {
        Event.fireEvent(app.canvas(), new MouseEvent(type, x, y, x, y, button, 1,
                false, false, false, false, button == MouseButton.PRIMARY,
                false, button == MouseButton.SECONDARY, false, false, false, null));
    }
    public void start(Stage stage) {
        Main app = new Main();
        app.start(stage);
        PauseTransition wait = new PauseTransition(Duration.millis(200));
        wait.setOnFinished(event -> {
            try {
                CHECK
                System.out.println("EXAMPLE_OK KIND");
            } catch (Throwable failure) {
                failure.printStackTrace();
                System.exit(1);
            } finally {
                app.stop();
                stage.close();
                Platform.exit();
            }
        });
        wait.play();
    }
    public static void main(String[] args) { launch(args); }
}
'''
print('Temporary isolated projects:',root,flush=True)
for kind, check in checks.items():
    dest=root/kind
    shutil.copytree(source,dest,ignore=shutil.ignore_patterns('target','examples'))
    for java in (source/'examples'/kind).glob('*.java'):
        shutil.copy2(java,dest/'src/main/java'/java.name)
    (dest/'src/main/java/ExampleCheck.java').write_text(harness.replace('CHECK',check).replace('KIND',kind))
    result=subprocess.run(['./mvnw','-B','-Dapp.mainClass=ExampleCheck','clean','compile','javafx:run'],cwd=dest,capture_output=True,text=True,timeout=60)
    print(kind,result.stdout[-1700:], result.stderr[-1400:],flush=True)
    if result.returncode: raise SystemExit(result.returncode)
