import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {inspectAdoption,validateAdoption,generateAdoption} from '../adoption.mjs';
import {FileRegistry,initialState,digest} from '../registry.mjs';
import {FileStorage} from '../file-storage.mjs';
import {PublicationService} from '../publication.mjs';
import {validateRegistryState} from '../github-registry.mjs';
import {createSharingPlatform} from '../platform.mjs';
import {minimalGameFiles} from './game-fixture.mjs';

const library={id:'lib-r22-health-bar',version:'0.1.0'};
const observation=(libraries=[library])=>({schema:1,libraries});
const dependency=(group='ca.codepet.zero.contrib.r22',artifact='health-bar',version='0.1.0')=>`<dependency><groupId>${group}</groupId><artifactId>${artifact}</artifactId><version>${version}</version></dependency>`;
const xml=(dependencies='',properties='',extra='')=>`<project><properties>${properties}</properties><dependencies>${dependencies}</dependencies>${extra}</project>`;
const inspect=text=>inspectAdoption([{path:'pom.xml',bytes:Buffer.from(text)}]);

test('root direct exact declarations include ordinary, managed and authored published dependencies',()=>{
  assert.deepEqual(inspect(xml(dependency())),observation());
  assert.deepEqual(inspect(xml(dependency('unrelated.group','tool','${missing}')+dependency())),observation());
  assert.deepEqual(inspect(xml('<!-- zero-sharing lib-r22-health-bar dependency start -->'+dependency()+'<!-- zero-sharing lib-r22-health-bar dependency end -->')),observation());
  assert.deepEqual(inspect(xml('<!-- zero-sharing published libraries -->'+dependency()+'<!-- /zero-sharing published libraries -->')),observation());
  assert.deepEqual(inspect(xml(dependency()+dependency())),observation());
  assert.deepEqual(inspect(xml(dependency('org.openjfx','javafx-controls','21.0.12'),'','<dependencyManagement><dependencies>'+dependency()+'</dependencies></dependencyManagement>')),observation([]));
  assert.deepEqual(inspectAdoption([{path:'pom.xml',data:Buffer.from(xml())},{path:'zero-libraries.json',data:Buffer.from(JSON.stringify({schema:1,libraries:[{repositoryId:'22',slug:'health-bar',mode:'local',version:'0.1.0'}]}))}]),observation([]));
  assert.deepEqual(inspect(xml(dependency('${group}','${artifact}','${alias}'),'<group>ca.codepet.zero.contrib.r22</group><artifact>health-bar</artifact><version>0.1.0</version><alias>${version}</alias>')),observation());
});

test('unsupported or unresolvable POMs omit observations, preserving unknown coverage',()=>{
  assert.equal(inspectAdoption([]),undefined);
  for(const input of ['<project><broken></project>',xml(dependency(undefined,undefined,'${missing}')),xml(dependency(undefined,undefined,'LATEST')),xml(dependency(undefined,undefined,'1.0')),xml(dependency('ca.codepet.zero.contrib.r022')),xml('', '<a>${b}</a><b>${a}</b>'),xml('', '<p>'+ 'x'.repeat(4097)+'</p>'),xml('','','<parent/>'),xml('','','<profiles/>'),xml('','','<modules/>')])assert.equal(inspect(input),undefined);
  const chain='<p0>x</p0>'+Array.from({length:35},(_,i)=>`<p${i+1}>\${p${i}}\${p${i}}</p${i+1}>`).join('');
  assert.equal(inspect(xml('',chain)),undefined);
  assert.equal(inspect(xml('',Array.from({length:129},(_,i)=>`<p${i}>x</p${i}>`).join(''))),undefined);
  assert.equal(inspectAdoption([{path:'pom.xml',bytes:Buffer.from([0xff])}]),undefined);
  assert.equal(inspectAdoption([{path:'pom.xml',bytes:Buffer.alloc(2*1024*1024+1)}]),undefined);
});

test('observation validation rejects unknown keys, invalid identities and unsorted duplicates',()=>{
  assert.deepEqual(validateAdoption(observation()),observation());
  for(const input of [{...observation(),extra:1},observation([{...library,extra:1}]),observation([{id:'lib-r0-health-bar',version:'0.1.0'}]),observation([{...library,version:'LATEST'}]),observation([library,library]),observation([{...library,id:'lib-r33-z'},library]),observation(Array(129).fill(library))])assert.throws(()=>validateAdoption(input));
});

