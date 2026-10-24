'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {zipSync}=require('fflate');
const core=require('../src/core-contract');
const {previewExtraction,previewMode,applyPlan}=require('../src/sharing/authoring');
const {prepareLocalCheck,runLocalCheck,disposeLocalCheck}=require('../src/sharing/local-check');
const repository={id:'12345',ownerId:'123',owner:'student',name:'game',url:'https://github.com/student/game'};
async function fixture(t) {
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-core-check-test-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const sources={};for(const name of core.coreSourcePaths){sources[name]=await fs.readFile(path.resolve(__dirname,'../../framework',name));await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),sources[name]);}
 const record=core.makeCoreRecord(sources);await fs.writeFile(path.join(root,'zero-core.json'),JSON.stringify(record,null,2)+'\n');
 await fs.cp(path.resolve(__dirname,'../../student-template/.mvn'),path.join(root,'.mvn'),{recursive:true});await fs.writeFile(path.join(root,'zero.json'),'{}');for(const name of ['pom.xml','mvnw','mvnw.cmd'])await fs.copyFile(path.resolve(__dirname,'../../student-template',name),path.join(root,name));
 await fs.writeFile(path.join(root,'src/main/java/Main.java'),'public class Main {}\n');
 await fs.writeFile(path.join(root,'src/main/java/ScoreView.java'),'import zero.ui.Element; public interface ScoreView { Element view(); void setScore(int score); }\n');
 await fs.writeFile(path.join(root,'src/main/java/ScoreDisplay.java'),'import zero.ui.Element; import zero.ui.Label; public final class ScoreDisplay implements ScoreView { private final Label label=new Label("Score: 0"); public Element view(){return label;} public void setScore(int score){label.setText("Score: "+score);} }\n');
 const descriptor={schema:2,kind:'library',slug:'scores',version:'1.0.0',title:'Scores',description:'An ordinary Zero component.',license:'MIT',libraryKind:'widget',coreRequirement:{minVersion:'0.3.0',maxExclusive:'0.4.0'},coreInput:{version:'0.3.0',sourceSha256:record.sourceSha256}};
 const options={repository,descriptor,sources:['src/main/java/ScoreView.java','src/main/java/ScoreDisplay.java']};
 return {root,record,options};
}
async function authored(t){const f=await fixture(t);await applyPlan(await previewExtraction(f.root,f.options));const folder=path.join(f.root,'libraries/scores');for(const [dir,name]of [['src/test/java','LibraryCheck'],['examples/first','FirstExample'],['examples/second','SecondExample']])await fs.writeFile(path.join(folder,dir,name+'.java'),`public class ${name} { public static void main(String[] args) {} }\n`);return f;}
function jar(entries){return Buffer.from(zipSync(Object.fromEntries(Object.entries(entries).map(([p,b])=>[p,Buffer.from(b)])),{level:0}));}
async function artifacts(plan,{foreign=false}={}){
 await fs.mkdir(path.dirname(plan.jar),{recursive:true});await fs.mkdir(path.dirname(plan.coreJar),{recursive:true});
 await fs.writeFile(plan.jar,jar({'zero/contrib/r12345/scores/ScoreView.class':'interface','zero/contrib/r12345/scores/ScoreDisplay.class':'class',...(foreign?{'zero/ui/Element.class':'shadow'}:{})}));
 await fs.writeFile(plan.sourcesJar,jar({'zero/contrib/r12345/scores/ScoreView.java':'interface ScoreView {}','zero/contrib/r12345/scores/ScoreDisplay.java':'class ScoreDisplay {}'}));
 await fs.writeFile(plan.coreJar,jar(Object.fromEntries(plan.coreClasses.map(n=>[n.replaceAll('.','/')+'.class','reviewed-test-class']))));
}
test('schema2 authoring validates core before mutation and snapshots raw record through apply',async t=>{
 const {root,options}=await fixture(t);const original=await fs.readFile(path.join(root,'pom.xml'),'utf8');
 await assert.rejects(previewExtraction(root,{...options,descriptor:{...options.descriptor,coreInput:{version:'0.3.0',sourceSha256:'a'.repeat(64)}}}),/coreInput/);
 assert.equal(await fs.readFile(path.join(root,'pom.xml'),'utf8'),original);await assert.rejects(fs.access(path.join(root,'libraries')));
 const plan=await previewExtraction(root,options);await fs.appendFile(path.join(root,'zero-core.json'),' ');await assert.rejects(applyPlan(plan),/core changed after preview/);await fs.access(path.join(root,'src/main/java/ScoreDisplay.java'));
});
test('published authored mode checks semantic bounds while local mode requires exact author coreInput',async t=>{
 const {root,options}=await authored(t),filename=path.join(root,'libraries/scores/zero-library.json');
 await fs.writeFile(filename,JSON.stringify({...options.descriptor,coreInput:{version:'0.3.0',sourceSha256:'a'.repeat(64)}}));
 const contracts=require('../src/sharing/contracts'),identity=contracts.identity('library',repository.id,'scores');
 const publishedRelease={schema:2,kind:'library',id:identity.id,slug:'scores',version:'1.0.0',title:'Scores',description:'An ordinary Zero component.',license:'MIT',repository,contributor:{githubId:repository.ownerId,login:repository.owner},source:{commit:'a'.repeat(40),folder:'libraries/scores',sha256:'b'.repeat(64)},policyRevision:'c'.repeat(40),status:'available',namespace:identity.namespace,coordinate:{...identity.coordinate,version:'1.0.0'},libraryKind:'widget',coreRequirement:options.descriptor.coreRequirement,coreBuild:{...options.descriptor.coreInput,jarSha256:'d'.repeat(64),buildRecipeSha256:'e'.repeat(64),javaRelease:'17',javafxVersion:'21.0.12'},artifacts:{}};
 for(const kind of ['jar','sources','pom']){const artifactPath=contracts.artifactPath(identity,'1.0.0',kind);publishedRelease.artifacts[kind]={path:artifactPath,url:'https://artifacts.example.com/'+artifactPath,size:1,sha256:'f'.repeat(64)};}
 const published=await previewMode(root,{slug:'scores',mode:'published',version:'1.0.0',publishedRelease});assert.ok(published.coreSnapshot.length===core.coreSourcePaths.length+1);await applyPlan(published);
 await assert.rejects(previewMode(root,{slug:'scores',mode:'local'}),/coreInput/);await assert.rejects(prepareLocalCheck(root,'scores'),/coreInput/);
});
test('core-dependent Check stages only exact core and contribution inputs, fixes reactor order and emits sanitized provenance',async t=>{
 const {root}=await authored(t),plan=await prepareLocalCheck(root,'scores');t.after(()=>disposeLocalCheck(plan));
 const rootPom=await fs.readFile(plan.pom,'utf8'),libPom=await fs.readFile(path.join(plan.temp,'library/pom.xml'),'utf8');
 assert.equal(plan.maven.cwd,plan.temp);if(process.platform!=='win32')assert.equal(plan.maven.command,path.join(plan.temp,'mvnw'));else assert.ok(plan.maven.args.at(-1).includes(path.join(plan.temp,'mvnw.cmd')));assert.match(rootPom,/<modules><module>core<\/module><module>library<\/module><\/modules>/);assert.doesNotMatch(libPom,/<parent>|systemPath|build-helper|src\/main\/java\/Main/);assert.match(libPom,/<scope>provided<\/scope>/);assert.match(libPom,/<proc>none<\/proc>/);assert.match(libPom,/<addMavenDescriptor>false/);
 assert.equal(await fs.readFile(plan.stagedChecks[plan.input.checks[0]],'utf8'),await fs.readFile(path.join(root,plan.input.checks[0]),'utf8'));await assert.rejects(fs.access(path.join(plan.temp,'core/src/main/java/Main.java')));
 const calls=[];const runner=async spec=>{calls.push(spec);if(calls.length===1){assert.ok(spec.args.includes('package'));assert.ok(!spec.args.some(s=>s.includes('build-classpath')));await artifacts(plan);}if(calls.length===2){assert.equal(spec.args[spec.args.indexOf('-f')+1],plan.corePom);await fs.writeFile(plan.classpathFile,'/trusted/javafx.jar');}if(spec.command.endsWith('javac')&&!spec.args.includes('-version')){assert.ok(spec.args.includes('-proc:none'));assert.ok(spec.args[spec.args.indexOf('-cp')+1].includes(plan.coreJar));assert.ok(plan.input.checks.every(p=>spec.args.includes(plan.stagedChecks[p])&&!spec.args.includes(path.join(root,p))));}return {code:0,output:spec.args.includes('-version')?'test JDK version':'fixed command passed'};};
 const result=await runLocalCheck(plan,{runner,keepFiles:true});assert.equal(calls.length,6);assert.ok(calls.at(-1).args.includes('--core'));assert.equal(result.coreBuild.sourceSha256,plan.coreRecord.sourceSha256);assert.equal(result.coreBuild.jarSha256,result.coreJar.sha256);assert.equal(result.provenance.toolVersions.java,'test JDK version');
 const artifactPom=await fs.readFile(result.artifactPom.path,'utf8');assert.doesNotMatch(artifactPom,/<build>|<parent>|systemPath|zero-library-check-/);for(const field of ['minVersion','maxExclusive','version','sourceSha256','jarSha256','buildRecipeSha256','javaRelease','javafxVersion'])assert.ok(artifactPom.includes('<zero.core.'+field+'>'));
});
test('core source, record, inventory and staged drift stop every next command; core-shadow checks never run',async t=>{
 for(const scenario of ['source','record','inventory','staged']){
  const {root}=await authored(t),plan=await prepareLocalCheck(root,'scores');let calls=0;
  const runner=async()=>{calls++;if(scenario==='source')await fs.appendFile(path.join(root,core.coreSourcePaths[0]),'// changed\n');if(scenario==='record')await fs.appendFile(path.join(root,'zero-core.json'),' ');if(scenario==='inventory')await fs.writeFile(path.join(root,'src/main/java/zero/Added.java'),'package zero; class Added {}');if(scenario==='staged')await fs.appendFile(plan.stagedChecks[plan.input.checks[0]],'// changed\n');return {code:0,output:''};};
  await assert.rejects(runLocalCheck(plan,{runner}),/changed|differs/);assert.equal(calls,1);await assert.rejects(fs.access(plan.temp));
 }
 const {root}=await authored(t);await fs.writeFile(path.join(root,'libraries/scores/src/test/java/LibraryCheck.java'),'package zero.ui; public class LibraryCheck {public static void main(String[] args){}}');await assert.rejects(prepareLocalCheck(root,'scores'),/shadows the Zero core/);
});
test('foreign core packaged into contribution is rejected before check compilation',async t=>{
 const {root}=await authored(t),plan=await prepareLocalCheck(root,'scores');let calls=0;
 await assert.rejects(runLocalCheck(plan,{runner:async()=>{calls++;if(calls===1)await artifacts(plan,{foreign:true});else await fs.writeFile(plan.classpathFile,'/trusted/javafx.jar');return {code:0,output:''};}}),/outside/);assert.equal(calls,2);
});

