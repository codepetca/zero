from pathlib import Path
import shutil, tempfile, subprocess, time, os
source=Path(__file__).resolve().parent.parent / 'student-template'
subprocess.run(['node', str(source.parent/'scripts/prepare-starter.mjs')], check=True)
assert (source/'src/main/java/ScoreDisplay.java').read_bytes() == (source/'examples/shared/ScoreDisplay.java').read_bytes(), 'Shared ScoreDisplay copy drift'
assert (source/'src/main/java/Main.java').read_bytes() == (source/'examples/quiz/Main.java').read_bytes(), 'Default quiz copy drift'
checks={
'quiz': '''TextField answer = (TextField) field(app, "answer");
        Button check = (Button) field(app, "check");
        Label feedback = (Label) field(app, "feedback");
        Label score = (Label) ((ScoreDisplay) field(app, "score")).view();
        answer.setText("wrong"); check.fire();
        require(feedback.getText().equals("Try again.") && score.getText().equals("Score: 0"), "Incorrect answer keeps score");
        answer.setText(" 42 "); check.fire();
        require(feedback.getText().equals("Correct!") && score.getText().equals("Score: 10"), "Trimmed correct answer awards points");
        require(check.isDisabled(), "Correct answer disables repeat scoring");
        check.fire();
        require((int) field(app, "points") == 10, "Disabled check awards only once");
        ScoreDisplay captioned = new ScoreDisplay("Correct");
        require(((Label) captioned.view()).getText().equals("Correct: 0"), "Custom caption starts at zero");
        captioned.setScore(4);
        require(((Label) captioned.view()).getText().equals("Correct: 4"), "Custom caption survives updates");''',
'practice': '''Button add = button(stage.getScene().getRoot(), "Completed an exercise");
        Button reset = button(stage.getScene().getRoot(), "Reset");
        Label score = (Label) ((ScoreDisplay) field(app, "score")).view();
        add.fire(); add.fire();
        require((int) field(app, "completed") == 2 && score.getText().equals("Completed: 2"), "Repeated completion updates shared caption");
        reset.fire();
        require((int) field(app, "completed") == 0 && score.getText().equals("Completed: 0"), "Reset updates shared caption");
        add.fire();
        require(score.getText().equals("Completed: 1"), "Completion works after reset");''',
'study': '''TextField answer = (TextField) field(app, "answer");
        Button check = (Button) field(app, "check");
        Button next = (Button) field(app, "next");
        Button restart = (Button) field(app, "restart");
        Label feedback = (Label) field(app, "feedback");
        Label progress = (Label) field(app, "progress");
        Label question = (Label) field(app, "question");
        Label score = (Label) ((ScoreDisplay) field(app, "score")).view();
        String firstPrompt = question.getText();
        String initialFeedback = feedback.getText();
        require(progress.getText().equals("Question 1 of 3") && score.getText().equals("Score: 0"), "Study starts at question one with zero score");
        require(next.isDisabled() && !check.isDisabled() && !answer.isDisabled() && !restart.isDisabled(), "Initial controls allow checking and restarting");
        next.fire(); check.fire();
        require(question.getText().equals(firstPrompt) && next.isDisabled() && score.getText().equals("Score: 0"), "Blank answer cannot score or skip");
        answer.setText("wrong"); check.fire();
        require(feedback.getText().startsWith("Try again.") && !check.isDisabled() && !answer.isDisabled() && next.isDisabled(), "Wrong answer permits retry, keeps Next locked");
        answer.setText(" 3 ");
        Event.fireEvent(answer, new javafx.event.ActionEvent());
        require(feedback.getText().startsWith("Correct!") && score.getText().equals("Score: 1"), "Enter accepts trimmed correct answer");
        require(check.isDisabled() && answer.isDisabled() && !next.isDisabled(), "Correct answer locks checking and unlocks Next");
        check.fire(); Event.fireEvent(answer, new javafx.event.ActionEvent());
        require((int) field(app, "points") == 1, "Repeated button or Enter awards only once");
        next.fire();
        require(progress.getText().equals("Question 2 of 3") && !question.getText().equals(firstPrompt), "Next advances prompt and progress");
        require(answer.getText().isEmpty() && feedback.getText().equals(initialFeedback) && next.isDisabled() && !check.isDisabled() && !answer.isDisabled(), "Advance resets input, feedback and controls");
        answer.setText("unfinished attempt"); check.fire(); restart.fire();
        require(progress.getText().equals("Question 1 of 3") && question.getText().equals(firstPrompt) && score.getText().equals("Score: 0"), "Mid-session restart resets question and score");
        require(answer.getText().isEmpty() && feedback.getText().equals(initialFeedback) && next.isDisabled() && !check.isDisabled() && !answer.isDisabled(), "Mid-session restart resets input, feedback and controls");
        String[] answers = {"3", " TRUE ", "0"};
        for (int i = 0; i < answers.length; i++) {
            answer.setText(answers[i]); check.fire();
            require(score.getText().equals("Score: " + (i + 1)), "Each question scores exactly one point");
            next.fire();
        }
        require(progress.getText().equals("Completed 3 of 3") && question.getText().equals("Study session complete!"), "Last Next shows completion");
        require(feedback.getText().contains("Final score: 3") && score.getText().equals("Score: 3"), "Final summary reports total");
        require(answer.getText().isEmpty() && answer.isDisabled() && check.isDisabled() && next.isDisabled() && !restart.isDisabled(), "Final controls allow only restart");
        next.fire(); check.fire(); Event.fireEvent(answer, new javafx.event.ActionEvent());
        require(score.getText().equals("Score: 3") && progress.getText().equals("Completed 3 of 3"), "Finished session ignores scoring and advancing");
        restart.fire();
        require((int) field(app, "questionIndex") == 0 && (int) field(app, "points") == 0 && !(boolean) field(app, "answered") && !(boolean) field(app, "finished"), "Restart resets all session state");
        require(progress.getText().equals("Question 1 of 3") && question.getText().equals(firstPrompt) && score.getText().equals("Score: 0"), "Restart resets all displayed totals");
        require(answer.getText().isEmpty() && feedback.getText().equals(initialFeedback) && !answer.isDisabled() && !check.isDisabled() && next.isDisabled() && !restart.isDisabled(), "Restart restores every control and feedback");
        answer.setText("3"); check.fire();
        require(score.getText().equals("Score: 1") && !next.isDisabled(), "Restarted session can score again");''',
'animation': '''Player player = (Player) field(app, "player");
        double before = (double) field(player, "x");
        player.update(before + 100, 100, 0.1);
        require((double) field(player, "x") == before + 50, "Player updates explicitly using elapsed time");
        app.draw();
        int x = (int) (double) field(player, "x");
        int y = (int) (double) field(player, "y");
        require(app.canvas().snapshot(null, null).getPixelReader().getColor(x, y).equals(Color.web("#4878e8")), "Player draws explicitly");''',
'keyboard': '''Object mover = field(app, "mover");
        double before = (double) field(mover, "x");
        Event.fireEvent(app.canvas(), new KeyEvent(KeyEvent.KEY_PRESSED, "", "", KeyCode.RIGHT, false, false, false, false));
        app.update(0.1);
        Event.fireEvent(app.canvas(), new KeyEvent(KeyEvent.KEY_RELEASED, "", "", KeyCode.RIGHT, false, false, false, false));
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
import zero.SketchApp;
public class ExampleCheck extends Application {
    static Object field(Object object, String name) throws Exception {
        var field = object.getClass().getDeclaredField(name);
        field.setAccessible(true);
        return field.get(object);
    }
    static void require(boolean value, String message) {
        if (!value) throw new AssertionError(message);
    }
    static void mouse(SketchApp app, javafx.event.EventType<MouseEvent> type, double x, double y, MouseButton button) {
        Event.fireEvent(app.canvas(), new MouseEvent(type, x, y, x, y, button, 1,
                false, false, false, false, button == MouseButton.PRIMARY,
                false, button == MouseButton.SECONDARY, false, false, false, null));
    }
    static Button button(javafx.scene.Node node, String text) {
        if (node instanceof Button b && b.getText().equals(text)) return b;
        if (node instanceof javafx.scene.Parent parent) {
            for (javafx.scene.Node child : parent.getChildrenUnmodifiable()) {
                Button found = button(child, text);
                if (found != null) return found;
            }
        }
        return null;
    }
    public void start(Stage stage) {
        Thread watchdog = new Thread(() -> {
            try { Thread.sleep(15_000); } catch (InterruptedException ignored) { return; }
            System.err.println("EXAMPLE_TIMEOUT"); System.exit(1);
        });
        watchdog.setDaemon(true); watchdog.start();
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
started = time.monotonic()
with tempfile.TemporaryDirectory(prefix='zero-examples-') as temp:
    root = Path(temp)
    print('Finite GUI checks in isolated projects:', root, flush=True)
    for kind, check in checks.items():
        dest = root / kind
        shutil.copytree(source, dest, ignore=shutil.ignore_patterns('target', 'examples'))
        for java in (source/'examples'/kind).glob('*.java'):
            shutil.copy2(java, dest/'src/main/java'/java.name)
        if kind in ('quiz', 'practice', 'study'):
            shutil.copy2(source/'examples/shared/ScoreDisplay.java', dest/'src/main/java/ScoreDisplay.java')
        (dest/'src/main/java/ExampleCheck.java').write_text(harness.replace('CHECK', check).replace('KIND', kind))
        wrapper = 'mvnw.cmd' if os.name == 'nt' else './mvnw'
        before = time.monotonic()
        result = subprocess.run([wrapper, '-B', '-Dapp.mainClass=ExampleCheck', 'clean', 'compile', 'javafx:run'],
                                cwd=dest, capture_output=True, text=True, timeout=60)
        marker = 'EXAMPLE_OK ' + kind
        if result.returncode or marker not in result.stdout:
            print(result.stdout[-5000:], result.stderr[-3000:], flush=True)
            raise SystemExit(result.returncode or 1)
        print(f'{marker} ({time.monotonic() - before:.2f}s)', flush=True)
print(f'All {len(checks)} GUI example checks passed ({time.monotonic() - started:.2f}s). Shared source copies match.', flush=True)
