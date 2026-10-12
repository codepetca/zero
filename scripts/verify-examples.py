from pathlib import Path
import argparse, shutil, tempfile, subprocess, time, os
source=Path(__file__).resolve().parent.parent / 'student-template'
subprocess.run(['node', str(source.parent/'scripts/prepare-starter.mjs')], check=True)
assert (source/'src/main/java/ScoreDisplay.java').read_bytes() == (source/'examples/shared/ScoreDisplay.java').read_bytes(), 'Shared ScoreDisplay copy drift'
checks={
'hello-world': '''require(stage.isShowing(), "Greeting window is visible");
        var content = ((javafx.scene.layout.BorderPane) stage.getScene().getRoot()).getCenter();
        require(content instanceof Label && ((Label) content).getText().equals("Hello, world!"), "Default starter displays the greeting");''',
'hello-button': '''var screen = (javafx.scene.layout.VBox) ((javafx.scene.layout.BorderPane) stage.getScene().getRoot()).getCenter();
        var greeting = (Label) screen.getChildren().get(0);
        var sayHello = (Button) screen.getChildren().get(1);
        require(greeting.getText().equals("Hello, world!") && sayHello.getText().equals("Say hello"), "Initial greeting and button");
        sayHello.fire();
        require(greeting.getText().equals("Hello, Java!"), "Click changes the greeting");
        sayHello.fire();
        require(greeting.getText().equals("Hello, Java!") && screen.getChildren().get(0) == greeting, "Repeated click updates the same label");''',
'hello-name': '''var screen = (javafx.scene.layout.VBox) ((javafx.scene.layout.BorderPane) stage.getScene().getRoot()).getCenter();
        var greeting = (Label) screen.getChildren().get(0);
        var name = (TextField) screen.getChildren().get(1);
        var sayHello = (Button) screen.getChildren().get(2);
        require(greeting.getText().equals("Hello, world!") && name.getText().isEmpty(), "Name lesson starts with an empty field");
        name.setText("Stew"); sayHello.fire();
        require(greeting.getText().equals("Hello, Stew!"), "Click reads the typed name");
        name.setText("Ada"); sayHello.fire();
        require(greeting.getText().equals("Hello, Ada!") && screen.getChildren().get(0) == greeting, "Next click reads the new name into the same label");''',
'tiny-quiz': '''var screen = (javafx.scene.layout.VBox) ((javafx.scene.layout.BorderPane) stage.getScene().getRoot()).getCenter();
        var question = (Label) screen.getChildren().get(0);
        var answer = (TextField) screen.getChildren().get(1);
        var check = (Button) screen.getChildren().get(2);
        var feedback = (Label) screen.getChildren().get(3);
        require(question.getText().equals("What is 2 + 3?") && feedback.getText().isEmpty(), "Tiny quiz starts with its question and no feedback");
        check.fire();
        require(feedback.getText().equals("Try again."), "Blank answer takes the incorrect branch");
        answer.setText("4"); check.fire();
        require(feedback.getText().equals("Try again."), "Wrong answer permits retry");
        answer.setText("5"); check.fire();
        require(feedback.getText().equals("Correct!") && !check.isDisabled(), "Correct answer shows feedback and keeps checking enabled");
        answer.setText("6"); check.fire();
        require(feedback.getText().equals("Try again."), "Later wrong answer replaces correct feedback");''',
'click-counter': '''var screen = (javafx.scene.layout.VBox) ((javafx.scene.layout.BorderPane) stage.getScene().getRoot()).getCenter();
        var display = (Label) screen.getChildren().get(0);
        var add = (Button) screen.getChildren().get(1);
        require(display.getText().equals("0"), "Counter starts at zero");
        add.fire(); add.fire();
        require(display.getText().equals("2") && (int) field(app, "count") == 2, "Two clicks update state and display");''',
'reset-counter': '''var screen = (javafx.scene.layout.VBox) ((javafx.scene.layout.BorderPane) stage.getScene().getRoot()).getCenter();
        var display = (Label) screen.getChildren().get(0);
        var add = (Button) screen.getChildren().get(1);
        var reset = (Button) screen.getChildren().get(2);
        require(display.getText().equals("0"), "Reset lesson starts at zero");
        add.fire(); add.fire();
        require(display.getText().equals("2"), "Increment method updates display");
        reset.fire(); reset.fire();
        require(display.getText().equals("0") && (int) field(app, "count") == 0, "Reset method clears state and remains at zero");
        add.fire();
        require(display.getText().equals("1"), "Increment works after Reset");''',
'object-counter': '''var screen = (javafx.scene.layout.VBox) ((javafx.scene.layout.BorderPane) stage.getScene().getRoot()).getCenter();
        var display = (Label) screen.getChildren().get(0);
        var add = (Button) screen.getChildren().get(1);
        var reset = (Button) screen.getChildren().get(2);
        var counter = (Counter) field(app, "counter");
        require(display.getText().equals("0") && counter.value() == 0, "Object counter starts at zero");
        add.fire(); add.fire();
        require(display.getText().equals("2") && counter.value() == 2, "Main explicitly updates object and display");
        reset.fire(); add.fire();
        require(display.getText().equals("1") && counter.value() == 1, "Object resets and can increment again");
        var independent = new Counter(); independent.increment(); independent.increment();
        require(independent.value() == 2 && counter.value() == 1, "Counter instances keep independent state");''',
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
checks['coin-game-controls'] = '''app.stop();
        var controls = (HBox) app.layout().getBottom();
        var score = (Label) field(app, "score");
        var player = (Player) field(app, "player");
        var coin = (Coin) field(app, "coin");
        require(app.layout().getCenter() == app.canvas() && controls.getChildren().contains(score), "Canvas and ordinary UI share one layout");
        require(score.getText().equals("Score: 0 / 1"), "One-coin UI starts at zero");
        setDouble(player, "x", (double) field(coin, "x"));
        setDouble(player, "y", (double) field(coin, "y"));
        app.update(0); app.update(0); app.draw();
        require(score.getText().equals("Score: 1 / 1") && (int) field(app, "points") == 1 && coin.isCollected(), "Repeated contact scores once and updates existing control");
        var restart = button(controls, "Restart");
        restart.requestFocus(); restart.fire();
        require(score == field(app, "score") && app.layout().getBottom() == controls, "Restart reuses UI objects");
        require((int) field(app, "points") == 0 && !((Coin) field(app, "coin")).isCollected() && field(app, "player") != player, "Restart resets game data");
        require(score.getText().equals("Score: 0 / 1") && stage.getScene().getFocusOwner() == app.canvas(), "Restart resets display and returns input to canvas");'''
checks['coin-game-component'] = '''app.stop();
        var controls = (HBox) app.layout().getBottom();
        var display = (ScoreDisplay) field(app, "score");
        var score = (Label) display.view();
        var player = (Player) field(app, "player");
        var coins = (Coin[]) field(app, "coins");
        require(app.layout().getCenter() == app.canvas() && controls.getChildren().get(0) == display.view(), "Shared Node component sits beside canvas");
        require(score.getText().equals("Score: 0") && ((Label) field(app, "goal")).getText().equals("Goal: 3 coins"), "Display and app-owned goal start correctly");
        for (Coin coin : coins) {
            setDouble(player, "x", (double) field(coin, "x"));
            setDouble(player, "y", (double) field(coin, "y"));
            app.update(0); app.update(0);
        }
        app.draw();
        require((int) field(app, "points") == 3 && (boolean) field(app, "won") && score.getText().equals("Score: 3"), "All coins score once and win updates shared display");
        var restart = button(controls, "Restart");
        restart.requestFocus(); restart.fire();
        require(field(app, "score") == display && display.view() == score && app.layout().getBottom() == controls, "Restart preserves component instance and native view");
        require((int) field(app, "points") == 0 && !(boolean) field(app, "won") && score.getText().equals("Score: 0"), "Restart resets rules and presentation");
        for (Coin coin : (Coin[]) field(app, "coins")) require(!coin.isCollected(), "Restart restores coins");
        require(stage.getScene().getFocusOwner() == app.canvas(), "Component game Restart returns canvas input");
        var other = new ScoreDisplay("Questions"); other.setScore(2);
        require(other.view() != display.view() && ((Label) other.view()).getText().equals("Questions: 2") && score.getText().equals("Score: 0"), "Shared class creates independent app views");'''
checks['composed-study'] = '''var start = (StartScreen) field(app, "startScreen");
        var hud = (Hud) field(app, "hud");
        var activity = (javafx.scene.layout.VBox) field(app, "activity");
        var root = (javafx.scene.layout.BorderPane) stage.getScene().getRoot();
        var answer = (TextField) field(app, "answer");
        var check = (Button) field(app, "check");
        var next = (Button) field(app, "next");
        var score = (Label) ((ScoreDisplay) field(hud, "score")).view();
        require(root.getCenter() == start.view() && !(boolean) field(app, "playing"), "Start screen appears before activity");
        answer.setText("3"); check.fire(); next.fire();
        require((int) field(app, "points") == 0 && (int) field(app, "questionIndex") == 0, "Inactive session cannot score or advance");
        button(start.view(), "Start").fire();
        require(root.getCenter() == activity && activity.getChildren().contains(hud.view()), "Main connects shared views to activity");
        require(answer.getText().isEmpty() && (boolean) field(app, "playing"), "Start resets input and rules");
        answer.setText("wrong"); check.fire();
        require(score.getText().equals("Score: 0") && !check.isDisabled() && next.isDisabled(), "Wrong answer permits retry without score");
        for (String value : new String[]{"3", "true", "0"}) {
            answer.setText(value); check.fire();
            int points = (int) field(app, "points"); check.fire();
            require((int) field(app, "points") == points, "Correct answer scores only once"); next.fire();
        }
        require((boolean) field(app, "finished") && !(boolean) field(app, "playing") && score.getText().equals("Score: 3"), "Session completion stops scoring");
        button(hud.view(), "Restart").fire();
        require(field(app, "hud") == hud && root.getCenter() == activity && score.getText().equals("Score: 0") && (int) field(app, "questionIndex") == 0, "Restart retains components and resets state");
        answer.setText("3"); check.fire();
        require(score.getText().equals("Score: 1"), "Restarted app can score again");
        int[] calls = {0}; var other = new Hud(() -> calls[0]++); other.setScore(7);
        button(other.view(), "Restart").fire();
        require(calls[0] == 1 && other.view() != hud.view() && score.getText().equals("Score: 1"), "Component action is supplied and instances stay independent");'''
checks['composed-game'] = '''app.stop();
        var start = (StartScreen) field(app, "startScreen");
        var hud = (Hud) field(app, "hud");
        var player = (Player) field(app, "player");
        var coins = (Coin[]) field(app, "coins");
        var score = (Label) ((ScoreDisplay) field(hud, "score")).view();
        require(app.layout().getCenter() == app.canvas() && app.layout().getLeft() == start.view() && !(boolean) field(app, "playing"), "Start panel preserves sketch canvas");
        require(app.layout().getBottom() == hud.view() && hud.view().isDisabled(), "Initial layout reserves HUD space and disables Restart");
        setDouble(player, "x", (double) field(coins[0], "x"));
        setDouble(player, "y", (double) field(coins[0], "y")); app.update(0);
        require((int) field(app, "points") == 0 && !coins[0].isCollected(), "Menu prevents scoring even while timer exists");
        button(start.view(), "Start").fire();
        player = (Player) field(app, "player"); coins = (Coin[]) field(app, "coins");
        require(app.layout().getLeft() == null && app.layout().getBottom() == hud.view() && !hud.view().isDisabled() && (boolean) field(app, "playing"), "Start connects and enables same HUD");
        require(stage.getScene().getFocusOwner() == app.canvas(), "Start returns keyboard focus to canvas");
        app.layout().applyCss(); app.layout().layout();
        require(hud.view().getBoundsInParent().getMaxY() <= stage.getScene().getHeight() + 1, "HUD fits initial scene after Start");
        double x = (double) field(player, "x");
        // Deterministic held input, like MovementCheck; native window focus is not a keyboard trial.
        var heldField = SketchApp.class.getDeclaredField("keys"); heldField.setAccessible(true);
        var heldKeys = (java.util.Set<KeyCode>) heldField.get(app);
        heldKeys.add(KeyCode.RIGHT); app.update(0.1); heldKeys.clear();
        require((double) field(player, "x") > x, "Active game explicitly updates from held direction");
        for (Coin coin : coins) {
            setDouble(player, "x", (double) field(coin, "x"));
            setDouble(player, "y", (double) field(coin, "y")); app.update(0); app.update(0);
        }
        require((boolean) field(app, "won") && !(boolean) field(app, "playing") && score.getText().equals("Score: 3"), "Win stops game and reports three once-only coins");
        x = (double) field(player, "x"); app.update(1);
        require((double) field(player, "x") == x, "Finished game does not update simulation");
        button(hud.view(), "Restart").fire();
        require(field(app, "hud") == hud && field(app, "startScreen") == start && field(app, "player") != player && (boolean) field(app, "playing") && !(boolean) field(app, "won"), "Restart preserves views and resets gameplay objects");
        require((int) field(app, "points") == 0 && score.getText().equals("Score: 0") && stage.getScene().getFocusOwner() == app.canvas(), "Restart clears score and returns focus");
        for (Coin coin : (Coin[]) field(app, "coins")) require(!coin.isCollected(), "Fresh run restores every coin");
        app.draw();'''
# The packaged consumers keep the same rules; exercise those rules through the JAR.
jar_check = '''var origin = Hud.class.getProtectionDomain().getCodeSource().getLocation();
        require(java.nio.file.Path.of(origin.toURI()).toRealPath().equals(java.nio.file.Path.of(System.getenv("EXPECTED_STARTER_UI_JAR")).toRealPath()), "Hud comes from the exact installed package JAR");
        require(StartScreen.class.getProtectionDomain().getCodeSource().getLocation().equals(origin)
                && ScoreDisplay.class.getProtectionDomain().getCodeSource().getLocation().equals(origin), "All three components come from one artifact");'''
checks['packaged-study'] = checks['composed-study'] + jar_check
checks['packaged-game'] = checks['composed-game'] + jar_check
standalone = {
    'media-demo': ('MediaDemoCheck', 'MEDIA_DEMO_OK'),
    'scrolling-game': ('ScrollingGameCheck', 'SCROLLING_GAME_OK'),
    'platform-game': ('PlatformGameCheck', 'PLATFORM_GAME_OK'),
    'level-game': ('LevelGameCheck', 'LEVEL_GAME_OK'),
    'full-game': ('FullGameCheck', 'FULL_GAME_OK'),
    'movement': ('MovementCheck', 'MOVEMENT_OK'),
    'coin-game': ('CoinGameCheck', 'COIN_GAME_OK'),
}
checks.update({kind: None for kind in standalone})
parser = argparse.ArgumentParser(description='Compile and check JavaFX examples in isolated projects.')
parser.add_argument('--only', nargs='+', choices=list(checks), help='Run only the named examples.')
parser.add_argument('--starter-ui-repository', type=Path, help='Isolated Maven local cache with the locally installed starter-ui prototype; required for packaged consumers.')
parser.add_argument('--hub-library-id', help='Explicit hub library ID for packaged study/game dogfood checks.')
parser.add_argument('--hub-library-version', help='Exact hub library version.')
parser.add_argument('--hub-repository-url', help='Explicit HTTPS or loopback Maven hub repository.')
parser.add_argument('--maven-settings', type=Path, help='Optional explicit Maven settings for isolated maintainer checks.')
args = parser.parse_args()
if any([args.hub_library_id, args.hub_library_version, args.hub_repository_url]):
    import re
    from urllib.parse import urlparse
    if not all([args.hub_library_id, args.hub_library_version, args.hub_repository_url]):
        parser.error('All three --hub-* options are required together.')
    url = urlparse(args.hub_repository_url)
    if (not re.fullmatch(r'ui[1-9a-z][0-9a-z]{0,11}', args.hub_library_id)
            or not re.fullmatch(r'(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})', args.hub_library_version)
            or url.username or url.password or url.query or url.fragment or url.path != '/api/hub/maven'
            or not (url.scheme == 'https' or (url.scheme == 'http' and url.hostname in ('127.0.0.1', 'localhost', '::1')))):
        parser.error('Use a reserved short ID, exact version and HTTPS/loopback /api/hub/maven URL.')
    if not args.only or any(kind not in ('packaged-study', 'packaged-game') for kind in args.only):
        parser.error('Hub proof requires explicit --only packaged-study and/or packaged-game.')
if args.maven_settings is not None:
    if not args.maven_settings.is_file():
        parser.error('--maven-settings must name an existing settings file.')
    args.maven_settings = args.maven_settings.resolve()
selected = {kind: checks[kind] for kind in args.only} if args.only else {kind: value for kind, value in checks.items() if not kind.startswith('packaged-')}
if any(kind.startswith('packaged-') for kind in selected):
    if args.starter_ui_repository is None or not args.starter_ui_repository.is_dir():
        parser.error('Packaged consumers require --starter-ui-repository with the locally installed prototype cache.')
    args.starter_ui_repository = args.starter_ui_repository.resolve()
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
    static void setDouble(Object object, String name, double value) throws Exception {
        var field = object.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.setDouble(object, value);
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
    for kind, check in selected.items():
        dest = root / kind
        shutil.copytree(source, dest, ignore=shutil.ignore_patterns('target', 'examples'))
        if kind != 'hello-world':
            for previous in (dest/'src/main/java').glob('*.java'):
                previous.unlink()
        resources = source/'examples'/kind/'resources'
        if resources.is_dir():
            shutil.copytree(resources, dest/'src/main/resources', dirs_exist_ok=True)
        for java in (source/'examples'/kind).glob('*.java'):
            shutil.copy2(java, dest/'src/main/java'/java.name)
        if kind in ('coin-game-controls', 'coin-game-component', 'composed-game', 'packaged-game'):
            for helper in ['Player.java', 'Coin.java']:
                shutil.copy2(source/'examples/coin-game'/helper, dest/'src/main/java'/helper)
        if kind in ('composed-study', 'composed-game'):
            for helper in ['StartScreen.java', 'Hud.java']:
                shutil.copy2(source/'examples/composition-shared'/helper, dest/'src/main/java'/helper)
        if kind in ('composed-study', 'packaged-study'):
            shutil.copy2(source/'examples/study/Question.java', dest/'src/main/java/Question.java')
        if kind in ('scrolling-game', 'platform-game', 'level-game', 'full-game'):
            shutil.copytree(source/'examples/media-demo/resources', dest/'src/main/resources', dirs_exist_ok=True)
        if kind in ('quiz', 'practice', 'study', 'coin-game-component', 'composed-study', 'composed-game', 'scrolling-game', 'platform-game', 'level-game', 'full-game'):
            shutil.copy2(source/'examples/shared/ScoreDisplay.java', dest/'src/main/java/ScoreDisplay.java')
        if kind in standalone:
            main_class, marker = standalone[kind]
            check_source = (source/'examples'/kind/'checks'/f'{main_class}.java').read_text()
        else:
            main_class, marker = 'ExampleCheck', 'EXAMPLE_OK ' + kind
            check_source = harness.replace('CHECK', check).replace('KIND', kind)
            if kind.startswith('packaged-'):
                namespace = f'zero.{args.hub_library_id}' if args.hub_library_id else 'zero.community.starterui'
                check_source = f'import {namespace}.*;\n' + check_source
                if args.hub_library_id:
                    main_file = dest/'src/main/java/Main.java'
                    main_file.write_text(main_file.read_text().replace('zero.community.starterui', namespace))
        (dest/'src/main/java'/f'{main_class}.java').write_text(check_source)
        wrapper = 'mvnw.cmd' if os.name == 'nt' else './mvnw'
        extra = ['-s', str(args.maven_settings), '-gs', str(args.maven_settings)] if args.maven_settings else []
        run_env = None
        if kind.startswith('packaged-'):
            pom = dest/'pom.xml'
            dependency = '<dependency><groupId>ca.codepet.zero.community</groupId><artifactId>starter-ui</artifactId><version>0.1.0-prototype.1</version></dependency>'
            if args.hub_library_id:
                dependency = f'<dependency><groupId>ca.codepet.zero.library</groupId><artifactId>{args.hub_library_id}</artifactId><version>{args.hub_library_version}</version></dependency>'
                from xml.sax.saxutils import escape
                repository = f'<repositories><repository><id>zero-hub-proof</id><url>{escape(args.hub_repository_url)}</url><snapshots><enabled>false</enabled></snapshots></repository></repositories>'
                pom.write_text(pom.read_text().replace('</project>', repository + '\n</project>'))
            pom.write_text(pom.read_text().replace('</dependencies>', dependency + '\n  </dependencies>', 1))
            extra.append(f'-Dmaven.repo.local={args.starter_ui_repository}')
            artifact = args.starter_ui_repository/'ca/codepet/zero/community/starter-ui/0.1.0-prototype.1/starter-ui-0.1.0-prototype.1.jar'
            if args.hub_library_id:
                artifact = args.starter_ui_repository/f'ca/codepet/zero/library/{args.hub_library_id}/{args.hub_library_version}/{args.hub_library_id}-{args.hub_library_version}.jar'
            if not args.hub_library_id and not artifact.is_file():
                parser.error('The starter-ui prototype JAR has not been installed in this cache.')
            run_env = dict(os.environ, EXPECTED_STARTER_UI_JAR=str(artifact))
        before = time.monotonic()
        result = subprocess.run([wrapper, *extra, '-B', f'-Dapp.mainClass={main_class}', 'clean', 'compile', 'javafx:run'],
                                cwd=dest, env=run_env, capture_output=True, text=True, timeout=60)
        if result.returncode or marker not in result.stdout:
            print(result.stdout[-5000:], result.stderr, flush=True)
            raise SystemExit(result.returncode or 1)
        print(f'{marker} ({time.monotonic() - before:.2f}s)', flush=True)
print(f'All {len(selected)} selected GUI example checks passed ({time.monotonic() - started:.2f}s). Shared source copies match.', flush=True)
