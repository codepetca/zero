'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const c=require('../src/sharing/contracts');
const repository={id:'12345',ownerId:'7',owner:'student',name:'my-game',url:'https://github.com/student/my-game'};
const descriptor={schema:1,kind:'library',slug:'health-bar',version:'0.1.0',title:'Health Bar',description:'An explicit display',license:'MIT',libraryKind:'widget'};
function request(){return {schema:1,kind:'library',slug:descriptor.slug,version:descriptor.version,repository,requester:{githubId:'7',login:'student'},commit:'a'.repeat(40),folder:'libraries/health-bar',descriptor,policyRevision:'b'.repeat(40)};}
function release(){const id=c.identity('library',repository.id,descriptor.slug);return {schema:1,...descriptor,id:id.id,repository,contributor:{githubId:'7',login:'student'},source:{commit:'a'.repeat(40),folder:'libraries/health-bar',sha256:'c'.repeat(64)},policyRevision:'b'.repeat(40),status:'available',namespace:id.namespace,coordinate:{...id.coordinate,version:'0.1.0'},artifacts:Object.fromEntries(['jar','sources','pom'].map(kind=>{const path=c.artifactPath(id,'0.1.0',kind);return [kind,{path,url:`https://files.example/${path}`,size:10,sha256:'d'.repeat(64)}];}))};}
test('stable repository IDs make username/repository renames irrelevant to coordinates',()=>{const a=c.identity('library','12345','health-bar');assert.equal(a.namespace,'zero.contrib.r12345.health_bar');assert.equal(a.coordinate.groupId,'ca.codepet.zero.contrib.r12345');assert.equal(c.identity('library','12345','healthbar').namespace,'zero.contrib.r12345.healthbar');assert.deepEqual(c.identity('library','12345','health-bar'),a);});
test('descriptors stay small and contain no claimed identity or execution authority',()=>{assert.deepEqual(c.validateDescriptor(descriptor),descriptor);for(const field of ['owner','namespace','command','coordinate'])assert.throws(()=>c.validateDescriptor({...descriptor,[field]:'forged'}));});
test('frozen requests bind version, owner, folder and exact revision',()=>{assert.deepEqual(c.validateRequest(request()),request());assert.throws(()=>c.validateRequest({...request(),requester:{githubId:'8',login:'other'}}));assert.throws(()=>c.validateRequest({...request(),commit:'main'}));assert.throws(()=>c.validateRequest({...request(),folder:'libraries/other'}));assert.throws(()=>c.validateRequest({...request(),version:'0.1.1'}));});
test('unsafe folders, versions and IDs cannot become paths',()=>{for(const path of ['../x','/tmp/a','a/../b','a\\b','a/.env','a//b','a\n'])assert.throws(()=>c.validateFolder(path));for(const v of ['latest','1.0-SNAPSHOT','01.0.0','1.2','1.2.3-beta'])assert.throws(()=>c.validateVersion(v));assert.throws(()=>c.identity('library',12345,'health'));assert.throws(()=>c.identity('library','12345','a--b'));});
test('artifact origins and coordinate paths cannot be changed by catalog data',()=>{assert.deepEqual(c.validateRelease(release(),{artifactOrigin:'https://files.example'}),release());const changed=release();changed.artifacts.jar.url='https://other.example/'+changed.artifacts.jar.path;assert.throws(()=>c.validateRelease(changed,{artifactOrigin:'https://files.example'}));const other=release();other.artifacts.pom.path='../pom.xml';assert.throws(()=>c.validateRelease(other));const forged=release();forged.coordinate.version='0.1.1';assert.throws(()=>c.validateRelease(forged));});
test('catalog rejects duplicate versions and unsupported authority fields',()=>{assert.equal(c.validateCatalog({schema:1,revision:'e'.repeat(40),releases:[release()]}).releases.length,1);assert.throws(()=>c.validateCatalog({schema:1,revision:'e'.repeat(40),releases:[release(),release()]}));assert.throws(()=>c.validateRelease({...release(),passed:true}));});
test('Share opens a bounded prefilled GitHub form rather than sending',()=>{const url=new URL(c.publicationUrl(request()));assert.equal(url.origin,'https://github.com');assert.equal(url.pathname,'/codepetca/zero/issues/new');assert.match(url.searchParams.get('body'),/libraries\/health-bar/);assert.match(url.searchParams.get('body'),new RegExp('a'.repeat(40)));});
test('games require complete-project metadata and never Maven coordinates',()=>{const descriptor={schema:1,kind:'game',slug:'space-game',version:'1.0.0',title:'Space',description:'Move a ship',license:'MIT',controls:'Arrow keys'};const id=c.identity('game','12345',descriptor.slug),path=c.artifactPath(id,'1.0.0','zip');const game={...descriptor,id:id.id,repository,contributor:{githubId:'7',login:'student'},source:{commit:'a'.repeat(40),folder:'.',sha256:'c'.repeat(64)},policyRevision:'b'.repeat(40),status:'available',artifacts:{zip:{path,url:`https://files.example/${path}`,size:50,sha256:'d'.repeat(64)}}};assert.equal(c.validateRelease(game).kind,'game');assert.throws(()=>c.validateRelease({...game,coordinate:{groupId:'x',artifactId:'x',version:'1.0.0'}}));});

