// Trusted local development files never enter a submitted build policy.
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {validateBundle} from './checker/policy.mjs';
export const developmentPaths = ['pom.xml','mvnw','mvnw.cmd','.mvn/wrapper/maven-wrapper.properties',
  'src/Main.java','zero.json','.vscode/tasks.json','.vscode/settings.json'];
// Literal URLs let Next trace each distinct trusted asset into its server build.
// A dynamic URL can be rewritten to the same asset for all three wrapper files.
const wrapperSources = {
  'mvnw':new URL('../student-template/mvnw',import.meta.url),
  'mvnw.cmd':new URL('../student-template/mvnw.cmd',import.meta.url),
  '.mvn/wrapper/maven-wrapper.properties':new URL('../student-template/.mvn/wrapper/maven-wrapper.properties',import.meta.url),
};
export async function developmentFiles(bundle) {
  validateBundle(bundle);
  const {libraryId:id,components}=bundle.descriptor;
  const name=components[0].className;
  const files={};
  for(const [path,url]of Object.entries(wrapperSources))
    files[path]=await readFile(fileURLToPath(url),'utf8');
  files['pom.xml']=`<project xmlns="http://maven.apache.org/POM/4.0.0"><modelVersion>4.0.0</modelVersion>
<groupId>school.zero</groupId><artifactId>${id}-preview</artifactId><version>1.0</version>
<properties><maven.compiler.release>17</maven.compiler.release><javafx.version>21.0.12</javafx.version><project.build.sourceEncoding>UTF-8</project.build.sourceEncoding></properties>
<dependencies><dependency><groupId>org.openjfx</groupId><artifactId>javafx-controls</artifactId><version>21.0.12</version></dependency></dependencies>
<build><sourceDirectory>src</sourceDirectory><plugins><plugin><groupId>org.apache.maven.plugins</groupId><artifactId>maven-compiler-plugin</artifactId><version>3.14.0</version></plugin>
<plugin><groupId>org.openjfx</groupId><artifactId>javafx-maven-plugin</artifactId><version>0.0.8</version><configuration><mainClass>Main</mainClass></configuration></plugin></plugins></build></project>\n`;
  files['src/Main.java']=`import javafx.application.Application;
import javafx.scene.Scene;
import javafx.stage.Stage;
import zero.${id}.${name};

// This editable local preview stays outside the uploaded library/checks.
public class Main extends Application {
    public void start(Stage stage) {
        ${name} component = new ${name}();
        component.setValue("Hello, Zero!");
        stage.setScene(new Scene(new javafx.scene.layout.StackPane(component.view()), 480, 240));
        stage.setTitle("${name} preview");
        stage.show();
    }
    public static void main(String[] args) { launch(args); }
}\n`;
  files['zero.json']=JSON.stringify({name:`${id} library preview`},null,2)+'\n';
  files['.vscode/tasks.json']=JSON.stringify({version:'2.0.0',tasks:[{label:'Run App',type:'zero',task:'run',group:{kind:'build',isDefault:true},problemMatcher:'$zero-java'}]},null,2)+'\n';
  files['.vscode/settings.json']=JSON.stringify({'files.autoSave':'afterDelay','files.autoSaveDelay':500,'java.configuration.updateBuildConfiguration':'automatic'},null,2)+'\n';
  return files;
}
