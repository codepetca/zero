'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');
const {createHash}=require('node:crypto');const hub=require('../src/hub-components');
const hash=b=>createHash('sha256').update(b).digest('hex');
async function fixture(t) {
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-hub-edit-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.copyFile(path.join(__dirname,'../../student-template/pom.xml'),path.join(root,'pom.xml'));await fs.writeFile(path.join(root,'zero.json'),'{}');
  await fs.mkdir(path.join(root,'src/main/java'),{recursive:true});await fs.writeFile(path.join(root,'src/main/java/Main.java'),'class Main {}');
  const bytes=new Map();const releases=[];
  for(const id of ['ui1','ui2'])for(const version of ['0.1.0','0.1.1']) {
    const artifacts={};
    for(const [kind,suffix] of Object.entries({jar:'.jar',sources:'-sources.jar',pom:'.pom'})) {
      const url=`/api/hub/maven/ca/codepet/zero/library/${id}/${version}/${id}-${version}${suffix}`;
      const b=kind==='pom' ? (await import('../../hub/checker/policy.mjs')).expectedPom((await import('../../hub/service/scaffold.mjs')).scaffoldBundle({libraryId:id,className:'Hud',title:'UI'})).toString().replace('<version>0.1.0</version>',`<version>${version}</version>`) : `${id} ${version} ${kind}`;
      const binary=Buffer.from(b);
      artifacts[kind]={path:url,sha256:hash(binary),size:binary.length};bytes.set(url,binary);
    }
    releases.push({libraryId:id,version,title:'UI',namespace:`zero.${id}`,coordinate:{groupId:'ca.codepet.zero.library',artifactId:id,version},status:'automatically-checked',components:[{className:'Hud'}],sourceDigest:'a'.repeat(64),artifacts});
  }
  const catalog={mode:'local',libraries:releases};
  const fetcher=async url=>new Response(new URL(url).pathname==='/api/hub/catalog'?JSON.stringify(catalog):bytes.get(new URL(url).pathname));
  const context=await hub.loadCatalog('http://127.0.0.1:3456',{fetcher});return{root,context,bytes,catalog,releases};
}
test('independent library pins preserve app source and unrelated library; Update/Revert only own blocks',async t=>{
  const f=await fixture(t),pom=path.join(f.root,'pom.xml');
  let plan=await hub.planChange(f.root,f.context,f.releases[0]);await fs.writeFile(pom,plan.afterText);
  plan=await hub.planChange(f.root,f.context,f.releases[2]);await fs.writeFile(pom,plan.afterText);
  plan=await hub.planChange(f.root,f.context,f.releases[1],{operation:'update'});await fs.writeFile(pom,plan.afterText);
  assert.equal(plan.current,'0.1.0');assert.match(plan.afterText,/<artifactId>ui2<\/artifactId><version>0.1.0/);
  plan=await hub.planChange(f.root,f.context,f.releases[0],{operation:'revert'});assert.equal(plan.previous,'0.1.0');assert.match(plan.afterText,/<artifactId>ui1<\/artifactId><version>0.1.0/);
  assert.equal(await fs.readFile(path.join(f.root,'src/main/java/Main.java'),'utf8'),'class Main {}');
});
test('drifted bytes, forged paths, source shadows and edited POM fail closed',async t=>{
  const f=await fixture(t);const plan=await hub.planChange(f.root,f.context,f.releases[0]);
  await fs.appendFile(path.join(f.root,'pom.xml'),'<!-- unrelated new edit -->');await assert.rejects(hub.validatePlan(plan,f.context),/POM changed/);
  f.bytes.set(f.releases[0].artifacts.jar.path,Buffer.from('different'));await assert.rejects(hub.planChange(f.root,f.context,f.releases[0]),/artifact changed/);
  const forged=structuredClone(f.catalog);forged.libraries[0].artifacts.jar.path='/api/hub/maven/../../private';assert.throws(()=>hub.validateCatalog(forged),/artifact binding/);
  await fs.writeFile(path.join(f.root,'src/main/java/Hud.java'),'package zero.ui1; public class Hud {}');await assert.rejects(hub.planChange(f.root,f.context,f.releases[0]),/shadows/);
});
test('invalid origins, manual dependencies, profiles, incomplete blocks and unsuitable update rejected',async t=>{
  for(const url of ['http://example.com','https://user:password@example.com','https://example.com/private'])assert.throws(()=>hub.origin(url));
  const f=await fixture(t),pom=path.join(f.root,'pom.xml');const original=await fs.readFile(pom,'utf8');
  await fs.writeFile(pom,original.replace('</dependencies>','<dependency><groupId>ca.codepet.zero.library</groupId><artifactId>ui1</artifactId><version>0.1.0</version></dependency></dependencies>'));
  await assert.rejects(hub.planChange(f.root,f.context,f.releases[0]),/manual/);
  await fs.writeFile(pom,original.replace('</project>','<profiles></profiles></project>'));await assert.rejects(hub.planChange(f.root,f.context,f.releases[0]),/manual/);
  await fs.writeFile(pom,original);const plan=await hub.planChange(f.root,f.context,f.releases[0]);await fs.writeFile(pom,plan.afterText.replace('Zero hub ui1 history: end','broken history marker'));await assert.rejects(hub.planChange(f.root,f.context,f.releases[1],{operation:'update'}),/block/);
});
const {createHubActions}=require('../src/hub-actions');
async function commandFixture(t,{approval,dirty=false,drift=false,editAccepted=true}={}) {
  const f=await fixture(t);let busy=false,edits=0,saves=0,picks=0;
  const doc={isDirty:dirty,version:1,getText:()=>f.text,positionAt:x=>x,save:async()=>{saves++;await fs.writeFile(path.join(f.root,'pom.xml'),f.text);doc.isDirty=false;return true;}};
  f.text=await fs.readFile(path.join(f.root,'pom.xml'),'utf8');
  const vscode={workspace:{isTrusted:true,getConfiguration:()=>({get:()=>f.context.origin}),openTextDocument:async()=>doc},Uri:{file:x=>x,parse:x=>x},Range:class{constructor(a,b){this.start=a;this.end=b;}},window:{
    showQuickPick:async entries=>{picks++;return entries.find(e=>e.action==='add')||entries[0];},
    showInformationMessage:async(_message,options)=>{if(options?.modal){if(drift)await fs.appendFile(path.join(f.root,'pom.xml'),'<!-- student edit -->');return approval;}},
    showTextDocument:async()=>({edit:async callback=>{edits++;if(!editAccepted)return false;callback({replace:(_range,text)=>{f.text=text;doc.version++;doc.isDirty=true;}});return true;}})
  }};
  const actions=createHubActions(vscode,{project:async()=>f.root,isBusy:()=>busy,setBusy:x=>{busy=x;}},{fetcher:f.context.fetcher});
  return{f,actions,doc,stats:()=>({busy,edits,saves,picks})};
}
test('hub native action cancellation, unsaved edits and review drift preserve student POM',async t=>{
  for(const options of [{approval:undefined},{approval:'Apply',dirty:true},{approval:'Apply',drift:true}]) {
    const c=await commandFixture(t,options);const before=c.f.text;
    if(options.dirty||options.drift)await assert.rejects(c.actions.commands['zero.browseHub'](),/Save pom|POM changed/);
    else await c.actions.commands['zero.browseHub']();
    assert.equal(c.stats().edits,0);assert.equal(c.stats().saves,0);assert.equal(c.stats().busy,false);assert.equal(c.f.text,before);
  }
});
test('hub native edit is saved only after approval; rejected versioned edit never saves',async t=>{
  const rejected=await commandFixture(t,{approval:'Apply',editAccepted:false});await assert.rejects(rejected.actions.commands['zero.browseHub'](),/POM changed/);assert.equal(rejected.stats().saves,0);
  const accepted=await commandFixture(t,{approval:'Apply'});await accepted.actions.commands['zero.browseHub']();
  assert.equal(accepted.stats().edits,1);assert.equal(accepted.stats().saves,1);assert.equal(accepted.stats().busy,false);assert.match(accepted.f.text,/<artifactId>ui1<\/artifactId>/);
});
test('legal spaced/commented/Unicode package syntax cannot mask installed classes',async t=>{
  const f=await fixture(t),filename=path.join(f.root,'src/main/java/Hud.java');
  for(const source of [
    'package zero . ui1; public class Hud {}',
    'package zero /* note */ .\nui1; public class Hud {}',
    String.raw`package \u007aero.\u0075i1; public class Hud {}`,
    String.raw`// hidden line ending\u000apackage zero.ui1; public class Hud {}`,
    String.raw`// hidden line ending\u000dpackage zero.ui1; public class Hud {}`,
    'package ze\u200bro.ui1; public class Hud {}',
    String.raw`package ze\u200bro.ui1; public class H\u200bud {}`,
    String.raw`package ze\u0000ro.ui1; public class Hud {}`
  ]) {
    await fs.writeFile(filename,source);await assert.rejects(hub.planChange(f.root,f.context,f.releases[0]),/shadows/,source);assert.equal(await fs.readFile(filename,'utf8'),source);
  }
  await fs.writeFile(filename,'class Other { String note="package zero.ui1; class Hud {}"; }');
  await hub.planChange(f.root,f.context,f.releases[0]);
});
test('quiet Files view exposes downloaded library source and preview without arbitrary paths',async t=>{
  const f=await fixture(t);const {libraryLayout}=require('../src/library-files');
  assert.equal(await libraryLayout(f.root),null);
  await fs.writeFile(path.join(f.root,'.zero-library.json'),JSON.stringify({schema:1,libraryId:'ui1'}));
  const layout=await libraryLayout(f.root);assert.equal(layout.sources,path.join(f.root,'src/zero/ui1'));assert.equal(layout.preview,path.join(f.root,'src/Main.java'));assert.equal(layout.api,path.join(f.root,'API.md'));
  await fs.writeFile(path.join(f.root,'.zero-library.json'),JSON.stringify({schema:1,libraryId:'../outside'}));await assert.rejects(libraryLayout(f.root),/valid reserved ID/);
});

