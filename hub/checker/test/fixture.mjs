import { deflateSync } from 'node:zlib';
import { MIT_BODY } from '../runner.mjs';
function crc32(data) {let c=0xffffffff;for(const byte of data){c^=byte;for(let i=0;i<8;i++)c=(c>>>1)^(0xedb88320&-(c&1));}return(c^0xffffffff)>>>0;}
function chunk(name,data) {const type=Buffer.from(name),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([type,data])));return Buffer.concat([size,type,data,crc]);}
export function preview() {const header=Buffer.alloc(13);header.writeUInt32BE(1,0);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from([0,40,140,200,255]))),chunk('IEND',Buffer.alloc(0))]).toString('base64');}
export function fixture() {
 return {descriptor:{schema:1,libraryId:'ui1',version:'0.1.0',title:'Simple Label',description:'An ordinary label with explicit updates.',category:'ui',components:[{className:'Display',description:'Displays a value.',api:['public Node view()','public void setValue(String value)'],usage:'Display display = new Display(); display.setValue("Ready");'}]},files:{
 'src/zero/ui1/Display.java':'package zero.ui1;\nimport javafx.scene.Node;\nimport javafx.scene.control.Label;\npublic class Display { private final Label label = new Label("Ready"); public Node view() { return label; } public void setValue(String value) { label.setText(value); } }\n',
 'checks/BehaviorCheck.java':'import javafx.application.Application;\nimport javafx.application.Platform;\nimport javafx.scene.control.Label;\nimport javafx.stage.Stage;\nimport zero.ui1.Display;\npublic class BehaviorCheck extends Application { public void start(Stage stage) { Display value = new Display(); value.setValue("Changed"); if (!((Label)value.view()).getText().equals("Changed")) throw new AssertionError("Value update"); Platform.exit(); } }\n',
 'examples/first/Main.java':example('First'),
 'examples/second/Main.java':example('Second'),
 'API.md':'Display exposes a view and a setValue method.\n','CHANGELOG.md':'0.1.0 — First version.\n','LICENSE':'MIT License\n\nCopyright (c) 2026 Codepet\n\n'+MIT_BODY,'preview.png':preview()}};
}
function example(value) {return `import javafx.application.Application;\nimport javafx.application.Platform;\nimport javafx.scene.Scene;\nimport javafx.scene.layout.VBox;\nimport javafx.stage.Stage;\nimport zero.ui1.Display;\npublic class Main extends Application { public void start(Stage stage) { Display display = new Display(); display.setValue("${value}"); stage.setScene(new Scene(new VBox(display.view()), 200, 100)); stage.show(); Platform.runLater(() -> { stage.close(); Platform.exit(); }); } }\n`;}