test('transient second reads cannot substitute staged wrapper or library/check/resource/descriptor bytes',async t=>{
 for(const scenario of ['wrapper','source','check','resource','descriptor']){
  const {root}=await authored(t),wrapperName=process.platform==='win32'?'mvnw.cmd':'mvnw';
  const files={wrapper:wrapperName,source:'libraries/scores/src/main/java/zero/contrib/r12345/scores/ScoreDisplay.java',check:'libraries/scores/src/test/java/LibraryCheck.java',resource:'libraries/scores/src/main/resources/zero/contrib/r12345/scores/data.txt',descriptor:'libraries/scores/zero-library.json'};
  if(scenario==='resource'){await fs.mkdir(path.dirname(path.join(root,files.resource)),{recursive:true});await fs.writeFile(path.join(root,files.resource),'reviewed resource');}
  const target=path.join(root,files[scenario]),originalRead=fs.readFile,original=await originalRead(target);let rawReads=0,runnerCalls=0;
  fs.readFile=async function(filename,...args){const bytes=await originalRead.call(this,filename,...args);if(path.resolve(String(filename))===target&&!args.length&&++rawReads===2)return Buffer.concat([Buffer.from(bytes),Buffer.from('\ntransient substituted bytes\n')]);return bytes;};
  try {
   await assert.rejects(async()=>{const plan=await prepareLocalCheck(root,'scores');await runLocalCheck(plan,{runner:async()=>{runnerCalls++;throw Error('An unverified staged input reached the runner.');}});},/changed while preparing Check/);
  } finally {fs.readFile=originalRead;}
  assert.equal(runnerCalls,0,scenario);assert.equal(rawReads,2,scenario);assert.deepEqual(await fs.readFile(target),original,scenario);
 }
});
test('CRLF wrapper properties pin and stage as LF while raw checkout drift still blocks execution',async t=>{
 const {root}=await authored(t),name='.mvn/wrapper/maven-wrapper.properties',filename=path.join(root,name);
 const lf=core.normalizeSource(await fs.readFile(filename));await fs.writeFile(filename,lf.replaceAll('\n','\r\n'));
 const plan=await prepareLocalCheck(root,'scores');assert.equal(await fs.readFile(path.join(plan.temp,name),'utf8'),lf);
 assert.equal(plan.toolSnapshot.find(item=>item.path===name).sha256,require('../src/sharing/authoring').hash(Buffer.from(lf.replaceAll('\n','\r\n'))));
 await fs.writeFile(filename,lf);let calls=0;
 await assert.rejects(runLocalCheck(plan,{runner:async()=>{calls++;throw Error('Unexpected command.');}}),/Maven wrapper changed/);assert.equal(calls,0);await assert.rejects(fs.access(plan.temp));
 for(const bad of [Buffer.from('\ufeff'+lf),Buffer.from(lf.replace('\n','\r')),Buffer.from([0xc3,0x28])]){await fs.writeFile(filename,bad);await assert.rejects(prepareLocalCheck(root,'scores'),/BOM|lone CR|valid UTF-8/);}
});