function add(state,{kind='game',repository='11',slug='game',version='0.1.0',adoption,status='available',delivery='ready'}={}){
  const id=`${kind==='game'?'game':'lib'}-r${repository}-${slug}`,key=`${kind}/${id}/${version}`;
  state.releases[key]={release:{kind,id,version,status,repository:{id:repository}},delivery,...(adoption?{adoption}:{})};
  return key;
}
const addLibrary=(state,options={})=>add(state,{kind:'library',repository:'22',slug:'health-bar',...options});

test('projection deduplicates repositories, excludes self/nonaccepted targets and exposes zeros/coverage',()=>{
  const state=initialState();addLibrary(state);addLibrary(state,{repository:'33',slug:'unused'});
  add(state,{adoption:observation([library,{id:'lib-r99-missing',version:'0.1.0'}])});
  add(state,{slug:'second',adoption:observation()});
  add(state,{repository:'12',adoption:observation()});
  add(state,{repository:'22',adoption:observation()});
  add(state,{repository:'13'});
  add(state,{repository:'14',adoption:observation([{...library,version:'9.0.0'}])});
  add(state,{repository:'15',delivery:'pending',adoption:observation()});
  add(state,{repository:'16',status:'withdrawn',adoption:observation()});
  assert.deepEqual(generateAdoption(state),{schema:1,observedProjects:4,totalProjects:5,libraries:[{id:library.id,projects:2},{id:'lib-r33-unused',projects:0}]});
  add(state,{repository:'12',slug:'legacy'});
  assert.equal(generateAdoption(state).observedProjects,3);
  assert.equal(generateAdoption(state).libraries[0].projects,2);
});

test('latest available versions remove dependencies and withdrawal/restore falls back without increments',()=>{
  const state=initialState();const target=addLibrary(state);
  add(state,{adoption:observation(),version:'0.9.0'});
  const latest=add(state,{adoption:observation([]),version:'0.10.0'});
  assert.equal(generateAdoption(state).libraries[0].projects,0);
  state.availability.push({key:latest,status:'withdrawn'});
  assert.equal(generateAdoption(state).libraries[0].projects,1);
  state.availability.push({key:latest,status:'available'});
  assert.equal(generateAdoption(state).libraries[0].projects,0);
  state.availability.push({key:target,status:'withdrawn'});
  assert.deepEqual(generateAdoption(state).libraries,[]);
});

