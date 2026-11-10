import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source=await readFile(new URL('../components/HubDiscovery.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const project={id:'maintained',title:'Maintained',description:'A game.',author:'owner',repositoryId:'123',ownerId:'7',sourceCommit:'b'.repeat(40),repositoryUrl:'https://github.com/owner/repo'};
const release={id:'shared',version:'1',kind:'game',status:'available',title:'Shared',repository:{id:'235',ownerId:'8',url:'https://github.com/other/repo'},source:{commit:'a'.repeat(40)}};
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
  const sharing={selectMaintainedProjects:(items,opts)=>opts.kind==='game'&&!opts.id&&!opts.version?items.filter(x=>x.title.toLowerCase().includes(opts.search.toLowerCase())):[],selectReleases:catalog=>catalog.releases,projectSummary:x=>x,maintainedPlayLink:p=>p.web?.url,releaseSummary:(r,p)=>p.find(x=>x.id===r.id&&x.sourceCommit===r.source.commit)?.description||r.description,releaseAuthor:(r,a)=>a.find(x=>x.id===r.id&&x.sourceCommits.includes(r.source.commit))?.author||'fallback',releaseImage:(r,p)=>p.find(x=>x.id===r.id&&x.sourceCommit===r.source.commit)?.image,playLink:()=>'/play',sourceLink:()=>'',dependencySnippet:()=>''};
  const card=()=>null;
  const modules={'react':react,'react/jsx-runtime':{jsx:element,jsxs:element,Fragment:'fragment'},'next/navigation':{useSearchParams:()=>params},'next/link':{default:'a'},'@/lib/sharing-client.mjs':sharing,'@/content/projects.json':{default:[project]},'@/content/project-previews.json':{default:{}},'@/content/release-authors.json':{default:{}},'@/app/hub/hub.module.css':{default:{}},'./HubProjectCard':{HubProjectCard:card},'@/lib/hub-metrics-client.mjs':{loadMetricBatches:async()=>{},metricLabel:()=>null}};
  for(const [path,name] of [['./HubPublishedProjects','HubPublishedProjects'],['./CodeBlock','CodeBlock'],['./Icon','Icon'],['./HubProjectInfo','HubProjectInfo'],['./HubProjectFeedback','HubProjectFeedback']])modules[path]={[name]:()=>null,...(path.includes('Feedback')?{HubProjectDetails:()=>null}:{})};
  const exports={};
  vm.runInNewContext(compiled,{exports,require:name=>{if(!(name in modules))throw Error(name);return modules[name];},fetch:(url,options)=>new Promise((resolve,reject)=>{calls.push({url,options,resolve,reject,onReply:data=>{if(url==='/api/hub/discovery')baseline=data;}});if(url.includes('revalidate=1')&&!deferEligibility)resolve({ok:true,json:async()=>baseline});options.signal?.addEventListener('abort',()=>reject(Error('aborted')),{once:true});}),AbortController,AbortSignal,URLSearchParams,Set,Number,Date,Object,Array,JSON,Promise,setTimeout:timerSet,clearTimeout:timerClear,window,document});
  const render=(props={})=>{cursor=0;const tree=exports.HubDiscovery({enforceJamVisibility,...props});const pending=effects;effects=[];pending.forEach(fn=>fn());return tree;};
  const cards=tree=>{const found=[];function walk(node){if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(walk);return;}if(node.type===card)found.push(node.props);walk(node.props?.children);}walk(tree);return found;};
  const search=tree=>{let input;function walk(node){if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(walk);return;}if(node.type==='input'&&node.props.id==='sharing-search')input=node;walk(node.props?.children);}walk(tree);return value=>input.props.onChange({target:{value}});};
  return {render,cards,calls,advance,search,setQuery:q=>{params=new URLSearchParams(q);},fire:name=>listeners[name]?.(),document};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const reply=(call,data,ok=true)=>{call.onReply?.(data);call.resolve({ok,json:async()=>data});};


const envelope=(maintained=[project],catalog={schema:1,releases:[]},presentation=[])=>({schema:1,maintained,catalog,presentation});
const discovery=h=>h.calls.filter(call=>call.url.includes('/api/hub/discovery')&&!call.url.includes('revalidate=1')).at(-1);
const statuses=h=>h.calls.filter(call=>call.url.includes('/api/hub/projects')).at(-1);

test('endpoint supplies maintained cards independently of catalog failure without inventing play links',async()=>{
  const h=harness();assert.equal(h.cards(h.render()).length,0);
  assert.equal(discovery(h).url,'/api/hub/discovery');assert.equal(discovery(h).options.cache,'no-store');
  reply(discovery(h),envelope([project],null));await tick();
  assert.equal(h.cards(h.render())[0].title,'Maintained');
  reply(statuses(h),{schema:1,items:[status]});await tick();
  const cards=h.cards(h.render());assert.equal(cards.length,1);assert.equal(cards[0].title,'Maintained');assert.equal(cards[0].playHref,undefined);
});