function gameRequest(){const descriptor={schema:1,kind:'game',slug:'space-game',version:'1.0.0',title:'Space',description:'Move a ship',license:'MIT',controls:'Arrow keys'};return {...request(),kind:'game',slug:descriptor.slug,version:descriptor.version,folder:'.',descriptor};}
function gameRelease(){const req=gameRequest(),id=c.identity('game',repository.id,req.slug),path=c.artifactPath(id,req.version,'zip');return {schema:1,...req.descriptor,id:id.id,repository,contributor:req.requester,source:{commit:req.commit,folder:'.',sha256:'c'.repeat(64)},policyRevision:req.policyRevision,status:'available',artifacts:{zip:{path,url:`https://files.example/${path}`,size:50,sha256:'d'.repeat(64)}}};}
const web={provider:'github-pages',url:'https://student.github.io/my-game/',commit:'a'.repeat(40),runId:42};
test('optional hosted provenance belongs only to root-game requests/releases at the exact source commit',()=>{
  assert.deepEqual(c.validateWebPublication(web,{commit:web.commit}),web);
  assert.deepEqual(c.validateRequest({...gameRequest(),web}).web,web);
  assert.deepEqual(c.validateRelease({...gameRelease(),web}).web,web);
  assert.equal(c.validateRequest(gameRequest()).web,undefined);assert.equal(c.validateRelease(gameRelease()).web,undefined);
  assert.throws(()=>c.validateDescriptor({...gameRequest().descriptor,web}),/fields/);
  assert.throws(()=>c.validateRequest({...request(),web}),/Only games/);
  assert.throws(()=>c.validateRelease({...release(),web}),/Only games/);
  assert.throws(()=>c.validateRequest({...gameRequest(),folder:'nested',web}));
  assert.throws(()=>c.validateRequest({...gameRequest(),web:{...web,commit:'b'.repeat(40)}}),/exact shared/);
  assert.throws(()=>c.validateRelease({...gameRelease(),web:{...web,commit:'b'.repeat(40)}}),/exact shared/);
  for(const changed of [{...web,provider:'other'},{...web,runId:0},{...web,runId:'42'},{...web,runId:1.1},{...web,runId:Number.MAX_SAFE_INTEGER+1},{...web,commit:'main'},{...web,verified:true}])assert.throws(()=>c.validateWebPublication(changed));
});
test('playable URL validation rejects executable, credentialed, local, ambiguous and noncanonical destinations',()=>{
  for(const url of ['javascript:alert(1)','data:text/html,test','//student.github.io/game/','http://student.github.io/game/','https://student.github.io:444/game/','https://student.github.io:443/game/','https://user:secret@student.github.io/game/','https://127.0.0.1/','https://2130706433/','https://[::1]/','https://localhost/','https://game.local/','https://game.internal/','https://student.github.io/game/?x=1','https://student.github.io/game/#x','https://student.github.io/game/#','https://student.github.io/game/?','https://student.github.io/../game/','https://STUDENT.github.io/game/','https://student.github.io\\@evil.example/',' https://student.github.io/game/','https://student.github.io/\n'])assert.throws(()=>c.validateWebPublication({...web,url}),url);
  assert.equal(c.validateWebUrl('https://play.example.org/'),'https://play.example.org/');
});

const coreRequirement={minVersion:'0.3.0',maxExclusive:'0.4.0'};
const coreInput={version:'0.3.0',sourceSha256:'1'.repeat(64)};
const coreBuild={...coreInput,jarSha256:'2'.repeat(64),buildRecipeSha256:'3'.repeat(64),javaRelease:'17',javafxVersion:'21.0.12'};
test('schema2 libraries bind authored input and generated core build while envelopes stay schema1',()=>{
 const authored={...descriptor,schema:2,coreRequirement,coreInput};
 assert.deepEqual(c.validateDescriptor(authored),authored);
 assert.equal(c.validateRequest({...request(),descriptor:authored}).schema,1);
 const released={...release(),schema:2,coreRequirement,coreBuild};
 assert.deepEqual(c.validateRelease(released),released);
 assert.equal(c.validateCatalog({schema:1,revision:'e'.repeat(40),releases:[released]}).releases[0].schema,2);
 for(const changed of [{...descriptor,coreRequirement},{...authored,schema:1},{...authored,coreInput:{...coreInput,version:'0.4.0'}},{...authored,coreRequirement:{minVersion:'0.3.0',maxExclusive:'0.5.0'}},{...authored,coreRequirement:{minVersion:'0.3.0',maxExclusive:'0.4.1'}},{...authored,kind:'game',controls:'Keys'}])assert.throws(()=>c.validateDescriptor(changed));
 for(const changed of [{...released,schema:1},{...released,coreInput},{...released,coreBuild:{...coreBuild,jarSha256:'bad'}},{...released,coreBuild:{...coreBuild,version:'0.2.9'}},{...released,coreBuild:{...coreBuild,javaRelease:'21'}},{...released,coreBuild:{...coreBuild,javafxVersion:'22'}}])assert.throws(()=>c.validateRelease(changed));
 assert.equal(c.versionSatisfies('0.3.99',coreRequirement),true);assert.equal(c.versionSatisfies('0.4.0',coreRequirement),false);assert.equal(c.versionSatisfies('0.2.99',coreRequirement),false);
 assert.throws(()=>c.validateCoreRequirement({minVersion:'0.3.0',maxExclusive:'1.0.0'}));
 assert.throws(()=>c.validateCoreInput({...coreInput,commands:'run'},coreRequirement));
});
