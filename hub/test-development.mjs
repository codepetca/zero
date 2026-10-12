// Trusted starter project native proof; never runs an arbitrary submission.
import assert from 'node:assert/strict';
import {mkdir,writeFile,chmod,readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {spawn} from 'node:child_process';
import {developmentFiles} from './development-files.mjs';
import {scaffoldBundle} from './service/scaffold.mjs';
const output=resolve(process.argv[2]||`.verification/hub-development-${Date.now()}`);
await mkdir(output,{recursive:false});
const bundle=scaffoldBundle({libraryId:'ui7',className:'Counter',title:'Counter'});
const files={...bundle.files,...await developmentFiles(bundle)};
for(const [path,text]of Object.entries(files)) {
  const target=resolve(output,path);await mkdir(dirname(target),{recursive:true});await writeFile(target,path==='preview.png'?Buffer.from(text,'base64'):text);
}
await chmod(resolve(output,'mvnw'),0o755);
const check=`import javafx.application.Application;
import javafx.application.Platform;
import javafx.stage.Stage;
import javafx.scene.control.Label;
public class PreviewCheck extends Application {
  public void start(Stage stage) {
    try {
      Main app=new Main();app.start(stage);
      if(!stage.isShowing())throw new AssertionError("Preview window");
      javafx.scene.Parent root=stage.getScene().getRoot();
      if(!(root.getChildrenUnmodifiable().get(0) instanceof Label label)||!label.getText().equals("Hello, Zero!"))throw new AssertionError("Editable component preview");
      System.out.println("HUB_DEVELOPMENT_OK");
    } catch(Throwable error) {error.printStackTrace();System.exit(1);}
    finally{stage.close();Platform.exit();}
  }
  public static void main(String[] args){launch(args);}
}\n`;
await writeFile(resolve(output,'src/PreviewCheck.java'),check);
const pom=resolve(output,'pom.xml');await writeFile(pom,(await readFile(pom,'utf8')).replace('<mainClass>Main</mainClass>','<mainClass>PreviewCheck</mainClass>'));
await writeFile(resolve(output,'settings.xml'),'<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0"/>\n');
const command=process.platform==='win32'?'mvnw.cmd':'./mvnw';
const result=await new Promise((res,rej)=>{const child=spawn(command,['-B','--no-transfer-progress','-s',resolve(output,'settings.xml'),'-gs',resolve(output,'settings.xml'),`-Dmaven.repo.local=${resolve(output,'cache')}`,'clean','compile','javafx:run'],{cwd:output,stdio:['ignore','pipe','pipe']});let log='';const timer=setTimeout(()=>child.kill('SIGTERM'),60000);child.stdout.on('data',b=>{log+=b;});child.stderr.on('data',b=>{log+=b;});child.on('error',rej);child.on('close',code=>{clearTimeout(timer);res({code,log});});});
await writeFile(resolve(output,'native.log'),result.log);assert.equal(result.code,0,result.log.slice(-3000));assert.match(result.log,/HUB_DEVELOPMENT_OK/);console.log(`Trusted downloaded project preview passed: ${output}`);
