import test from 'node:test';
import assert from 'node:assert/strict';
import contracts from '../../extension/src/sharing/contracts.js';
import {dependencySnippet,playLink,projectSummary,releaseLink,selectReleases,sourceLink} from '../lib/sharing-client.mjs';
const origin='https://artifacts.example';
function fixture(kind,version='0.1.0',status='available') {
  const identity=contracts.identity(kind,'123','sample');
  const release={schema:1,kind,id:identity.id,slug:'sample',version,title:'Inert fixture',description:'Developer test only',license:'MIT',repository:{id:'123',ownerId:'456',owner:'student',name:'game',url:'https://github.com/student/game'},contributor:{githubId:'456',login:'student'},source:{commit:'a'.repeat(40),folder:kind==='game'?'.':'libraries/sample',sha256:'b'.repeat(64)},policyRevision:'c'.repeat(40),status,artifacts:{}};
  for(const type of kind==='game'?['zip']:['jar','sources','pom']) {
    const path=contracts.artifactPath(identity,version,type);
    release.artifacts[type]={path,url:`${origin}/${path}`,size:1,sha256:'d'.repeat(64)};
  }
  if(kind==='library') Object.assign(release,{namespace:identity.namespace,coordinate:{...identity.coordinate,version},libraryKind:'helper',components:[{className:`${identity.namespace}.Counter`,description:'count helper',usage:'Counter count = new Counter();',api:['public int get();']}]});
  else release.controls='Arrow keys';
  return contracts.validateRelease(release,{artifactOrigin:origin});
}
test('discovery separates kinds, searches components and shows only the latest available project version',()=>{
  const catalog={releases:[fixture('game'),fixture('library','0.2.0'),fixture('library','0.10.0'),fixture('library','0.1.0','withdrawn')]};
  assert.deepEqual(selectReleases(catalog,{search:'count'}).map(r=>r.version),['0.10.0']);
  assert.equal(selectReleases(catalog,{kind:'game'}).length,1);
  assert.equal(selectReleases(catalog,{id:'lib-r123-sample',version:'0.1.0'})[0].status,'withdrawn');
  assert.deepEqual(selectReleases(catalog,{id:'lib-r123-sample',version:'9.0.0'}),[]);
  assert.equal(selectReleases(catalog,{id:'lib-r123-sample',version:'0.2.0',search:'unrelated prior search'}).length,1);
  assert.throws(()=>selectReleases(catalog,{id:'lib-r123-sample'}));
});
test('latest selection is independent of catalog order and happens before search, without merging different projects',()=>{
  const old={...fixture('game','0.2.0'),description:'Retired description'},latest=fixture('game','0.10.0');
  const other={...fixture('game','0.1.0'),id:'game-r999-sample'};
  const catalog={releases:[latest,other,old,fixture('game','1.0.0','withdrawn')]};
  assert.deepEqual(selectReleases(catalog,{kind:'game'}).map(r=>[r.id,r.version]),[[latest.id,'0.10.0'],[other.id,'0.1.0']]);
  assert.deepEqual(selectReleases(catalog,{kind:'game',search:'retired'}),[]);
  assert.equal(selectReleases(catalog,{kind:'game',id:old.id,version:old.version})[0],old);
  assert.deepEqual(selectReleases({releases:[fixture('game','1.0.0','withdrawn')]},{kind:'game'}),[]);
});
test('project summaries keep one short sentence and collapse multiline descriptions',()=>{
  assert.equal(projectSummary('Defend the grove. Build towers and survive.'),'Defend the grove.');
  assert.equal(projectSummary('A small\n  game.'),'A small game.');
  assert.ok(projectSummary('Build towers '.repeat(30)).length<=120);
  assert.ok(projectSummary('x'.repeat(300)).length<=120);
});
test('links pin source and release; only available libraries yield Maven snippets',()=>{
  const library=fixture('library');
  assert.match(releaseLink(library),/version=0.1.0/);
  assert.equal(sourceLink(library),`https://github.com/student/game/tree/${'a'.repeat(40)}/libraries/sample`);
  assert.match(dependencySnippet(library),/<url>https:\/\/artifacts.example\/maven<\/url>/);
  assert.match(dependencySnippet(library),/<version>0.1.0<\/version>/);
  assert.throws(()=>dependencySnippet(fixture('game')));
  assert.throws(()=>dependencySnippet(fixture('library','0.1.0','withdrawn')));
});

test('Play uses a stable external page independently of the immutable source snapshot',()=>{
  const game=fixture('game'),web={provider:'github-pages',url:'https://student.github.io/game/',commit:game.source.commit,runId:42};
  const linked=contracts.validateRelease({...game,web},{artifactOrigin:origin});
  assert.equal(playLink(linked),web.url);assert.equal(playLink({...linked,version:'0.2.0'}),web.url);
  assert.equal(playLink(game),undefined);assert.equal(playLink({...linked,status:'withdrawn'}),undefined);assert.equal(playLink({...linked,kind:'library'}),undefined);
  assert.throws(()=>playLink({...linked,web:{...web,url:'javascript:alert(1)'}}));
  assert.throws(()=>playLink({...linked,web:{...web,commit:'f'.repeat(40)}}));
  assert.match(sourceLink(linked),new RegExp('/tree/'+game.source.commit+'$'));
});
test('discovery offers Play and GitHub without title links, controls or source downloads',async()=>{
  const {readFile}=await import('node:fs/promises'),source=await readFile(new URL('../components/HubDiscovery.tsx',import.meta.url),'utf8');
  assert.match(source,/fetch\('\/api\/sharing\/catalog\/web'/);assert.match(source,/target="_blank" rel="noopener noreferrer">Play<\/a>/);
  assert.match(source,/<h3>\{release.title\}<\/h3>/);assert.match(source,/href=\{sourceLink\(release\)\}>GitHub/);
  assert.doesNotMatch(source,/Play latest|Controls:|Student-hosted live app|Download source project|Download sources|Release details/);
  assert.doesNotMatch(source,/<iframe|dangerouslySetInnerHTML|api\/sharing\/play/);
});