test('Projects show the public card before status, then add Play and stars after revalidation',async()=>{
  const h=harness([project],true,false,true);
  const published={...project,web:{provider:'github-pages',url:'https://owner.github.io/repo/',commit:project.sourceCommit,runId:1}};
  h.render();
  assert.equal(statuses(h),undefined);
  reply(discovery(h),envelope([published]));await tick();
  const [pending]=h.cards(h.render());
  assert.equal(pending.title,'Maintained');
  assert.equal(pending.playHref,undefined);
  assert.equal(pending.siteReachable,false);
  assert.equal(pending.feedback(),null);
  assert.equal(pending.feedback('Author','A game.','details').props.children.props.pending,true);

  reply(statuses(h),{schema:1,items:[{...status,stars:4,issuesEnabled:true,site:{status:'reachable'}}]});await tick();
  assert.equal(h.cards(h.render())[0].playHref,undefined);
  reply(h.calls.find(call=>call.url.includes('revalidate=1')),envelope([published]));await tick();
  const [ready]=h.cards(h.render());
  assert.equal(ready.playHref,published.web.url);
  assert.equal(ready.siteReachable,true);
  assert.equal(ready.feedback().props.feedback.stars,4);
  assert.equal(ready.feedback('Author','A game.','details').props.children.props.pending,false);
  assert.equal(ready.feedback('Author','A game.','details').props.children.props.feedback.issuesEnabled,true);
});

test('Projects do not render cards or request status from a failed or ambiguous initial discovery',async()=>{
  for (const [response,ok] of [[envelope([project]),false],[envelope([project,project]),true],
    [envelope([{...project,repositoryId:undefined}]),true]]) {
    const h=harness();h.render();reply(discovery(h),response,ok);await tick();
    assert.deepEqual(h.cards(h.render()),[]);
    assert.equal(statuses(h),undefined);
  }
});

test('focus and query changes retire old responses; practice uses the dedicated projection',async()=>{
  const h=harness();h.render();const old=discovery(h);
  h.setQuery('kind=practice');assert.equal(h.cards(h.render()).length,0);const practice=discovery(h);
  assert.equal(practice.url,'/api/hub/discovery?practice=1');
  reply(old,envelope());await tick();assert.equal(h.cards(h.render()).length,0);
  reply(practice,envelope([], {schema:1,releases:[]}));await tick();h.render();
  h.setQuery('kind=game');h.render();const beforeFocus=discovery(h);
  h.fire('window:focus');assert.equal(h.cards(h.render()).length,0);const afterFocus=discovery(h);
  assert.notEqual(beforeFocus,afterFocus);reply(beforeFocus,envelope());await tick();assert.equal(h.cards(h.render()).length,0);
  reply(afterFocus,envelope([], {schema:1,releases:[]}));await tick();assert.equal(h.cards(h.render()).length,0);
});

test('component does not import server-owned discovery metadata',()=>{
  assert.doesNotMatch(source, /@\/content\/(?:projects|project-previews|release-authors)\.json/);
});

test('My Libraries uses the signed-in owner ID before looking up release status',async()=>{
  const h=harness([],false);
  h.setQuery('kind=library&view=mine');
  const render=()=>h.render({libraryOwnerId:'8'});
  render();
  const mine={...release,kind:'library',id:'mine',title:'My release',artifacts:{}};
  const other={...mine,id:'other',title:'Another release',repository:{...mine.repository,ownerId:'9'}};
  reply(discovery(h),envelope([], {schema:1,releases:[mine,other]}));await tick();
  assert.deepEqual(h.cards(render()).map(card=>card.title),['My release']);
  assert.equal(new URL(statuses(h).url,'https://zero.test').searchParams.get('ids'),'mine');
  reply(statuses(h),{schema:1,items:[]});await tick();
});

test('presentation metadata is mapped by release ID and source commit',async()=>{
  const h=harness([],false);h.render();
  reply(discovery(h),envelope([], {schema:1,releases:[release]},[
    {id:'shared',sourceCommit:'old',description:'Old',author:'Old',image:'/old.png'},
    {id:'shared',sourceCommit:'a'.repeat(40),description:'Current',author:'Current author',image:'/current.png'}
  ]));await tick();const cards=h.cards(h.render());
  assert.equal(cards[0].description,'Current');assert.equal(cards[0].author,'Current author');assert.equal(cards[0].image,'/current.png');
  reply(statuses(h),{schema:1,items:[]});await tick();
});
