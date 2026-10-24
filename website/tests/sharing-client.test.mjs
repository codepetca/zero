import test from 'node:test';
import assert from 'node:assert/strict';
import contracts from '../../extension/src/sharing/contracts.js';
import {dependencySnippet,maintainedPlayLink,playLink,projectSummary,releaseAuthor,releaseImage,releaseLink,selectMaintainedProjects,selectReleases,sourceLink} from '../lib/sharing-client.mjs';
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
test('maintained projects are searchable without impersonating a community release or appearing in libraries',async()=>{
  const {readFile}=await import('node:fs/promises');
  const projects=JSON.parse(await readFile(new URL('../content/projects.json',import.meta.url),'utf8'));
  assert.equal(selectMaintainedProjects(projects,{search:'draw'})[0].repositoryUrl,'https://github.com/codepetca/zero-drawing-pad');
  assert.equal(selectMaintainedProjects(projects,{search:'CODEPETCA'}).length,1);
  assert.deepEqual(selectMaintainedProjects(projects,{search:'unrelated'}),[]);
  assert.deepEqual(selectMaintainedProjects(projects,{kind:'library'}),[]);
  assert.deepEqual(selectMaintainedProjects(projects,{id:'drawing-pad',version:'0.1.0'}),[]);
  const {default:preview}=await import('../../extension/src/sharing/game-preview.js');
  const image=await readFile(new URL(`../public${projects[0].image}`,import.meta.url));
  const {width,height}=preview.validateGamePreview(image);
  assert.equal(width,height);
  assert.match(projects[0].sourceCommit,/^[a-f0-9]{40}$/);
  assert.equal(maintainedPlayLink(projects[0]),'https://codepetca.github.io/zero-drawing-pad/');
  assert.equal(maintainedPlayLink({...projects[0],web:undefined}),undefined);
  assert.throws(()=>maintainedPlayLink({...projects[0],sourceCommit:'f'.repeat(40)}));
  assert.throws(()=>maintainedPlayLink({...projects[0],web:{...projects[0].web,url:'javascript:alert(1)'}}));
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
test('discovery offers Play and linked versions without separate GitHub actions',async()=>{
  const {readFile}=await import('node:fs/promises'),discovery=await readFile(new URL('../components/HubDiscovery.tsx',import.meta.url),'utf8'),source=await readFile(new URL('../components/HubProjectCard.tsx',import.meta.url),'utf8');
  assert.match(discovery,/practiceOnly\?'\/api\/sharing\/catalog\/practice':'\/api\/sharing\/catalog\/web'/);assert.match(source,/target="_blank" rel="noopener noreferrer" aria-label=\{`Play \$\{title\}/);
  assert.match(source,/<h3>\{title\}<\/h3>/);assert.match(source,/href=\{repositoryHref\} aria-label=/);
  assert.doesNotMatch(source,/>GitHub(?:<|\{)/);
  assert.doesNotMatch(source,/Play latest|Controls:|Student-hosted live app|Download source project|Download sources|Release details/);
  assert.doesNotMatch(source,/<iframe|dangerouslySetInnerHTML|api\/sharing\/play/);
});

test('legacy screenshot supplements match exact project source and never replace uploaded previews',()=>{
  const release=fixture('game'),previews=[{id:release.id,sourceCommit:release.source.commit,image:'/project-previews/sample.png'}];
  assert.equal(releaseImage(release,previews),previews[0].image);
  assert.equal(releaseImage({...release,source:{...release.source,commit:'e'.repeat(40)}},previews),undefined);
  assert.equal(releaseImage({...release,id:'game-r999-other'},previews),undefined);
  assert.equal(releaseImage({...release,artifacts:{...release.artifacts,preview:{url:'https://artifacts.example/accepted.png'}}},previews),'https://artifacts.example/accepted.png');
});

test('Codepet sample credits match exact library sources without changing publication provenance',async()=>{
  const {readFile}=await import('node:fs/promises');
  const attributions=JSON.parse(await readFile(new URL('../content/release-authors.json',import.meta.url),'utf8'));
  const base=fixture('library'),entry=attributions[0];
  for(const commit of entry.sourceCommits) {
    const release={...base,id:entry.id,title:'Flap Motion',source:{...base.source,commit}};
    const before=JSON.stringify(release);
    assert.equal(releaseAuthor(release,attributions),'codepetca');
    assert.equal(selectReleases({releases:[release]},{search:'codepetca',attributions})[0],release);
    assert.equal(JSON.stringify(release),before,'Display credits preserve accepted contributor/source/artifacts');
    assert.match(sourceLink(release),new RegExp('/tree/'+commit+'/'));
    assert.equal(releaseAuthor({...release,id:base.id},attributions),'student');
    assert.equal(releaseAuthor({...release,kind:'game'},attributions),'student');
  }
  assert.equal(releaseAuthor({...base,id:entry.id,title:'Flap Motion'},attributions),'student','Other source commits cannot inherit the credit');
  assert.equal(releaseAuthor(base,attributions),'student');
});


function practiceFixture(repositoryId='123', version='0.1.0', status='available') {
  const release=fixture('library',version,status),identity=contracts.identity('library',repositoryId,'tutorial-credits-badge');
  return contracts.validateRelease({...release,kind:identity.kind,id:identity.id,slug:identity.slug,namespace:identity.namespace,repository:{...release.repository,id:repositoryId},source:{...release.source,folder:'libraries/tutorial-credits-badge'},
    coordinate:{...identity.coordinate,version},components:[],artifacts:Object.fromEntries(['jar','sources','pom'].map(kind=>{
      const path=contracts.artifactPath(identity,version,kind);return [kind,{path,url:`${origin}/${path}`,size:1,sha256:'d'.repeat(64)}];
    }))},{artifactOrigin:origin});
}
test('tutorial copies stay out of regular search, projects and libraries, with latest available per repository in practice',()=>{
  const old=practiceFixture(),latest=practiceFixture('123','0.2.0'),other=practiceFixture('999'),withdrawn=practiceFixture('123','1.0.0','withdrawn');
  const regular=fixture('library'),game=fixture('game'),catalog={releases:[old,other,withdrawn,regular,latest,game]};
  assert.deepEqual(selectReleases(catalog),[regular]);assert.deepEqual(selectReleases(catalog,{kind:'game'}),[game]);
  assert.deepEqual(selectReleases(catalog,{kind:'library',search:'tutorial-credits-badge'}),[]);
  assert.deepEqual(selectReleases(catalog,{kind:'practice'}),[latest,other]);
  assert.deepEqual(selectReleases(catalog,{kind:'practice',id:old.id,version:old.version}),[old]);
  assert.deepEqual(selectReleases(catalog,{kind:'practice',id:withdrawn.id,version:withdrawn.version}),[withdrawn]);
  assert.deepEqual(selectReleases(catalog,{kind:'library',id:old.id,version:old.version}),[]);
  assert.deepEqual(selectMaintainedProjects([{title:'Copied tutorial',description:'practice',author:'student'}],{kind:'practice'}),[]);
  assert.equal(new URL(releaseLink(old),'https://zero.codepet.ca').searchParams.get('kind'),'practice');
});
test('practice discovery exposes copied-work and listing cleanup guidance, with explicit editor navigation and paused publication',async()=>{
  const {readFile}=await import('node:fs/promises');
  const discovery=await readFile(new URL('../components/HubDiscovery.tsx',import.meta.url),'utf8');
  const prepare=await readFile(new URL('../components/HubPrepare.tsx',import.meta.url),'utf8');
  const navigation=await readFile(new URL('../components/HubNavigation.tsx',import.meta.url),'utf8');
  assert.match(discovery,/copied tutorial work/);assert.match(discovery,/periodic cleanup/);
  assert.match(discovery,/Tutorial practice/);assert.match(discovery,/Add library → Apply/);
  assert.match(discovery,/Libraries and games →/);assert.match(discovery,/Browse tutorial practice/);
  assert.match(navigation,/href="\/hub\?kind=practice"/);
  assert.match(prepare,/publication, including practice, remains paused/);assert.match(prepare,/local passing check does not publish/);
});
