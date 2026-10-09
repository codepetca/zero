// Maintainer dogfood: actual Maven builds from the same plans used by the editor.
import {mkdtemp, mkdir, cp, readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {processSpecification} from './workshop-process.mjs';
const require = createRequire(import.meta.url);
const components = require('../extension/src/components.js');
const root = fileURLToPath(new URL('../',import.meta.url));
const generated = path.join(root,'.verification');
await mkdir(generated,{recursive:true});
const directory = await mkdtemp(path.join(generated,'component consumer with spaces '));
const app = path.join(directory,'app');
await cp(path.join(root,'student-template'),app,{recursive:true,filter:filename=>!filename.split(path.sep).includes('target')});
const source = await readFile(path.join(root,'extension/media/component-example/Main.java'));
await writeFile(path.join(app,'src/main/java/Main.java'),source);
const harness = `import javafx.application.*;
import javafx.stage.Stage;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import zero.community.HealthBar;
public class ComponentCheck extends Application {
  public void start(Stage stage) {
    try {
      Main app = new Main(); app.start(stage);
      VBox layout = (VBox) ((BorderPane) stage.getScene().getRoot()).getCenter();
      HBox buttons = (HBox) layout.getChildren().get(1);
      ((Button) buttons.getChildren().get(0)).fire();
      VBox meter = (VBox) layout.getChildren().get(0);
      if (!((Label)meter.getChildren().get(0)).getText().equals("Health: 75 / 100")) throw new AssertionError("Explicit app update");
      double expected = System.getProperty("proof.version").equals("0.1.1") ? .75 : 0;
      if (((ProgressBar)meter.getChildren().get(1)).getProgress() != expected) throw new AssertionError("Compatible fix/revert");
      String origin = HealthBar.class.getProtectionDomain().getCodeSource().getLocation().toString();
      if (!origin.endsWith("zero-community-"+System.getProperty("proof.version")+".jar")) throw new AssertionError(origin);
      ((Button) buttons.getChildren().get(2)).fire();
      if (((ProgressBar)meter.getChildren().get(1)).getProgress() != 1) throw new AssertionError("Reset");
      app.stop(); stage.close(); Platform.exit();
      System.out.println("COMPONENT_CONSUMER_PASS " + origin);
    } catch (Throwable e) {e.printStackTrace(); System.exit(1);}
  }
  public static void main(String[] args) {launch(args);}
}`;
await writeFile(path.join(app,'src/main/java/ComponentCheck.java'),harness);
let pom = await readFile(path.join(app,'pom.xml'),'utf8');
// Fixed harness options, independent of the version-management edit.
pom = pom.replace('<app.mainClass>Main</app.mainClass>','<app.mainClass>ComponentCheck</app.mainClass>');
pom = pom.replace('<mainClass>${app.mainClass}</mainClass>','<mainClass>${app.mainClass}</mainClass><options><option>-Dproof.version=${proof.version}</option></options>');
await writeFile(path.join(app,'pom.xml'),pom);
const catalog = await components.loadCatalog(path.join(generated,'component-catalog.json'));
const cache = path.join(directory,'cache');
// Reuse only third-party cache downloads; remove the tested coordinates first.
await cp(path.join(root,'../zero-community/.proof/cache'),cache,{recursive:true,filter:filename=>!filename.includes(path.join('school','zero','community'))});
const settings = path.join(generated,'component-settings.xml');
const receipts=[];
for (const [operation,version] of [['add','0.1.0'],['update','0.1.1'],['revert','0.1.0']]) {
  const plan = await components.prepareChange(app,catalog,operation==='revert'?null:version,{operation});
  await components.validatePrepared(plan,catalog);
  await writeFile(plan.pomPath,plan.afterText); // CLI proof; editor uses a native version-checked edit.
  assert.deepEqual(await readFile(path.join(app,'src/main/java/Main.java')),source);
  const args=['-B','--no-transfer-progress','-q','-s',settings,'-gs',settings,`-Dmaven.repo.local=${cache}`,`-Dproof.version=${version}`,'clean','compile','javafx:run'];
  const spec=processSpecification(path.join(app,process.platform==='win32'?'mvnw.cmd':'mvnw'),args);
  const result=spawnSync(spec.command,spec.args,{cwd:app,encoding:'utf8',timeout:180000});
  if(result.status!==0 || !result.stdout?.includes('COMPONENT_CONSUMER_PASS')) throw new Error(result.stdout+'\n'+result.stderr);
  const artifact=catalog.catalog.releases.find(item=>item.version===version).artifacts.jar;
  const bytes=await readFile(path.join(cache,artifact.path));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),artifact.sha256);
  receipts.push({operation,version,jarSha256:artifact.sha256,sourcePreserved:true});
  console.log(`Actual editor-plan Maven consumer ${operation} ${version}: passed.`);
}
await writeFile(path.join(generated,'component-consumer-receipt.json'),JSON.stringify({app,checks:receipts,scope:'macOS finite synthetic JavaFX; no native editor interaction or publication'},null,2)+'\n');
