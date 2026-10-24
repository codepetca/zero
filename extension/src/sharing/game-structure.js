'use strict';
// Static snapshot validation only: never resolve Maven, run Java, or execute hooks.
const {parseXml,single,value,allNodes}=require('../project-pom');
const {JAVA_RELEASE,JAVAFX_VERSION}=require('./contracts');
const SAFE_GITIGNORE='**/target/\n**/build/\n**/dist/\n*.class\n.DS_Store\n.env\n.env.*\n*.pem\n*.key\n*.p12\n*.pfx\ncredentials*\n.zero/\n.zero-sharing-recovery/\n';
const fail=message=>{throw new Error(message);};
const javaName=/^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/;
function text(files,name){const file=files.get(name);if(!file)fail('Required game file missing: '+name);return Buffer.from(file.data??file.bytes).toString('utf8');}
function license(files,name){const body=text(files,name);if(body.trim().length<40||body.includes('\0'))fail('Include the applicable readable license file: '+name);}
function declaration(input){return input.replace(/\\u+([a-fA-F0-9]{4})/g,(_,hex)=>String.fromCharCode(parseInt(hex,16))).replace(/\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,' ');}
function validatePom(input,{mainClass,requireJavafx=false}={}) {
  const project=parseXml(input),properties=single(project,'properties');
  const nodes=allNodes(project);
  if(nodes.some(node=>['parent','profiles','extensions','systemPath'].includes(node.name)))fail('Use the ordinary game POM without parent, profile, build-extension or system-path hooks');
  if(properties.children.length>128)fail('Game POM property count exceeds the supported limit');
  const values=new Map(properties.children.map(node=>[node.name,value(node)]));
  if(values.size!==properties.children.length)fail('Game POM properties must be unique');
  // Candidate properties are a bounded data graph, not a recursive template
  // engine. Memoize each node and reject before concatenating oversized output.
  const memo=new Map(),active=new Set();let work=0;
  function charge(amount){work+=amount;if(work>262144)fail('Game POM property expansion exceeds the supported total work limit');}
  function property(key,depth){
    if(depth>32)fail('Game POM property expansion exceeds the supported depth');
    if(!values.has(key)||active.has(key))fail('Game POM uses an unresolved or cyclic property');
    if(memo.has(key)){const result=memo.get(key);if(depth+result.height>32)fail('Game POM property expansion exceeds the supported depth');return result;}
    active.add(key);const result=expand(values.get(key),depth);active.delete(key);memo.set(key,result);return result;
  }
  function expand(input,depth=0) {
    if(Buffer.byteLength(input)>4096)fail('Game POM property value exceeds the supported expansion limit');
    charge(input.length);
    const chunks=[];let size=0,offset=0,height=0;
    function append(chunk){const bytes=Buffer.byteLength(chunk);if(size+bytes>4096)fail('Game POM property value exceeds the supported expansion limit');charge(chunk.length);size+=bytes;chunks.push(chunk);}
    for(const match of input.matchAll(/\$\{([^}]+)\}/g)){append(input.slice(offset,match.index));const result=property(match[1],depth+1);append(result.value);height=Math.max(height,result.height+1);offset=match.index+match[0].length;}
    if(depth+height>32)fail('Game POM property expansion exceeds the supported depth');
    append(input.slice(offset));return {value:chunks.join(''),height};
  }
  const resolve=input=>expand(input).value;
  for(const key of values.keys())property(key,0);
  if(resolve(value(single(properties,'maven.compiler.release')))!==JAVA_RELEASE)fail('Game POM must target Java '+JAVA_RELEASE);
  if(value(single(project,'modelVersion'))!=='4.0.0'||!value(single(project,'groupId'))||!value(single(project,'artifactId'))||!value(single(project,'version')))fail('Game POM must have ordinary project coordinates');
  const dependencies=allNodes(project).filter(node=>node.name==='dependency');
  const plugins=allNodes(project).filter(node=>node.name==='plugin');
  for(const node of [...dependencies,...plugins]) {
    if(node.name==='dependency'&&value(single(node,'scope',true)||{children:[],text:''})==='import')fail('External Maven BOM imports are outside the ordinary game snapshot policy');
    const version=resolve(value(single(node,'version')));
    if(!/^[0-9][A-Za-z0-9._-]*$/.test(version)||/SNAPSHOT/i.test(version))fail('Pin every external game dependency and plugin to an exact release');
    if(node.name==='dependency'&&resolve(value(single(node,'groupId')))==='org.openjfx'&&version!==JAVAFX_VERSION)fail('Game JavaFX dependencies must use '+JAVAFX_VERSION);
  }
  if(requireJavafx) {
    if(!dependencies.some(node=>resolve(value(single(node,'groupId')))==='org.openjfx'&&value(single(node,'artifactId'))==='javafx-controls'))fail('Game POM must include the pinned JavaFX controls dependency');
    const plugin=plugins.find(node=>value(single(node,'artifactId'))==='javafx-maven-plugin'&&value(single(node,'groupId'))==='org.openjfx');
    if(!plugin||resolve(value(single(single(plugin,'configuration'),'mainClass')))!==mainClass)fail('Game POM main class must match zero.json');
  }
  return project;
}
function validateGameStructure(input) {
  const files=new Map(input.map(file=>[file.path,file]));
  let marker;try{marker=JSON.parse(text(files,'zero.json'));}catch{fail('Game zero.json must be valid JSON');}
  if(!marker||typeof marker!=='object'||Array.isArray(marker)||Object.keys(marker).some(key=>!['name','templateVersion','mainClass'].includes(key))||typeof marker.name!=='string'||!marker.name.trim()||marker.name.length>120||!javaName.test(marker.mainClass||''))fail('Game zero.json must identify its ordinary Java main class');
  const simple=marker.mainClass.split('.').at(-1),main=declaration(text(files,'src/main/java/'+marker.mainClass.replaceAll('.','/')+'.java'));
  if(!new RegExp('\\bpublic\\s+(?:final\\s+)?class\\s+'+simple+'\\b').test(main)||!/\bpublic\s+static\s+void\s+main\s*\(\s*String\s*(?:\[\s*\]\s+[A-Za-z_$][\w$]*|\.\.\.\s+[A-Za-z_$][\w$]*)\s*\)/.test(main))fail('Game main class must declare an ordinary public Java main method');
  const declaredPackage=/\bpackage\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*;/.exec(main)?.[1]||'';
  if(declaredPackage!==marker.mainClass.split('.').slice(0,-1).join('.'))fail('Game main package must match zero.json');
  for(const name of ['App','GameApp']) {
    const source=declaration(text(files,'src/main/java/zero/'+name+'.java'));
    if(!/\bpackage\s+zero\s*;/.test(source)||!new RegExp('\\bclass\\s+'+name+'\\b').test(source))fail('Game snapshot must include readable Zero framework source');
  }
  validatePom(text(files,'pom.xml'),{mainClass:marker.mainClass,requireJavafx:true});
  license(files,'LICENSE');license(files,'.mvn/wrapper/LICENSE-APACHE-2.0.txt');license(files,'.mvn/wrapper/NOTICE');
  for(const [name,file]of files)if(/^libraries\/[^/]+\/zero-library\.json$/.test(name)) {
    const folder=name.slice(0,name.lastIndexOf('/'));
    license(files,folder+'/LICENSE');validatePom(text(files,folder+'/pom.xml'));
  }
  if(files.has('.gitignore')) {
    const ignore=text(files,'.gitignore');
    if(ignore.includes('\0')||ignore.split(/\r?\n/).some(line=>line.trim().startsWith('!')))fail('Shared game .gitignore may not unignore private or generated files');
  }
  return {mainClass:marker.mainClass};
}
module.exports={validateGameStructure,validatePom,SAFE_GITIGNORE};
