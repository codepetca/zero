import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import maintainedProjects from '../content/projects.json' with {type:'json'};
import {hubProjectsResponse, resolveHubProject} from '../lib/hub-project-status.mjs';
import contracts from '../../extension/src/sharing/contracts.js';
import {hubDiscoveryResponse} from '../lib/hub-discovery.mjs';

test('actual maintained projects remain available under fresh authority and obey repository holds',async()=>{
  assert.ok(maintainedProjects.length);
  for(const project of maintainedProjects) {
    assert.match(project.repositoryId,/^[1-9][0-9]{0,19}$/);
    const visibility={revision:'a'.repeat(40),observedAt:0, isHeld:id=>id===project.repositoryId};
    assert.equal(await resolveHubProject({kind:'game',id:project.id},{visibility}),null);
    const allowed={...visibility,isHeld:()=>false};
    const destinationReader=async url=>{const [,owner,repo]=new URL(url).pathname.split('/');return {repositoryUrl:url,owner,repo,repositoryId:project.repositoryId,ownerId:project.ownerId ?? '7'};};
    const visible=await resolveHubProject({kind:'game',id:project.id},{visibility:allowed,visibilityReader:async()=>allowed,destinationReader});
    assert.equal(visible?.playUrl,project.web?.url);
    assert.equal(visible?.repositoryId,project.repositoryId);
    assert.equal(visible?.repositoryUrl,project.repositoryUrl);
  }
});

