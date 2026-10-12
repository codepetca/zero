// Coordinator-owned dogfood fixture: ordinary bundled components, no core changes.
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {scaffoldBundle} from '../service/scaffold.mjs';
const root=fileURLToPath(new URL('../../libraries/starter-ui/',import.meta.url));
export async function starterUiBundle(libraryId='ui1') {
  const base=scaffoldBundle({libraryId,className:'ScoreDisplay',title:'Starter UI'});
  const names=['StartScreen','Hud','ScoreDisplay'];
  base.descriptor={schema:1,libraryId,version:'0.1.0',title:'Starter UI',description:'Welcome screen, HUD and score display. App code owns the rules.',category:'ui',components:[
    {className:'StartScreen',description:'A welcome view with an app-owned Start action.',api:['StartScreen(String title, String instructions, Runnable onStart)','Node view()'],usage:'StartScreen welcome = new StartScreen("Quiz", "Try a question", this::startQuiz);\nroot.getChildren().add(welcome.view());'},
    {className:'Hud',description:'A score, message and app-owned Restart action.',api:['Hud(Runnable onRestart)','Node view()','void setScore(int score)','void setMessage(String message)'],usage:'Hud hud = new Hud(this::restart);\nhud.setScore(5);\nroot.getChildren().add(hud.view());'},
    {className:'ScoreDisplay',description:'An explicitly updated score label.',api:['ScoreDisplay()','ScoreDisplay(String caption)','Node view()','void setScore(int score)'],usage:'ScoreDisplay score = new ScoreDisplay();\nscore.setScore(5);\nroot.getChildren().add(score.view());'}
  ]};
  const files={...base.files};
  delete files[`src/zero/${libraryId}/ScoreDisplay.java`];
  for(const name of names)files[`src/zero/${libraryId}/${name}.java`]=(await readFile(join(root,`src/main/java/zero/starterui/${name}.java`),'utf8')).replaceAll('zero.starterui',`zero.${libraryId}`);
  files['checks/BehaviorCheck.java']=(await readFile(join(root,'checks/StarterUiCheck.java'),'utf8')).replaceAll('zero.starterui',`zero.${libraryId}`).replaceAll('StarterUiCheck','BehaviorCheck').replace('System.getenv("EXPECTED_STARTER_UI_JAR")','"/input/library.jar"');
  for(const [key,score,title] of [['first',3,'Study app'],['second',10,'Coin game']])files[`examples/${key}/Main.java`]=`import javafx.application.Application;
import javafx.application.Platform;
import javafx.scene.Scene;
import javafx.scene.Node;
import javafx.scene.Parent;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.VBox;
import javafx.stage.Stage;
import zero.${libraryId}.StartScreen;
import zero.${libraryId}.Hud;

public class Main extends Application {
    private int score;
    private Hud hud;
    private Button button(Node n, String text) {
        if (n instanceof Button b && b.getText().equals(text)) return b;
        if (n instanceof Parent p) for (Node child : p.getChildrenUnmodifiable()) {
            Button b = button(child, text); if (b != null) return b;
        }
        return null;
    }
    public void start(Stage stage) {
        hud = new Hud(this::reset);
        StartScreen welcome = new StartScreen("${title}", "Start, score, restart", this::play);
        stage.setScene(new Scene(new VBox(welcome.view(), hud.view()), 500, 300));
        stage.show();
        button(welcome.view(), "Start").fire();
        if (score != ${score}) throw new AssertionError("App owns score updates");
        button(hud.view(), "Restart").fire();
        if (score != 0) throw new AssertionError("App owns reset");
        Platform.runLater(() -> {stage.close(); Platform.exit();});
    }
    private void play() { score = ${score}; hud.setScore(score); hud.setMessage("Done"); }
    private void reset() { score = 0; hud.setScore(score); hud.setMessage("Ready"); }
    public static void main(String[] args) {launch(args);}
}\n`;
  files['LICENSE']=await readFile(join(root,'LICENSE'),'utf8');
  files['API.md']=(await readFile(join(root,'API.md'),'utf8')).replaceAll('zero.starterui',`zero.${libraryId}`);
  files['CHANGELOG.md']='# Changelog\n\n## 0.1.0\n\nFirst local hub dogfood release. Namespace assigned by the hub.\n';
  // Initial fixture preview is explicitly illustrative; integration may replace it
  // with an actual native JavaFX snapshot before submitting.
  return {descriptor:base.descriptor,files};
}
