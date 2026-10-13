// Trusted local development files never enter a submitted build policy.
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {validateBundle} from './checker/policy.mjs';
export const developmentPaths = ['README.md','pom.xml','mvnw','mvnw.cmd','.mvn/wrapper/maven-wrapper.properties',
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
  files['README.md']=`# ${id}: your editable library

1. Extract this ZIP. Open this folder in VS Code with Zero and choose Run App.
   The preview uses your ordinary Java class in src/zero/${id}/${name}.java.
2. Edit the class and src/Main.java to try it. Keep API.md, CHANGELOG.md,
   checks/BehaviorCheck.java and both examples up to date. Keep preview.png a PNG.
3. Visit https://zero.codepet.ca/hub/prepare, sign in, choose this same folder and
   Upload for checks. You do not need to prepare a new library each time.
4. Read the result. Fix an unpublished failed version and choose the same folder
   again. After publication, change the version in .zero-library.json for fixes.
   Save the result link on the website to return to your submission.

Keep .zero-library.json: it records the library ID, version and component API.
For another class, add its source under src/zero/${id}/ and its component entry
in that descriptor. The downloaded reservation belongs to its GitHub account.

Run App is an editable preview. It does not run the uploaded behavior check or
both consumer examples; those are checked by the hub before publication.

Only the descriptor, declared library classes, API/changelog/license, PNG,
behavior check and examples are uploaded. README.md, preview Main, Maven/editor
files, target and .git stay local. Do not upload the ZIP itself.

Use the exact dependency and Java import on your published component card to
reuse it in an app. Updating another version does not change existing apps.

Public uploads may still be closed while ZeroHub's hosting is being completed.
`;
  files['zero.json']=JSON.stringify({name:`${id} library preview`},null,2)+'\n';
  files['.vscode/tasks.json']=JSON.stringify({version:'2.0.0',tasks:[{label:'Run App',type:'zero',task:'run',group:{kind:'build',isDefault:true},problemMatcher:'$zero-java'}]},null,2)+'\n';
  files['.vscode/settings.json']=JSON.stringify({'files.autoSave':'afterDelay','files.autoSaveDelay':500,'java.configuration.updateBuildConfiguration':'automatic'},null,2)+'\n';
  return files;
}