test('history traversal keeps exact pins across pages and rejects overflow or changed selections',async t=>{
  const f=await fixture(t);const releases=Array.from({length:42},(_,i)=>({...f.releases[0],version:`0.1.${i}`,coordinate:{...f.releases[0].coordinate,version:`0.1.${i}`},artifacts:Object.fromEntries(Object.entries(f.releases[0].artifacts).map(([kind,artifact])=>[kind,{...artifact,path:artifact.path.replaceAll('0.1.0',`0.1.${i}`)}]))}));
  const calls=[];let changed=false;
  const fetcher=async url=>{
    const query=new URL(url).searchParams;assert.equal(query.get('history'),'1');const start=Number(query.get('cursor')??0);calls.push(start);
    const page=releases.slice(start,start+20);if(changed&&start===20)page[0]={...page[0],title:'Changed immutable selection'};
    return Response.json({mode:'local',libraries:page,nextCursor:start+20<releases.length?String(start+20):null});
  };
  const context=await hub.loadCatalog(f.context.origin,{fetcher});assert.equal(context.catalog.libraries.length,42);assert.deepEqual(calls,[0,20,40]);assert.equal(context.catalog.libraries[0].version,'0.1.0');
  changed=true;
  await assert.rejects(hub.validatePlan({fingerprint:context.fingerprint},context),/catalog changed/);
  const overflow=async url=>{const start=Number(new URL(url).searchParams.get('cursor')??0);return Response.json({mode:'local',libraries:Array.from({length:20},(_,i)=>({...releases[0],version:`0.1.${start+i}`,coordinate:{...releases[0].coordinate,version:`0.1.${start+i}`},artifacts:Object.fromEntries(Object.entries(releases[0].artifacts).map(([kind,artifact])=>[kind,{...artifact,path:artifact.path.replaceAll('0.1.0',`0.1.${start+i}`)}]))})),nextCursor:String(start+20)});};
  await assert.rejects(hub.loadCatalog(f.context.origin,{fetcher:overflow}),/more than 500 releases.*website/);
});