// Exercise the real component with a small hook/effect harness and controlled fetches.
// This does not simulate a browser, layout, or live authority.
const source=await readFile(new URL('../components/HubDiscovery.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const project={id:'maintained',title:'Maintained',description:'',author:'owner',repositoryId:'123',ownerId:'7',sourceCommit:'b'.repeat(40),repositoryUrl:'https://github.com/owner/repo'};
const sharedIdentity=contracts.identity('game','235','shared');
const sharedPath=contracts.artifactPath(sharedIdentity,'1.0.0','zip');
const release={schema:1,id:sharedIdentity.id,slug:sharedIdentity.slug,version:'1.0.0',kind:'game',status:'available',title:'Shared',description:'Shared game.',license:'MIT',
  repository:{id:'235',ownerId:'8',owner:'other',name:'game-235',url:'https://github.com/other/game-235'},contributor:{githubId:'8',login:'other'},
  source:{commit:'a'.repeat(40),folder:'.',sha256:'c'.repeat(64)},policyRevision:'d'.repeat(40),controls:'Arrows',
  artifacts:{zip:{path:sharedPath,url:`https://artifacts.example/${sharedPath}`,size:1,sha256:'e'.repeat(64)}},
  web:{provider:'github-pages',url:'https://other.github.io/game-235/',commit:'a'.repeat(40),runId:1}};

const status={id:project.id,kind:'game',repositoryUrl:project.repositoryUrl,stars:null,issuesEnabled:null,site:{status:'unknown'}};
function harness(projects=[project], enforceJamVisibility=true, fakeTimers=false, deferEligibility=false){
  let baseline;let hooks=[], cursor=0, effects=[], params=new URLSearchParams('kind=game');
  const calls=[], listeners={};
  let time=0, nextTimer=0;const timers=new Map();
  const timerSet=fakeTimers?(fn,delay)=>{const id=++nextTimer;timers.set(id,{at:time+delay,fn});return id;}:setTimeout;
  const timerClear=fakeTimers?id=>timers.delete(id):clearTimeout;
  const advance=ms=>{time+=ms;for(const [id,timer] of [...timers])if(timer.at<=time){timers.delete(id);timer.fn();}};
  const window={addEventListener:(name,fn)=>{listeners[`window:${name}`]=fn;},removeEventListener:()=>{}};
  const document={visibilityState:'visible',addEventListener:(name,fn)=>{listeners[`document:${name}`]=fn;},removeEventListener:()=>{},querySelectorAll:()=>[]};
  const element=(type,props)=>({type,props:props||{}});
  const react={useRef(initial){const i=cursor++;if(!(i in hooks))hooks[i]={current:initial};return hooks[i];},useState(initial){const i=cursor++;if(!(i in hooks))hooks[i]=typeof initial==='function'?initial():initial;return [hooks[i],value=>{hooks[i]=typeof value==='function'?value(hooks[i]):value;}];},useEffect(fn,deps){const i=cursor++,old=hooks[i];if(!old||deps.some((v,n)=>v!==old.deps[n])){effects.push(()=>{old?.cleanup?.();hooks[i]={deps,cleanup:fn()};});}}};
  const sharing={selectMaintainedProjects:(items,opts)=>opts.kind==='game'&&!opts.id&&!opts.version?items.filter(item=>item.title.toLowerCase().includes(opts.search.toLowerCase())):[],selectReleases:(catalog,opts)=>catalog.releases.filter(item=>item.kind===opts.kind&&(opts.id?item.id===opts.id&&item.version===opts.version:item.status==='available'&&item.title.toLowerCase().includes(opts.search.toLowerCase()))),projectSummary:x=>x,maintainedPlayLink:()=>'/play',releaseSummary:()=>'',releaseAuthor:()=>'',releaseImage:()=>'',playLink:()=>'/play',sourceLink:()=>'',dependencySnippet:()=>''};
  const card=()=>null;
  const modules={'react':react,'react/jsx-runtime':{jsx:element,jsxs:element,Fragment:'fragment'},'next/navigation':{useSearchParams:()=>params},'next/link':{default:'a'},'@/lib/sharing-client.mjs':sharing,'@/content/projects.json':{default:[project]},'@/content/project-previews.json':{default:{}},'@/content/release-authors.json':{default:{}},'@/app/hub/hub.module.css':{default:{}},'./HubProjectCard':{HubProjectCard:card},'@/lib/hub-metrics-client.mjs':{loadMetricBatches:async()=>{},metricLabel:()=>null}};
  for(const [path,name] of [['./HubPublishedProjects','HubPublishedProjects'],['./CodeBlock','CodeBlock'],['./Icon','Icon'],['./HubProjectInfo','HubProjectInfo'],['./HubProjectFeedback','HubProjectFeedback']])modules[path]={[name]:()=>null,...(path.includes('Feedback')?{HubProjectDetails:()=>null}:{})};
  const exports={};
  vm.runInNewContext(compiled,{exports,require:name=>{if(!(name in modules))throw Error(name);return modules[name];},fetch:(url,options)=>new Promise((resolve,reject)=>{calls.push({url,options,resolve,reject,onReply:data=>{if(url==='/api/hub/discovery')baseline=data;}});if(url.includes('revalidate=1')&&!deferEligibility)resolve({ok:true,json:async()=>baseline});options.signal?.addEventListener('abort',()=>reject(Error('aborted')),{once:true});}),AbortController,AbortSignal,URLSearchParams,Set,Number,Date,Object,Array,JSON,Promise,setTimeout:timerSet,clearTimeout:timerClear,window,document});
  const render=()=>{cursor=0;const tree=exports.HubDiscovery({enforceJamVisibility});const pending=effects;effects=[];pending.forEach(fn=>fn());return tree;};
  const cards=tree=>{const found=[];function walk(node){if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(walk);return;}if(node.type===card)found.push(node.props.title);walk(node.props?.children);}walk(tree);return found;};
  const search=tree=>{let input;function walk(node){if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(walk);return;}if(node.type==='input'&&node.props.id==='sharing-search')input=node;walk(node.props?.children);}walk(tree);return value=>input.props.onChange({target:{value}});};
  return {render,cards,calls,advance,search,setQuery:q=>{params=new URLSearchParams(q);},fire:name=>listeners[name]?.(),document};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const reply=(call,data,ok=true)=>{call.onReply?.(data);call.resolve({ok,json:async()=>data});};

const envelope=(maintained=[project],releases=[release])=>({schema:1,maintained,presentation:[],catalog:{schema:1,releases}});
const discoveries=h=>h.calls.filter(call=>call.url.includes('/api/hub/discovery')&&!call.url.includes('revalidate=1'));
const statuses=h=>h.calls.filter(call=>call.url.includes('/api/hub/projects'));
const latest=calls=>calls.at(-1);
async function initial(h, data=envelope()) {
  h.render(); reply(latest(discoveries(h)),data); await tick(); h.render();
}

test('maintained games require matching authority while shared cards remain independent',async()=>{
  const h=harness();assert.deepEqual(h.cards(h.render()),[]);
  assert.equal(discoveries(h)[0].url,'/api/hub/discovery');assert.equal(statuses(h).length,0);
  reply(discoveries(h)[0],envelope());await tick();assert.deepEqual(h.cards(h.render()),[]);
  assert.match(latest(statuses(h)).url,/ids=maintained%2Cgame-r235-shared/);
  reply(latest(statuses(h)),{schema:1,items:[status]});await tick();assert.deepEqual(h.cards(h.render()),['Maintained','Shared']);
  h.fire('window:focus');assert.deepEqual(h.cards(h.render()),[]);
  reply(latest(discoveries(h)),envelope());await tick();assert.deepEqual(h.cards(h.render()),[]);
  reply(latest(statuses(h)),{schema:1,items:[{...status,repositoryUrl:'https://github.com/evil/repo'}]});await tick();
  assert.deepEqual(h.cards(h.render()),['Shared']);
  h.fire('window:focus');h.render();reply(latest(discoveries(h)),envelope());await tick();h.render();
  reply(latest(statuses(h)),{},false);await tick();assert.deepEqual(h.cards(h.render()),[]);
});

test('status requests respect the 12 ID endpoint limit and fail closed across batches',async()=>{
  const projects=Array.from({length:13},(_,i)=>({...project,id:`maintained-${i}`,title:`Project ${i}`}));
  const h=harness(projects);await initial(h,envelope(projects,[]));
  const batches=statuses(h);assert.equal(batches.length,2);
  assert.deepEqual(batches.map(call=>new URL(call.url,'https://zero.example').searchParams.get('ids').split(',').length),[12,1]);
  reply(batches[0],{schema:1,items:projects.slice(0,12).map(item=>({...status,id:item.id}))});
  reply(batches[1],{},false);await tick();assert.deepEqual(h.cards(h.render()),[]);
});

test('focus and visibility regain revalidate discovery and reject late responses',async()=>{
  const h=harness();await initial(h);reply(latest(statuses(h)),{schema:1,items:[status]});await tick();
  assert.deepEqual(h.cards(h.render()),['Maintained','Shared']);
  h.fire('window:focus');h.fire('document:visibilitychange');assert.deepEqual(h.cards(h.render()),[]);
  assert.equal(discoveries(h).length,2);const old=latest(discoveries(h));
  h.fire('window:blur');h.fire('window:focus');h.fire('document:visibilitychange');assert.deepEqual(h.cards(h.render()),[]);
  const current=latest(discoveries(h));assert.notEqual(current,old);
  reply(old,envelope());await tick();assert.deepEqual(h.cards(h.render()),[]);
  reply(current,{},false);await tick();assert.deepEqual(h.cards(h.render()),[]);
  h.document.visibilityState='hidden';h.fire('document:visibilitychange');h.render();
  const before=discoveries(h).length;h.document.visibilityState='visible';h.fire('document:visibilitychange');h.fire('window:focus');
  assert.deepEqual(h.cards(h.render()),[]);assert.equal(discoveries(h).length,before+1);
  reply(latest(discoveries(h)),envelope());await tick();assert.deepEqual(h.cards(h.render()),[]);
  reply(latest(statuses(h)),{schema:1,items:[status]});await tick();assert.deepEqual(h.cards(h.render()),['Maintained','Shared']);
});

test('inactive mode waits for the envelope but not status, including after focus',async()=>{
  const h=harness([project],false);assert.deepEqual(h.cards(h.render()),[]);
  reply(latest(discoveries(h)),envelope());await tick();assert.deepEqual(h.cards(h.render()),['Maintained','Shared']);
  reply(latest(statuses(h)),{},false);await tick();assert.deepEqual(h.cards(h.render()),['Maintained','Shared']);
  h.fire('window:focus');assert.deepEqual(h.cards(h.render()),[]);
  reply(latest(discoveries(h)),envelope());await tick();assert.deepEqual(h.cards(h.render()),['Maintained','Shared']);
  reply(latest(statuses(h)),{},false);await tick();
});

test('navigation and return to an earlier query never reuse an old discovery',async()=>{
  const h=harness();await initial(h);reply(latest(statuses(h)),{schema:1,items:[status]});await tick();
  assert.deepEqual(h.cards(h.render()),['Maintained','Shared']);
  h.setQuery('kind=practice');assert.deepEqual(h.cards(h.render()),[]);const practice=latest(discoveries(h));
  assert.equal(practice.url,'/api/hub/discovery?practice=1');
  h.setQuery('kind=game');assert.deepEqual(h.cards(h.render()),[]);const returned=latest(discoveries(h));
  reply(practice,envelope());await tick();assert.deepEqual(h.cards(h.render()),[]);
  reply(returned,{},false);await tick();assert.deepEqual(h.cards(h.render()),[]);
});

test('active search debounces discovery, hides stale results and focus refreshes immediately',async()=>{
  const h=harness([project],true,true);await initial(h);reply(latest(statuses(h)),{schema:1,items:[status]});await tick();let tree=h.render();
  assert.deepEqual(h.cards(tree),['Maintained','Shared']);const base=discoveries(h).length;
  h.search(tree)('a');tree=h.render();assert.deepEqual(h.cards(tree),[]);
  h.advance(200);h.search(tree)('ai');tree=h.render();h.advance(299);
  assert.equal(discoveries(h).length,base);assert.deepEqual(h.cards(h.render()),[]);
  h.advance(1);assert.equal(discoveries(h).length,base+1);const delayed=latest(discoveries(h));
  h.search(tree)('');tree=h.render();assert.deepEqual(h.cards(tree),[]);
  const before=discoveries(h).length;h.fire('window:focus');h.render();assert.equal(discoveries(h).length,before+1);
  reply(delayed,envelope());await tick();assert.deepEqual(h.cards(h.render()),[]);
  reply(latest(discoveries(h)),{},false);await tick();assert.deepEqual(h.cards(h.render()),[]);
});

test('inactive search filters locally and debounces status; focus bypasses the delay',async()=>{
  const h=harness([project],false,true);await initial(h);reply(latest(statuses(h)),{schema:1,items:[status]});await tick();let tree=h.render();
  const discoveryCount=discoveries(h).length,statusCount=statuses(h).length;
  h.search(tree)('a');tree=h.render();assert.deepEqual(h.cards(tree),['Maintained','Shared']);
  h.advance(100);h.search(tree)('ai');tree=h.render();assert.deepEqual(h.cards(tree),['Maintained']);
  h.advance(299);assert.equal(statuses(h).length,statusCount);h.advance(1);assert.equal(statuses(h).length,statusCount+1);
  assert.equal(discoveries(h).length,discoveryCount);
  h.search(tree)('ain');tree=h.render();const before=discoveries(h).length;
  h.fire('window:focus');assert.deepEqual(h.cards(h.render()),[]);assert.equal(discoveries(h).length,before+1);
  reply(latest(discoveries(h)),envelope());await tick();assert.deepEqual(h.cards(h.render()),['Maintained']);
  reply(latest(statuses(h)),{},false);await tick();
});

const eligibilities=h=>h.calls.filter(call=>call.url.includes('revalidate=1'));
const identity=({id,repositoryId,ownerId,repositoryUrl,sourceCommit})=>({id,repositoryId,ownerId,repositoryUrl,sourceCommit});

test('a hold accepted between parallel status batches is checked across the whole generation before maintained cards appear',async()=>{
  const projects=Array.from({length:13},(_,i)=>({...project,id:`maintained-${i}`,title:`Maintained ${i}`,
    repositoryId:String(321+i),repositoryUrl:`https://github.com/owner/repo-${321+i}`}));
  const h=harness(projects,true,false,true);await initial(h,envelope(projects));
  const batches=statuses(h);assert.equal(batches.length,2);
  const replies=batch=>new URL(batch.url,'https://zero.example').searchParams.get('ids').split(',')
    .filter(id=>projects.some(p=>p.id===id)).map(id=>({...status,id,repositoryUrl:projects.find(p=>p.id===id).repositoryUrl}));
  reply(batches[0],{schema:1,items:replies(batches[0])});await tick();
  assert.equal(eligibilities(h).length,0);assert.deepEqual(h.cards(h.render()),[]);
  // The first batch was allowed, then a hold is accepted while the last waits.
  reply(batches[1],{schema:1,items:replies(batches[1])});await tick();
  assert.equal(eligibilities(h).length,1);assert.deepEqual(h.cards(h.render()),[]);
  const final=latest(eligibilities(h));
  const response=await hubDiscoveryResponse(new Request(`https://zero.example${final.url}`),{
    projects,visibilityReader:async()=>({revision:'a'.repeat(40),observedAt:0, isHeld:id=>id==='321'}),
    destinationReader:async url=>{const [,owner,repo]=new URL(url).pathname.split('/');return {repositoryUrl:url,owner,repo,repositoryId:repo.slice(5),ownerId:owner==='other'?'8':'7'};},
    catalogReader:async()=>({schema:1,revision:'a'.repeat(40),releases:[release]})});
  final.resolve(response);await tick();
  assert.deepEqual(h.cards(h.render()),[...projects.slice(1).map(p=>p.title),'Shared']);
});

test('final identity intersection rejects stale source, repository, owner and URL while preserving unrelated shared cards',async()=>{
  for(const changed of [{repositoryId:'999'},{ownerId:'8'},{repositoryUrl:'https://github.com/other/repo'},{sourceCommit:'c'.repeat(40)}]) {
    const h=harness([project],true,false,true);await initial(h);reply(latest(statuses(h)),{schema:1,items:[status]});await tick();
    assert.deepEqual(h.cards(h.render()),[]);
    reply(latest(eligibilities(h)),envelope([{...identity(project),...changed}]));await tick();
    assert.deepEqual(h.cards(h.render()),['Shared']);
  }
});

test('final eligibility failures never expose a partial maintained generation',async()=>{
  for(const data of [null,envelope([identity(project),identity(project)]),
    envelope([{...identity(project),id:null}]),
    envelope([{...identity(project),repositoryId:undefined}])]) {
    const h=harness([project],true,false,true);await initial(h);reply(latest(statuses(h)),{schema:1,items:[status]});await tick();
    reply(latest(eligibilities(h)),data,data!==null);await tick();assert.deepEqual(h.cards(h.render()),[]);
  }
});

test('query and focus retire pending final checks and inactive, practice and library browsing do not request them',async()=>{
  for(const navigate of [false,true]) {
    const h=harness([project],true,false,true);await initial(h);reply(latest(statuses(h)),{schema:1,items:[status]});await tick();
    const old=latest(eligibilities(h));
    if(navigate)h.setQuery('kind=practice');else h.fire('window:focus');
    h.render();assert.equal(old.options.signal.aborted,true);
    reply(old,envelope());await tick();assert.deepEqual(h.cards(h.render()),[]);
    reply(latest(discoveries(h)),envelope([],[]));await tick();h.render();
  }
  for(const [enforced,kind] of [[false,'game'],[true,'practice'],[true,'library']]) {
    const h=harness([project],enforced,false,true);h.setQuery(`kind=${kind}`);await initial(h);
    if(statuses(h).length){reply(latest(statuses(h)),{schema:1,items:[status]});await tick();}
    assert.equal(eligibilities(h).length,0,`${enforced}/${kind}`);
  }
});

test('the client carries forty maximum-length maintained IDs through real status and final eligibility handlers',async()=>{
  const projects=Array.from({length:40},(_,i)=>({...project,id:`id${i}`.padEnd(128,'a'),title:`Maintained ${i}`,
    repositoryId:String(321+i),repositoryUrl:`https://github.com/owner/repo-${321+i}`}));
  for(const active of [true,false]) {
    const visibilityReader=async()=>active?{revision:'a'.repeat(40),observedAt:0, isHeld:()=>false}:null;
    const destinationReader=async url=>{assert.equal(active,true);const [,owner,repo]=new URL(url).pathname.split('/');
      return {repositoryUrl:url,owner,repo,repositoryId:repo.slice(5),ownerId:'7'};};
    const service={resolve:async({id})=>({...projects.find(project=>project.id===id),kind:'game'}),
      statusTarget:async target=>({...target,stars:null,issuesEnabled:null,site:{status:'unknown'}})};
    const h=harness(projects,active,false,true);await initial(h,envelope(projects,[]));
    assert.equal(statuses(h).length,4);
    for(const call of statuses(h)) {
      const response=await hubProjectsResponse(new Request(`https://zero.example${call.url}`),{service,visibilityReader,destinationReader});
      assert.equal(response.status,200);call.resolve(response);
    }
    await tick();
    if(active) {
      assert.deepEqual(h.cards(h.render()),[]);assert.equal(eligibilities(h).length,1);
      const final=latest(eligibilities(h));
      const response=await hubDiscoveryResponse(new Request(`https://zero.example${final.url}`),{
        projects,visibilityReader,destinationReader,catalogReader:async()=>({schema:1,revision:'a'.repeat(40),releases:[]})});
      assert.equal(response.status,200);final.resolve(response);await tick();
    } else assert.equal(eligibilities(h).length,0);
    assert.deepEqual(h.cards(h.render()),projects.map(p=>p.title));
  }
});

const sharedGame=(repositoryId,title)=>{
  const identity=contracts.identity('game',repositoryId,'shared'),path=contracts.artifactPath(identity,release.version,'zip');
  return {...release,id:identity.id,title,repository:{...release.repository,id:repositoryId,name:`game-${repositoryId}`,url:`https://github.com/other/game-${repositoryId}`},
    artifacts:{zip:{...release.artifacts.zip,path,url:`https://artifacts.example/${path}`}}};
};
const sharedStatus=game=>({...status,id:game.id,repositoryUrl:game.repository.url});
const catalogSnapshot=games=>({schema:1,revision:'a'.repeat(40),releases:games});
const currentDestination=async url=>{const [,owner,repo]=new URL(url).pathname.split('/');return {repositoryUrl:url,owner,repo,
  repositoryId:repo.startsWith('game-')?repo.slice(5):'235',ownerId:owner==='other'?'8':'7'};};

test('final full-gallery authority removes held shared-only games across batches while preserving another source at the same Pages URL',async()=>{
  const games=Array.from({length:13},(_,i)=>sharedGame(String(235+i),`Shared ${i}`));
  const h=harness([],true,false,true);await initial(h,envelope([],games));
  const batches=statuses(h);assert.equal(batches.length,2);
  const rows=call=>new URL(call.url,'https://zero.example').searchParams.get('ids').split(',').map(id=>sharedStatus(games.find(game=>game.id===id)));
  reply(batches[0],{schema:1,items:rows(batches[0])});await tick();assert.equal(eligibilities(h).length,0);
  assert.deepEqual(h.cards(h.render()),[]);
  reply(batches[1],{schema:1,items:rows(batches[1])});await tick();assert.equal(eligibilities(h).length,1);
  const final=latest(eligibilities(h));
  const response=await hubDiscoveryResponse(new Request(`https://zero.example${final.url}`),{projects:[],
    catalogReader:async()=>catalogSnapshot(games),destinationReader:currentDestination,
    visibilityReader:async()=>({revision:'a'.repeat(40),observedAt:0, isHeld:id=>id==='235'})});
  assert.equal(response.status,200);final.resolve(response);await tick();
  assert.deepEqual(h.cards(h.render()),games.slice(1).map(game=>game.title));
  assert.equal(games[0].web.url,games[1].web.url,'The unchanged shared Pages URL must not group different repository holds');
});

test('one final authority check gates maintained and shared identities for the same newly held repository',async()=>{
  const maintained={...project,repositoryId:'235',ownerId:'8',repositoryUrl:release.repository.url};
  const games=Array.from({length:13},(_,i)=>sharedGame(String(235+i),`Shared ${i}`));
  const h=harness([maintained],true,false,true);await initial(h,envelope([maintained],games));
  for(const call of statuses(h)) {
    const ids=new URL(call.url,'https://zero.example').searchParams.get('ids').split(',');
    reply(call,{schema:1,items:ids.map(id=>id===maintained.id?{...status,repositoryUrl:maintained.repositoryUrl}:sharedStatus(games.find(game=>game.id===id)))});
  }
  await tick();const final=latest(eligibilities(h));assert.ok(final);assert.deepEqual(h.cards(h.render()),[]);
  const response=await hubDiscoveryResponse(new Request(`https://zero.example${final.url}`),{projects:[maintained],
    catalogReader:async()=>catalogSnapshot(games),destinationReader:currentDestination,
    visibilityReader:async()=>({revision:'a'.repeat(40),observedAt:0, isHeld:id=>id==='235'})});
  assert.equal(response.status,200);final.resolve(response);await tick();
  assert.deepEqual(h.cards(h.render()),games.slice(1).map(game=>game.title));
});

test('shared-only final intersection rejects changed release version, status, source identity and displayed destination',async()=>{
  const changes=[{version:'2.0.0'},{status:'withdrawn'},{source:{...release.source,commit:'c'.repeat(40)}},
    {repository:{...release.repository,id:'999'}},{repository:{...release.repository,ownerId:'9'}},
    {repository:{...release.repository,url:'https://github.com/other/replaced'}},
    {web:{...release.web,url:'https://other.github.io/replaced/'}},{web:{...release.web,runId:2}}];
  for(const changed of changes) {
    const h=harness([],true,false,true);await initial(h,envelope([], [release]));
    reply(latest(statuses(h)),{schema:1,items:[sharedStatus(release)]});await tick();assert.deepEqual(h.cards(h.render()),[]);
    reply(latest(eligibilities(h)),envelope([],[{...release,...changed}]));await tick();assert.deepEqual(h.cards(h.render()),[]);
  }
});

test('exact withdrawn shared-only cards require final authority even without any status IDs',async()=>{
  const withdrawn={...release,status:'withdrawn'};
  for(const held of [false,true]) {
    const h=harness([],true,false,true);h.setQuery(`kind=game&id=${release.id}&version=${release.version}`);
    await initial(h,envelope([],[withdrawn]));await tick();
    assert.equal(statuses(h).length,0);assert.equal(eligibilities(h).length,1);assert.deepEqual(h.cards(h.render()),[]);
    const final=latest(eligibilities(h));
    const response=await hubDiscoveryResponse(new Request(`https://zero.example${final.url}`),{projects:[],
      catalogReader:async()=>catalogSnapshot([withdrawn]),destinationReader:currentDestination,
      visibilityReader:async()=>({revision:'a'.repeat(40),observedAt:0, isHeld:()=>held})});
    assert.equal(response.status,200);final.resolve(response);await tick();
    assert.deepEqual(h.cards(h.render()),held?[]:['Shared']);
  }
});

test('a failed final shared-only projection and late prior-generation reply cannot disclose game cards',async()=>{
  const h=harness([],true,false,true);await initial(h,envelope([],[release]));
  reply(latest(statuses(h)),{schema:1,items:[sharedStatus(release)]});await tick();const old=latest(eligibilities(h));
  h.fire('window:focus');h.render();assert.equal(old.options.signal.aborted,true);
  reply(old,envelope([],[release]));await tick();assert.deepEqual(h.cards(h.render()),[]);
  reply(latest(discoveries(h)),envelope([],[release]));await tick();h.render();
  reply(latest(statuses(h)),{schema:1,items:[sharedStatus(release)]});await tick();
  reply(latest(eligibilities(h)),null,false);await tick();assert.deepEqual(h.cards(h.render()),[]);
});

test('a final catalog outage shows retry and preserves independently verified maintained cards instead of claiming an empty shared gallery',async()=>{
  for(const hasMaintained of [false,true]) {
    const maintained=hasMaintained?[project]:[];
    const h=harness(maintained,true,false,true);await initial(h,envelope(maintained,[release]));
    const rows=[...(hasMaintained?[status]:[]),sharedStatus(release)];
    reply(latest(statuses(h)),{schema:1,items:rows});await tick();
    reply(latest(eligibilities(h)),{schema:1,maintained,presentation:[],catalog:null,catalogError:'The shared source is unavailable.'});await tick();
    const failed=h.render();assert.deepEqual(h.cards(failed),hasMaintained?['Maintained']:[]);
    assert.match(JSON.stringify(failed),/Project availability is unavailable\. Try again shortly\./);
    assert.doesNotMatch(JSON.stringify(failed),/No projects are available yet\.|No projects match this search\./);
    let retry;
    const visit=node=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(visit);return;}
      if(node.type==='button'&&node.props?.children==='Try again')retry=node;visit(node.props?.children);};
    visit(failed);assert.ok(retry);retry.props.onClick();h.render();
    assert.deepEqual(h.cards(h.render()),[]);
    reply(latest(discoveries(h)),envelope(maintained,[release]));await tick();h.render();
    reply(latest(statuses(h)),{schema:1,items:rows});await tick();
    reply(latest(eligibilities(h)),envelope(maintained,[release]));await tick();
    const recovered=h.render();assert.deepEqual(h.cards(recovered),[...(hasMaintained?['Maintained']:[]),'Shared']);
    assert.doesNotMatch(JSON.stringify(recovered),/Project availability is unavailable/);
  }
});