async function publicationFixture(t,pomChange=text=>text,{requestPolicy='b'.repeat(40),publisherPolicy=requestPolicy}={}){
  const dir=await mkdtemp(join(tmpdir(),'zero-adoption-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const registry=new FileRegistry({file:join(dir,'state.json')}),storage=new FileStorage({root:join(dir,'objects')});
  const repository={id:'11',ownerId:'7',owner:'student',name:'game',url:'https://github.com/student/game'},metadata={...repository,visibility:'public',ownerType:'User'};
  const descriptor={schema:1,kind:'game',slug:'game',version:'0.1.0',title:'Game',description:'A game',license:'MIT',controls:'Arrows',preview:'preview.png'};
  const request={schema:1,kind:'game',slug:'game',version:'0.1.0',repository,requester:{githubId:'7',login:'student'},commit:'a'.repeat(40),folder:'.',descriptor,policyRevision:requestPolicy};
  const files=[...minimalGameFiles().map(file=>file.path==='pom.xml'?{...file,data:Buffer.from(pomChange(file.data.toString()))}:file),{path:'zero-game.json',data:Buffer.from(JSON.stringify(descriptor))},{path:'preview.png',data:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64')}];
  let reads=0;
  const reader={publicationIssue:async()=>({request,repositoryMetadata:metadata,issueId:'1',issueState:'open',authenticatedActor:request.requester}),publicationIssueState:async()=>({issueState:'open',authenticatedActor:request.requester}),source:async()=>{reads++;return {files,repositoryMetadata:metadata,sourceDigest:digest('frozen-source')};},repository:async()=>metadata};
  const platform=createSharingPlatform({reader,registry,storage,artifactOrigin:'https://fixture.public.blob.vercel-storage.com',policyRevision:publisherPolicy});
  return {platform,registry,storage,reader,request,reads:()=>reads};
}

test('publication persists evidence-bound observation atomically and recovery never refetches or changes it',async t=>{
  const f=await publicationFixture(t,text=>text.replace('</dependencies>',dependency()+'</dependencies>'));
  const original=PublicationService.prototype.publish;let captured;
  t.mock.method(PublicationService.prototype,'publish',function(input){captured=structuredClone(input);return original.call(this,input);});
  const accepted=await f.platform.publishIssue(1);
  assert.deepEqual(accepted.adoption,observation());assert.equal(captured.evidence.adoptionDigest,digest(observation()));
  const state=(await f.registry.read()).state;assert.deepEqual(validateRegistryState(state),state);
  assert.equal(accepted.release.adoption,undefined);
  const again=await f.platform.publishIssue(1);assert.deepEqual(again.adoption,observation());assert.equal(f.reads(),1);
  const old=structuredClone(state);delete Object.values(old.releases)[0].adoption;assert.deepEqual(validateRegistryState(old),old);
  for(const adoption of [{schema:2,libraries:[]},observation([library,library])]){
    const corrupt=structuredClone(state);Object.values(corrupt.releases)[0].adoption=adoption;assert.throws(()=>validateRegistryState(corrupt));
  }
});

test('removing/substituting the observation cannot pass trusted packaging evidence',async t=>{
  for(const mutate of [input=>{delete input.adoption;},input=>{input.adoption=observation([library]);}]){
    const f=await publicationFixture(t),original=PublicationService.prototype.publish;
    const mocked=t.mock.method(PublicationService.prototype,'publish',function(input){mutate(input);return original.call(this,input);});
    await assert.rejects(f.platform.publishIssue(1),/Adoption observation.*bound/);
    assert.equal(Object.keys((await f.registry.read()).state.releases).length,0);mocked.mock.restore();
  }
});

test('unsupported metric inspection does not block an otherwise valid publication',async t=>{
  // Snapshot policy permits modules, while adoption conservatively cannot assess
  // their additional dependencies without reading/executing another project.
  const f=await publicationFixture(t,text=>text.replace('</project>','<modules><module>another-project</module></modules></project>'));
  const result=await f.platform.publishIssue(1);assert.equal(result.delivery,'ready');assert.equal(result.adoption,undefined);
});


test('accepted withdrawn dependency versions still count while their library has an available version',()=>{
  const state=initialState(),old=addLibrary(state);
  const current=addLibrary(state,{version:'0.2.0'});
  state.availability.push({key:old,status:'withdrawn'});
  add(state,{adoption:observation()});
  assert.equal(generateAdoption(state).libraries[0].projects,1);
  state.availability.push({key:current,status:'withdrawn'});
  assert.deepEqual(generateAdoption(state).libraries,[]);
});

test('delivery interruptions retain the accepted observation and recover with no source reads',async t=>{
  const f=await publicationFixture(t,text=>text.replace('</dependencies>',dependency()+'</dependencies>'));
  const original=f.storage.putImmutable.bind(f.storage);let armed=true;
  f.storage.putImmutable=async(key,bytes)=>{if(armed&&key.startsWith('games/')){armed=false;throw new Error('injected final delivery interruption');}return original(key,bytes);};
  await assert.rejects(f.platform.publishIssue(1),/injected final delivery interruption/);
  const pending=(await f.registry.read()).state,key=Object.keys(pending.releases)[0];
  assert.equal(pending.releases[key].delivery,'pending');assert.deepEqual(pending.releases[key].adoption,observation());
  assert.deepEqual(generateAdoption(pending),{schema:1,observedProjects:0,totalProjects:0,libraries:[]});
  f.reader.source=async()=>{throw new Error('Recovery must not fetch source');};
  const recovered=await f.platform.deliverAccepted(key);
  assert.equal(recovered.delivery,'ready');assert.deepEqual(recovered.adoption,observation());assert.equal(f.reads(),1);
});


test('current-kit game policy preserves its frozen request and receives observations from the newer publisher',async t=>{
  const requestPolicy='11c54518320b52a659104eaf01d685fe2dd93917',publisherPolicy='c'.repeat(40);
  const f=await publicationFixture(t,text=>text.replace('</dependencies>',dependency()+'</dependencies>'),{requestPolicy,publisherPolicy});
  const preview=await f.platform.prepareIssue(1),frozen=structuredClone(preview.record.frozen);
  const original=PublicationService.prototype.publish;let evidence;
  t.mock.method(PublicationService.prototype,'publish',function(input){evidence=structuredClone(input.evidence);return original.call(this,input);});
  const result=await f.platform.publishIssue(1),state=(await f.registry.read()).state;
  assert.deepEqual(result.adoption,observation());assert.equal(result.release.policyRevision,requestPolicy);
  assert.deepEqual(state.requests[result.requestId].frozen,frozen);assert.equal(result.requestId,digest(frozen));
  assert.equal(evidence.policyRevision,requestPolicy);assert.equal(evidence.provenance.policyRevision,publisherPolicy);
  assert.equal(evidence.adoptionDigest,digest(observation()));
});
