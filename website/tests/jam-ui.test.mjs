import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
import ts from 'typescript';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
const clientSource=await readFile(new URL('../components/JamClient.tsx',import.meta.url),'utf8');
const panelSource=await readFile(new URL('../app/hub/jams/[id]/panel/route.ts',import.meta.url),'utf8');
function compile(source){return ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;}
function clientRequire(name) {
  if(name==='@/app/hub/hub.module.css')return {default:{}};
  if(name==='./Icon')return {Icon:()=>null};
  return require(name);
}
function harness({storage=new Map(),fetcher=async()=>{throw new Error('network');},participateData=null,refreshImpl=null}={}) {
  let actor={id:'12',login:'creator',csrfToken:'csrf'},index=0,slots=[],effects=[],directory;
  const self={},window={self,top:self};
  const react={createContext:defaultValue=>({defaultValue,Provider:()=>null}),useContext:ctx=>directory??ctx.defaultValue,useRef(value){const i=index++;return slots[i]??(slots[i]={current:value});},useState(value){const i=index++;if(!(i in slots))slots[i]=value;return [slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];},useCallback(fn){index++;return fn;},useEffect(fn){index++;effects.push(fn);}};
  const module={exports:{}};
  const context={participateData,refreshImpl,module,exports:module.exports,require(name){if(name==='react')return react;if(name==='./JamPreparation')return {JamPreparation:()=>null};if(name==='./HubGitHub')return {useHubGitHub:()=>({user:actor}),HubAccount:()=>null};if(name==='next/link')return {default:()=>null};return clientRequire(name);},window,crypto:webcrypto,sessionStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},fetch:(...args)=>fetcher(...args),AbortSignal,Response,Request,URL,Map,console};
  vm.runInNewContext(compile(clientSource)+'\nif(participateData){useResource=()=>({data:participateData?.testError?null:participateData,error:participateData?.testError||"",loading:false,refresh:refreshImpl|| (async()=>{})});useTopLevel=()=>true;}exports.testing={useDraft,EventFacts,EventStatus,Proposal,useMutation,useResource,JamHelpLink,JamCreate,JamCreationPane,JamDirectoryProvider,JamDiscovery,jamTimeRemaining,CreatorCancel,JamParticipate:JamParticipateForm,JamParticipateWrapper:JamParticipate,ApprovedVersions,JamDetail,HeldEntryModeration,ModerationInbox,JamAccountTools};',context);
  return {render(kind='useMutation',path='/api/jams/jam-42/actions',discardOnError=false){index=0;return module.exports.testing[kind](path,discardOnError);},renderDraft(name,initial,initializeFresh){index=0;return module.exports.testing.useDraft(name,initial,initializeFresh);},flushEffects(){const work=effects;effects=[];for(const fn of work)fn();},setActor(value){actor=value;},setDirectory(value){directory=value;},setDetail(value){context.participateData=value;},frame(){window.top={};},storage};
}
function elements(node) {
  if(Array.isArray(node))return node.flatMap(elements);
  if(!node||typeof node!=='object')return [];
  return [node,...elements(node.props?.children)];
}
function confirmed(init){const body=JSON.parse(init.body);return Response.json({configured:true,eventId:'jam-42',operationId:body.operationId});}
test('a gallery with unavailable verification reports incompleteness rather than claiming no submissions',()=>{
  const event={id:'jam-42',type:'game',title:'Jam',summary:'A jam',theme:'Play',rules:'Be kind',eligibility:'Everyone',timezone:'UTC',
    schedule:{galleryRevealAt:'2020-01-05T00:00:00Z'},revision:'a',moderation:{status:'active'},registrationOpen:false,
    submissionsOpen:false,participantCount:1,participants:[],entries:[],galleryIncomplete:true};
  const h=harness({participateData:{event,registration:null,entry:null,canMaintain:false}});
  const nodes=elements(h.render('JamDetail',{id:'jam-42'}));
  assert.ok(nodes.some(node=>node.props?.role==='status'&&String(node.props.children).includes('Some submissions could not be verified')));
  assert.ok(nodes.some(node=>node.type==='p'&&node.props.children==='No verified submissions are available right now.'));
  assert.equal(nodes.some(node=>node.type==='p'&&node.props.children==='No active submissions yet.'),false);
});
test('gallery navigation permits rechecking the current page and returning to earlier pages',()=>{
  const event={id:'jam-42',type:'game',title:'Jam',summary:'A jam',theme:'Play',rules:'Be kind',eligibility:'Everyone',timezone:'UTC',
    schedule:{galleryRevealAt:'2020-01-05T00:00:00Z'},revision:'a',moderation:{status:'active'},registrationOpen:false,
    submissionsOpen:false,participantCount:1,participants:[],entries:[],galleryIncomplete:true};
  const h=harness({participateData:{event,registration:null,entry:null,canMaintain:false,nextCursor:'opaque-cursor'}});
  const render=()=>elements(h.render('JamDetail',{id:'jam-42'}));
  assert.ok(render().find(node=>node.type==='button'&&node.props.children==='Retry verification for this page'));
  render().find(node=>node.type==='button'&&node.props.children==='Next gallery page').props.onClick();
  assert.ok(render().find(node=>node.type==='button'&&node.props.children==='Start gallery again'));
  render().find(node=>node.type==='button'&&node.props.children==='Previous gallery page').props.onClick();
  assert.equal(render().some(node=>node.type==='button'&&node.props.children==='Start gallery again'),false);
});
test('a failed gallery refresh discards previously verified page data',async()=>{
  let fail=false;
  const h=harness({fetcher:async()=>fail?Response.json({error:'Start again'},{status:409}):Response.json({configured:true,event:{title:'Previous page'}})});
  const render=()=>h.render('useResource','/api/jams/jam-42?view=gallery',true);
  await render().refresh();assert.equal(render().data.event.title,'Previous page');
  fail=true;await render().refresh();assert.equal(render().data,null);assert.match(render().error,/Start again/);
});
test('host judging controls stay available when the public gallery fails',()=>{
  const h=harness({participateData:{testError:'Public gallery unavailable'}});
  const tools=elements(h.render('JamDetail',{id:'jam-42'})).find(node=>node.type?.name==='JamAccountTools');
  assert.ok(tools);
  h.setDetail({canPickWinner:true,canMaintain:false});
  const account=()=>elements(h.render('JamAccountTools',tools.props));
  assert.ok(account().some(node=>node.type?.name==='WinnerPicker'));
  h.setDetail({canMaintain:true});
  assert.ok(account().some(node=>node.type?.name==='ModerationInbox'));
  assert.ok(!account().some(node=>node.type?.name==='WinnerPicker'));
});
test('winner confirmation refreshes the account view and returns from a changed gallery page',async()=>{
  const event={id:'jam-42',type:'game',title:'Jam',summary:'A jam',theme:'Play',rules:'Be kind',eligibility:'Everyone',
    timezone:'UTC',schedule:{},revision:'a',moderation:{status:'active'},registrationOpen:false,
    submissionsOpen:false,participantCount:0,participants:[],entries:[]};
  const h=harness({participateData:{event,canPickWinner:true,nextCursor:'opaque-cursor'}});
  const render=()=>elements(h.render('JamDetail',{id:'jam-42'}));
  const account=()=>render().find(node=>node.type?.name==='JamAccountTools');
  const pending=account();
  render().find(node=>node.type==='button'&&node.props.children==='Next gallery page').props.onClick();
  assert.ok(render().some(node=>node.props.children==='Start gallery again'));
  assert.equal(pending.props.isCurrent(),true);
  await pending.props.onWinner();
  assert.notEqual(account().key,pending.key);
  assert.ok(!render().some(node=>node.props.children==='Start gallery again'));
  h.setActor({id:'99',login:'other',csrfToken:'other'});
  render();
  assert.equal(pending.props.isCurrent(),false);
});
test('mutation retries preserve operation identity through errors and reload; success clears it',async()=>{
  const calls=[],storage=new Map();
  let fail=true;
  const fetcher=async(url,init)=>{calls.push({url,init});if(fail)throw new Error('connection lost');return confirmed(init);};
  const first=harness({storage,fetcher}),payload={action:'join',revision:'accepted-revision'};
  assert.equal(await first.render().send(payload),null);
  const firstKey=JSON.parse(calls[0].init.body).operationId;assert.equal(storage.size,1);
  const afterReload=harness({storage,fetcher});fail=false;
  const result=await afterReload.render().send(payload);
  assert.equal(result.operationId,firstKey);assert.equal(JSON.parse(calls[1].init.body).operationId,firstKey);
  assert.equal(calls[1].init.headers['x-hub-csrf'],'csrf');assert.equal(calls[1].init.credentials,'same-origin');
  assert.equal(JSON.parse(calls[1].init.body).actor,undefined);assert.equal(storage.size,0);
  assert.deepEqual(payload,{action:'join',revision:'accepted-revision'});
});
test('operation identity changes for payload, actor and endpoint; duplicate in-flight writes are suppressed',async()=>{
  const ids=[],fetcher=async(url,init)=>{ids.push(JSON.parse(init.body).operationId);throw new Error('unknown');};
  const h=harness({fetcher});await h.render().send({action:'join',revision:'a'});await h.render().send({action:'join',revision:'b'});
  h.setActor({id:'99',login:'other',csrfToken:'other'});await h.render().send({action:'join',revision:'b'});await h.render('useMutation','/api/jams/jam-88/actions').send({action:'join',revision:'b'});
  assert.equal(new Set(ids).size,4);
  let finish;const active=harness({fetcher:async(url,init)=>{await new Promise(resolve=>{finish=resolve;});return confirmed(init);}}).render();
  const pending=active.send({action:'join',revision:'a'});assert.equal(await active.send({action:'join',revision:'a'}),null);finish();assert.ok(await pending);
});
test('frames and signed-out callers cannot mutate; unconfigured or unconfirmed responses never succeed',async()=>{
  let writes=0;const fetcher=async()=>{writes++;return Response.json({configured:false,error:'Not configured'},{status:503});};
  const framed=harness({fetcher});framed.frame();assert.equal(await framed.render().send({action:'join'}),null);
  const signedOut=harness({fetcher});signedOut.setActor(null);assert.equal(await signedOut.render().send({action:'join'}),null);assert.equal(writes,0);
  assert.equal(await harness({fetcher}).render().send({action:'join'}),null);
  const malformed=harness({fetcher:async()=>Response.json({configured:true})});assert.equal(await malformed.render().send({action:'join'}),null);
});
test('submission contract requires a demo URL and preserves exact source and demo in the request',async()=>{
  assert.match(clientSource,/Published GitHub Pages URL/);
  assert.match(clientSource,/act\('submit',\{\.\.\.\(!showcase\?\{source\}:\{\}\),title,description,demoUrl,/);
  const payload={action:'submit',revision:'accepted',source:{repositoryUrl:'https://github.com/creator/project',commit:'a'.repeat(40)},title:'My app',description:'An app',demoUrl:'https://creator.github.io/project/'};
  let received;
  const h=harness({fetcher:async(url,init)=>{received=JSON.parse(init.body);return confirmed(init);}});
  assert.ok(await h.render().send(payload));
  const {operationId,...sent}=received;assert.deepEqual(sent,payload);assert.ok(operationId);
});
test('entry moderation sends the public reason and participant identity',async()=>{
  assert.match(clientSource,/<label>Public reason<textarea required/);
  assert.match(clientSource,/mutation\.send\(\{action:'withdraw-entry',participantId,reason\}\)/);
  assert.match(clientSource,/if\(result\?\.status==='withdrawn'\)await onChanged\(\)/);
  const payload={action:'withdraw-entry',participantId:'14',reason:'Uncredited copied work'};
  let received;
  const h=harness({fetcher:async(url,init)=>{received=JSON.parse(init.body);return confirmed(init);}});
  assert.ok(await h.render().send(payload));
  const {operationId,...sent}=received;assert.deepEqual(sent,payload);assert.ok(operationId);
});
test('the gallery offers host entry removal only to a signed-in account with permission',()=>{
  const entry={participantId:'33',login:'student',title:'Project',description:'Project',repository:{id:'202',ownerId:'33',fullName:'student/project'}};
  const event={id:'jam-42',title:'Jam',type:'game',schedule:{},moderation:{status:'active'},participants:[],entries:[entry]};
  const data={event,entry:null,registration:null,canMaintain:false};
  const h=harness({participateData:data});
  const control=()=>elements(h.render('JamDetail',{id:'jam-42'})).find(node=>node.type?.name==='EntryModeration');
  assert.equal(control(),undefined);
  h.setDetail({...data,canHostRemoveEntry:true});
  assert.equal(control().props.participantId,'33');
  assert.equal(control().props.host,true);
  h.setActor(null);
  assert.equal(control(),undefined);
});
test('a participant joined under A sees approved B changes and old rules, but cannot submit without reviewing B',async()=>{
  const original={type:'game',title:'Jam A',summary:'Original jam',theme:'Water',rules:'Original rule A: work alone.',eligibility:'Students',websiteUrl:'https://creator.example/',timezone:'UTC',schedule:{registrationOpensAt:'2030-01-01T00:00:00Z',registrationClosesAt:'2030-01-10T00:00:00Z',startsAt:'2030-01-11T00:00:00Z',submissionsOpenAt:'2030-01-11T00:00:00Z',submissionsCloseAt:'2030-01-12T00:00:00Z'}};
  const revised={...original,title:'Jam B',rules:'Revised rule B: pairs allowed.',schedule:{...original.schedule,submissionsCloseAt:'2030-01-14T00:00:00Z'}};
  const acceptedA={revision:'A',approvedAt:'2029-12-01T12:00:00Z',manifest:original},acceptedB={revision:'B',approvedAt:'2029-12-02T12:00:00Z',manifest:revised};
  const detail={configured:true,event:{...original,id:'jam-42',revision:'A',approvalHistory:[acceptedA],moderation:{status:'active'},registrationOpen:true,submissionsOpen:true,participants:[],participantCount:1,entries:[]},registration:{status:'joined',revision:'A'},entry:null,canMaintain:false,proposal:{manifest:{...revised,rules:'Private pending rule C'}}};
  const calls=[],h=harness({participateData:detail,fetcher:async(url,init)=>{calls.push(JSON.parse(init.body));return confirmed(init);}});
  const render=()=>h.render('JamParticipate',{id:'jam-42'}),submitButton=tree=>elements(tree).find(node=>node.type==='button'&&node.props.children==='Submit my work');
  let tree=render();assert.equal(elements(tree).some(node=>node.props?.role==='status'&&String(node.props.children).includes('newer approved version')),false);
  elements(tree).find(node=>node.type==='input'&&node.props.type==='checkbox').props.onChange({target:{checked:true}});
  assert.equal(submitButton(render()).props.disabled,false);
  const updated={...detail,event:{...detail.event,...revised,revision:'B',approvalHistory:[acceptedA,acceptedB]}};h.setDetail(updated);
  tree=render();assert.ok(elements(tree).find(node=>node.props?.role==='status'&&String(node.props.children).includes('Review the current rules and schedule')));
  assert.equal(elements(tree).find(node=>node.type==='input'&&node.props.type==='checkbox').props.checked,false);assert.equal(submitButton(tree).props.disabled,true);
  await elements(tree).find(node=>node.type==='form').props.onSubmit({preventDefault(){}});assert.equal(calls.length,0,'even a form submit cannot acknowledge an unreviewed replacement');
  const history=renderToStaticMarkup(h.render('ApprovedVersions',{event:updated.event}));
  assert.match(history,/<summary>Approved versions<\/summary>/);assert.match(history,/Original rule A: work alone\./);assert.match(history,/Revised rule B: pairs allowed\./);
  assert.match(history,/2030-01-12T00:00:00Z/);assert.match(history,/2030-01-14T00:00:00Z/);assert.match(history,/2029-12-01T12:00:00Z/);assert.doesNotMatch(history,/Private pending rule C/);
  tree=render();elements(tree).find(node=>node.type==='input'&&node.props.type==='checkbox').props.onChange({target:{checked:true}});
  tree=render();assert.equal(submitButton(tree).props.disabled,false);
  await elements(tree).find(node=>node.type==='form').props.onSubmit({preventDefault(){}});assert.equal(calls.length,1);assert.equal(calls[0].revision,'B');assert.equal(detail.registration.revision,'A','reading/checking does not silently rewrite prior server acknowledgment');
});
test('safety moderation reasons are bounded to 256 characters while proposal review keeps its existing limit',()=>{
  const moderation=clientSource.slice(clientSource.indexOf('function Moderation('),clientSource.indexOf('export function JamDetail('));
  assert.equal([...moderation.matchAll(/maxLength=\{256\}/g)].length,2);assert.doesNotMatch(moderation,/maxLength=\{2000\}/);
  assert.match(clientSource,/<label>Review reason<textarea[\s\S]*?maxLength=\{2000\}/);
});
test('fetched private data is unavailable immediately after actor changes, while draft hooks are independent',async()=>{
  const h=harness({fetcher:async()=>Response.json({configured:true,canMaintain:true,proposal:{title:'private proposal'}})});
  await h.render('useResource').refresh();assert.equal(h.render('useResource').data.canMaintain,true);
  h.setActor(null);assert.equal(h.render('useResource').data,null);
  h.setActor({id:'99',login:'other',csrfToken:'new'});assert.equal(h.render('useResource').data,null);
  assert.match(clientSource,/useDraft\('hosted-create'/);
  assert.match(clientSource,/useDraft\(`entry-details:/);
});
function panelModule(reply,seen) {
  const module={exports:{}};
  const context={module,exports:module.exports,require:name=>name.includes('jams-visibility')?{hiddenJamsResponse:()=>null}:{getJamResponse:async(request,id)=>{seen.push({request,id});return Response.json(reply.body,{status:reply.status||200});}},Request,Response,URL};
  vm.runInNewContext(compile(panelSource),context);return module.exports;
}
test('public panel strips caller credentials, escapes content and allows only approved creator origin',async()=>{
  const seen=[],panel=panelModule({body:{configured:true,event:{revision:'abc',title:'<img src=x onerror=alert(1)>',websiteUrl:'https://creator.example/jam/',moderation:{status:'active'},registrationOpen:true,submissionsOpen:false,participantCount:2}}},seen);
  const response=await panel.GET(new Request('https://zero.codepet.ca/hub/jams/jam-42/panel',{headers:{Cookie:'secret=token',Authorization:'Bearer secret'}}),{params:Promise.resolve({id:'jam-42'})});
  assert.equal(seen.length,1);assert.equal(seen[0].request.headers.get('cookie'),null);assert.equal(seen[0].request.headers.get('authorization'),null);
  assert.equal(response.headers.get('cache-control'),'no-store');assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'self' https:\/\/creator\.example$/);
  const html=await response.text();assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img|<script|<form|<button|csrf|token/);assert.match(html,/Registration open/);assert.match(html,/target="_blank" rel="noopener noreferrer"/);
});
test('unapproved or unavailable panel grants no creator framing and exposes no write confirmation',async()=>{
  for(const body of [{configured:false,error:'private operational details'},{configured:true,event:{title:'Pending secret',revision:null,websiteUrl:'https://unapproved.example'}}]) {
    const seen=[],panel=panelModule({body,status:503},seen),response=await panel.GET(new Request('https://zero.codepet.ca'),{params:Promise.resolve({id:'jam-42'})});
    assert.equal(response.status,503);assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'self'$/);
    const html=await response.text();assert.doesNotMatch(html,/private operational details|Pending secret|unapproved\.example|<button|<form/);
  }
});

test('hosted approved panel shows official status and links without an external framing origin',async()=>{
  const id='jam-zero-'+'a'.repeat(32),seen=[];
  const panel=panelModule({body:{configured:true,event:{revision:'abc',title:'Hosted Game Jam',moderation:{status:'active'},registrationOpen:true,submissionsOpen:false,participantCount:1}}},seen);
  const response=await panel.GET(new Request('https://zero.codepet.ca'),{params:Promise.resolve({id})});
  const html=await response.text();
  assert.equal(response.status,200);assert.equal(seen[0].id,id);
  assert.match(html,/Hosted Game Jam/);assert.match(html,/Registration open/);
  assert.ok(html.includes(`/hub/jams/${id}/participate`));
  assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'self'$/);
});

test('showcase Join sends only the owned repository and does not require publication or a commit',async()=>{
  const detail={configured:true,event:{id:'jam-zero-'+'a'.repeat(32),title:'Hosted jam',revision:'A',schedule:{galleryRevealAt:'2030-01-20T00:00:00Z'},moderation:{status:'active'},registrationOpen:true,submissionsOpen:true,participants:[],entries:[]},registration:null,entry:null,canMaintain:false};
  const calls=[],h=harness({participateData:detail,fetcher:async(url,init)=>{calls.push(JSON.parse(init.body));return confirmed(init);}});
  const render=()=>h.render('JamParticipate',{id:detail.event.id});
  let tree=render();assert.equal(elements(tree).some(node=>node.props?.name==='commit'),false);
  elements(tree).find(node=>node.props?.type==='checkbox').props.onChange({target:{checked:true}});
  tree=render();elements(tree).find(node=>node.props?.name==='repositoryUrl').props.onChange({target:{value:'https://github.com/creator/project'}});
  assert.equal(elements(render()).some(node=>node.props?.name==='joinDemoUrl'),false);
  tree=render();const join=elements(tree).find(node=>node.type==='button'&&node.props.children==='Join this jam');
  assert.equal(join.props.disabled,false);join.props.onClick();await new Promise(resolve=>setImmediate(resolve));
  const {operationId,...payload}=calls[0];assert.ok(operationId);
  assert.deepEqual(payload,{action:'join',revision:'A',repositoryUrl:'https://github.com/creator/project'});
  h.setDetail({...detail,registration:{status:'joined',revision:'A',repository:{id:'12',ownerId:'12',fullName:'creator/project'}},entry:{status:'active'}});
  tree=render();assert.equal(elements(tree).some(node=>node.props?.name==='commit'),false);
  await elements(tree).find(node=>node.type==='form').props.onSubmit({preventDefault(){}});
  assert.equal(calls[1].source,undefined);assert.equal(calls[1].action,'submit');
});

test('held entries appear in a separate maintainer-only review section',()=>{
  const entry={participantId:'33',login:'student',title:'Hidden project',description:'Private until reveal',demoUrl:'https://student.github.io/project/',instructions:'',repository:{id:'202',ownerId:'33',fullName:'student/project'}};
  const event={id:'jam-42',title:'Jam',type:'game',timezone:'UTC',summary:'',theme:'',rules:'',eligibility:'',schedule:{},revision:'A',moderation:{status:'active'},registrationOpen:false,submissionsOpen:false,participants:[],participantCount:1,entries:[]};
  const data={configured:true,event,entry:null,registration:null,canMaintain:true,moderationEntries:[entry]};
  const h=harness({participateData:data});
  assert.equal(elements(h.render('JamDetail',{id:'jam-42'})).filter(node=>node.type?.name==='JamAccountTools').length,1);
  assert.equal(elements(h.render('JamAccountTools',{id:'jam-42',onModeration:async()=>{}})).filter(node=>node.type?.name==='ModerationInbox').length,1);
  const inbox=h.render('ModerationInbox',{id:'jam-42',onChanged:async()=>{}});
  const held=elements(inbox).filter(node=>node.type?.name==='HeldEntryModeration');
  assert.equal(held.length,1);assert.equal(held[0].props.entries[0].title,'Hidden project');
  const section=h.render('HeldEntryModeration',{id:'jam-42',entries:[entry],onChanged:async()=>{}});
  assert.ok(elements(section).some(node=>node.type?.name==='EntryModeration'&&node.props.participantId==='33'));
  h.setDetail({...data,canMaintain:false});assert.equal(elements(h.render('JamAccountTools',{id:'jam-42',onModeration:async()=>{}})).some(node=>node.type?.name==='ModerationInbox'),false);
  h.setDetail({...data,moderationEntries:[]});assert.equal(elements(h.render('ModerationInbox',{id:'jam-42',onChanged:async()=>{}})).some(node=>node.type?.name==='HeldEntryModeration'),false);
  h.setDetail(null);assert.ok(elements(h.render('JamDetail',{id:'jam-42'})).some(node=>node.type?.name==='JamAccountTools'),'gallery failure does not unmount the independent maintainer path');
  h.setActor(null);assert.equal(elements(h.render('JamDetail',{id:'jam-42'})).some(node=>node.type?.name==='JamAccountTools'),false);
});

test('maintainer overview errors can be retried and gallery moderation refreshes the independent inbox',async()=>{
  const entry={participantId:'33',login:'student',title:'Project',description:'Project',demoUrl:'https://student.github.io/project/',repository:{id:'202',ownerId:'33',fullName:'student/project'}};
  const event={id:'jam-42',title:'Jam',type:'game',timezone:'UTC',summary:'',theme:'',rules:'',eligibility:'',schedule:{},revision:'A',moderation:{status:'active'},registrationOpen:false,submissionsOpen:false,participants:[],participantCount:1,entries:[entry]};
  const data={configured:true,event,entry:null,registration:null,canMaintain:true,moderationEntries:[entry]};
  const h=harness({participateData:data}),render=()=>elements(h.render('JamDetail',{id:'jam-42'}));
  const first=render().find(node=>node.type?.name==='JamAccountTools');
  await render().find(node=>node.type?.name==='EntryModeration').props.onChanged();
  const next=render().find(node=>node.type?.name==='JamAccountTools');
  assert.notEqual(first.key,next.key,'gallery moderation remounts the separately fetched inbox');
  h.setDetail(null);
  assert.ok(render().some(node=>node.props?.role==='status'&&node.props.children==='Most recent confirmed moderation: submission withdrawn.'),'confirmation survives an unavailable gallery');
  h.setActor({id:'99',login:'other',csrfToken:'other'});
  assert.equal(render().some(node=>node.props?.role==='status'&&node.props.children==='Most recent confirmed moderation: submission withdrawn.'),false,'confirmation is scoped to the signed-in identity');
  h.setDetail({...data,testError:'Overview unavailable'});
  const retry=elements(h.render('JamAccountTools',{id:'jam-42',onModeration:async()=>{}})).find(node=>node.type?.name==='Retry');
  assert.equal(retry.props.error,'Overview unavailable');assert.equal(typeof retry.props.refresh,'function');
  const sameError=elements(h.render('JamAccountTools',{id:'jam-42',onModeration:async()=>{},galleryError:'Overview unavailable'}));
  assert.ok(sameError.some(node=>node.type==='button'&&node.props.children==='Retry account view'&&typeof node.props.onClick==='function'),
    'the account view remains independently retryable without repeating the error');
  assert.equal(sameError.some(node=>node.type?.name==='Retry'),false);
});

test('rejoining allows a renamed repository URL while retaining the recorded URL as an editable initial value',async()=>{
  const detail={configured:true,event:{id:'jam-zero-'+'b'.repeat(32),title:'Hosted jam',revision:'A',schedule:{galleryRevealAt:'2030-01-20T00:00:00Z'},moderation:{status:'active'},registrationOpen:true,submissionsOpen:true,participants:[],entries:[]},registration:{status:'left',revision:'A',repository:{id:'202',ownerId:'12',fullName:'creator/old-name'}},entry:null,canMaintain:false};
  const calls=[],h=harness({participateData:detail,fetcher:async(url,init)=>{calls.push(JSON.parse(init.body));return confirmed(init);}});
  const render=()=>h.render('JamParticipate',{id:detail.event.id});let tree=render();
  let field=elements(tree).find(node=>node.props?.name==='repositoryUrl');
  assert.equal(field.props.value,'https://github.com/creator/old-name');assert.equal(field.props.readOnly,undefined);
  elements(tree).find(node=>node.props?.type==='checkbox').props.onChange({target:{checked:true}});
  field=elements(render()).find(node=>node.props?.name==='repositoryUrl');field.props.onChange({target:{value:''}});
  assert.equal(elements(render()).find(node=>node.props?.name==='repositoryUrl').props.value,'');
  elements(render()).find(node=>node.props?.name==='repositoryUrl').props.onChange({target:{value:'https://github.com/creator/new-name'}});
  tree=render();elements(tree).find(node=>node.type==='button'&&node.props.children==='Join this jam').props.onClick();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls[0].repositoryUrl,'https://github.com/creator/new-name');
  assert.match(clientSource,/must still be the same GitHub repository/);
});


test('participation form remounts for event or signed-in identity changes',()=>{
  const h=harness();
  assert.equal(h.render('JamParticipateWrapper',{id:'jam-1'}).key,'jam-1:12');
  assert.equal(h.render('JamParticipateWrapper',{id:'jam-2'}).key,'jam-2:12');
  h.setActor({id:'99',login:'other',csrfToken:'other'});
  assert.equal(h.render('JamParticipateWrapper',{id:'jam-1'}).key,'jam-1:99');
  assert.match(clientSource,/entry-source:\$\{id\}:\$\{user\?\.id/);
});

test('Jam pages link to the rules without placing plan details in the main flow',()=>{
  const h=harness(),link=h.render('JamHelpLink');
  assert.ok(elements(link).some(node=>node.props?.href==='/hub/jams/rules'));
  assert.ok(elements(h.render('JamCreate')).some(node=>node.type?.name==='JamHelpLink'));
  assert.match(clientSource,/<JamHelpLink\/>(?=<div className="jam-actions">\{!joined\?)/);
  assert.match(clientSource,/Participants: \{data\.event\.participantCount\} · Limit: \{data\.event\.participantLimit\}/);
  assert.doesNotMatch(clientSource,/JamPlanNotice|room for up to \{data\.event\.participantLimit\} participants/);
});

test('Jam discovery searches and filters public cards in the content pane',()=>{
  const events=[{id:'jam-1',type:'game',title:'Moon Arcade',theme:'Space exploration',summary:'Build a game.'},
    {id:'jam-2',type:'app',title:'Moon Planner',theme:'Productivity',summary:'Build a useful app.'}];
  const h=harness({participateData:{events}});
  h.setDirectory(h.render('JamDirectoryProvider',{}).props.value);
  const render=()=>elements(h.render('JamDiscovery'));
  const cards=()=>render().filter(node=>node.type==='article').map(node=>node.key);
  const search=render().find(node=>node.type==='input');
  assert.equal(search.props['aria-label'],'Search jams');
  assert.deepEqual(cards(),['jam-1','jam-2']);
  search.props.onChange({target:{value:'  SPACE arcade  '}});
  assert.deepEqual(cards(),['jam-1']);
  render().find(node=>node.type==='select').props.onChange({target:{value:'app'}});
  assert.deepEqual(cards(),[]);
  assert.ok(render().some(node=>node.props.children==='No jams match your search.'));
});

test('only the current Pro account can open the creation form',()=>{
  const h=harness({participateData:{events:[],hostingAccess:{accountId:'12',canCreate:true}}});
  function showsForm() {
    h.setDirectory(h.render('JamDirectoryProvider',{}).props.value);
    return h.render('JamCreationPane').type?.name==='JamCreate';
  }
  assert.equal(showsForm(),true);
  h.setActor({id:'99',login:'other',csrfToken:'other'});
  assert.equal(showsForm(),false);
  h.setDetail({events:[],hostingAccess:{accountId:'99',canCreate:false}});
  assert.equal(showsForm(),false);
  h.setDetail({events:[],hostingAccess:{accountId:'99',canCreate:null}});
  assert.equal(showsForm(),false);
  for(const pane of ['JamDiscovery','JamCreationPane']) {
    assert.ok(elements(h.render(pane)).some(node=>node.type?.name==='HostingUnavailable'));
  }
  h.setActor(null);
  assert.equal(showsForm(),false);
});

test('jam timing switches from the submission deadline to reveal and ends after reveal',()=>{
  const h=harness(),close=Date.parse('2030-01-03T12:00:00Z'),reveal=close+3_600_000;
  const schedule={submissionsCloseAt:new Date(close).toISOString(),galleryRevealAt:new Date(reveal).toISOString()};
  assert.equal(h.render('jamTimeRemaining',schedule,close-90_000),'Submissions due in 2m');
  assert.equal(h.render('jamTimeRemaining',schedule,close),'Gallery opens in 1h 0m');
  assert.equal(h.render('jamTimeRemaining',schedule,reveal),null);
  assert.equal(h.render('jamTimeRemaining',{},close),null);
  const event={revision:'a',schedule,moderation:{status:'active'},registrationOpen:false,submissionsOpen:true};
  const status=now=>elements(h.render('EventStatus',{event,now})).find(node=>node.type==='p').props.children.join('');
  assert.match(status(close-1),/Submissions open/);
  assert.match(status(close),/Submissions closed/);
});

test('Jam rules page explains plans, access and timing',async()=>{
  const source=await readFile(new URL('../app/hub/jams/rules/page.tsx',import.meta.url),'utf8');
  const module={exports:{}},React=require('react');
  vm.runInNewContext(compile(source),{module,exports:module.exports,require(name){
    if(name==='next/link')return {default:({href,children})=>React.createElement('a',{href},children)};
    if(name==='@/components/JamShell')return {JamShell:({children})=>React.createElement(React.Fragment,null,children)};
    return require(name);
  }});
  const markup=renderToStaticMarkup(React.createElement(module.exports.default));
  for(const phrase of ['Joining is free','Pro license','100 distinct GitHub accounts','enabled manually','automatically approved','one active jam','gallery opens','no online checkout','Accounts still count after leaving','Older jams may require an exact source commit'])assert.ok(markup.includes(phrase),phrase);
  assert.match(markup,/href="mailto:info@codepet.ca"/);assert.match(markup,/href="\/hub\/jams"/);
  // Exercise the actual Jam layout with the actual rules component; all Jam
  // pages, including this route, share the same production/preview gate.
  const {jamsPreviewAvailable}=await import('../lib/jams-visibility.mjs');
  const layoutSource=await readFile(new URL('../app/hub/jams/layout.tsx',import.meta.url),'utf8');
  for(const [env,visible] of [[{NODE_ENV:'production',VERCEL:'1',VERCEL_ENV:'production',ZERO_JAMS_PILOT_ENABLED:'1'},true],[{NODE_ENV:'production',VERCEL:'1',VERCEL_ENV:'production'},false],[{NODE_ENV:'production',VERCEL:'1',VERCEL_ENV:'preview',ZERO_JAMS_PILOT_ENABLED:'1'},false]]){
    const layout={exports:{}};vm.runInNewContext(compile(layoutSource),{module:layout,exports:layout.exports,require(name){
      if(name==='@/lib/jams-visibility.mjs')return {jamsPreviewAvailable:()=>jamsPreviewAvailable(env)};
      if(name==='next/navigation')return {notFound:()=>{throw Error('not-found');}};
      return require(name);
    }});
    const child=React.createElement(module.exports.default);
    if(visible)assert.match(renderToStaticMarkup(layout.exports.default({children:child})),/How ZeroJams works/);
    else assert.throws(()=>layout.exports.default({children:child}),/not-found/);
  }
});

test('server-denied Pro proposal shows its error and keeps the operation for retry',async()=>{
  const storage=new Map(),denial='A Pro license is required to propose a jam. Contact info@codepet.ca.';let calls=0;
  const h=harness({storage,fetcher:async()=>{calls++;return Response.json({configured:true,error:denial},{status:403});}});
  assert.equal(await h.render('useMutation','/api/jams/proposals').send({manifest:{title:'Draft'}}),null);
  assert.equal(h.render('useMutation','/api/jams/proposals').error,denial);assert.equal(calls,1);assert.equal(storage.size,1);
});

test('creation stays concise and historical manual review remains supported',()=>{
  const h=harness(),nodes=elements(h.render('JamCreate'));
  assert.ok(nodes.some(node=>node.type?.name==='JamHelpLink'));
  assert.doesNotMatch(clientSource,/Send for maintainer review|An independent Zero maintainer reviews your proposal/);
  assert.match(clientSource,/data\.canMaintain&&proposal\.status==='submitted'/);
});

test('a one-active-jam conflict preserves the server message and operation for retry',async()=>{
  const storage=new Map(),text='You can have only one active jam at a time.';
  const h=harness({storage,fetcher:async()=>Response.json({configured:true,error:text},{status:429})});
  assert.equal(await h.render('useMutation','/api/jams/proposals').send({manifest:{title:'Draft'}}),null);
  assert.equal(h.render('useMutation','/api/jams/proposals').error,text);assert.equal(storage.size,1);
});


test('only an auto-approved jam creator sees cancellation and must give a public reason',async()=>{
  let received,refreshed=0;const h=harness({participateData:{},fetcher:async(url,init)=>{received={url,body:JSON.parse(init.body)};return confirmed(init);}});
  const event={creator:{id:'12',login:'creator'},approvalMode:'pro-license-v1',moderation:{status:'active'}};
  const render=()=>h.render('CreatorCancel',{id:'jam-42',event,onChanged:async()=>{refreshed++;}});
  render();h.flushEffects();let tree=render(),nodes=elements(tree);assert.equal(nodes.find(n=>n.type==='button').props.disabled,true);
  assert.match(renderToStaticMarkup(tree),/visibility holds remain until the scheduled gallery reveal/);
  await nodes.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.equal(received,undefined);
  nodes.find(n=>n.type==='textarea').props.onChange({target:{value:'  Event postponed  '}});tree=render();nodes=elements(tree);
  assert.equal(nodes.find(n=>n.type==='button').props.disabled,false);nodes.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(received.url,'/api/jams/jam-42/actions');assert.equal(received.body.action,'cancel');assert.equal(received.body.reason,'Event postponed');assert.ok(received.body.operationId);assert.equal(refreshed,1);
  for(const next of [{...event,creator:{id:'13'}},{...event,approvalMode:undefined},{...event,moderation:{status:'cancelled'}}])assert.equal(h.render('CreatorCancel',{id:'jam-42',event:next,onChanged:async()=>{}}),null);
  const suspended=harness({participateData:{}}),suspendedProps={id:'jam-42',event:{...event,moderation:{status:'suspended'}},onChanged:async()=>{}};suspended.render('CreatorCancel',suspendedProps);suspended.flushEffects();assert.ok(suspended.render('CreatorCancel',suspendedProps));
  const framed=harness();framed.frame();assert.equal(framed.render('CreatorCancel',{id:'jam-42',event,onChanged:async()=>{}}),null);
  h.setActor(null);assert.equal(h.render('CreatorCancel',{id:'jam-42',event,onChanged:async()=>{}}),null);
});


test('lost cancellation response recovers its original operation after reload without permitting new cancellations',async()=>{
  const storage=new Map(),calls=[],event={creator:{id:'12',login:'creator'},approvalMode:'pro-license-v1',moderation:{status:'active'}};
  const first=harness({storage,participateData:{},fetcher:async(url,init)=>{calls.push(JSON.parse(init.body));throw Error('response lost');}});
  const props={id:'jam-42',event,onChanged:async()=>{}};first.render('CreatorCancel',props);first.flushEffects();let tree=first.render('CreatorCancel',props);
  elements(tree).find(n=>n.type==='textarea').props.onChange({target:{value:'A public reason'}});tree=first.render('CreatorCancel',props);
  elements(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.length,1);const original=calls[0];assert.equal(original.action,'cancel');
  const cancelled={...event,moderation:{status:'cancelled'}},second=harness({storage,participateData:{},fetcher:async(url,init)=>{calls.push(JSON.parse(init.body));return confirmed(init);}});
  const next={id:'jam-42',event:cancelled,onChanged:async()=>{}};assert.equal(second.render('CreatorCancel',next),null);second.flushEffects();
  tree=second.render('CreatorCancel',next);assert.match(renderToStaticMarkup(tree),/Check previous cancellation/);assert.match(renderToStaticMarkup(tree),/A public reason/);
  elements(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(calls[1],original);assert.equal(second.render('CreatorCancel',next),null);
  const fresh=harness({storage:new Map(),participateData:{}});fresh.render('CreatorCancel',next);fresh.flushEffects();assert.equal(fresh.render('CreatorCancel',next),null);
});

test('cancellation recovery never reveals another actor or sends a new operation when the stored ID disappears',async()=>{
  const storage=new Map(),calls=[],event={creator:{id:'12',login:'creator'},approvalMode:'pro-license-v1',moderation:{status:'active'}};
  const first=harness({storage,participateData:{},fetcher:async(_url,init)=>{calls.push(JSON.parse(init.body));throw Error('lost');}});
  first.render('CreatorCancel',{id:'jam-42',event,onChanged:async()=>{}});first.flushEffects();let tree=first.render('CreatorCancel',{id:'jam-42',event,onChanged:async()=>{}});elements(tree).find(n=>n.type==='textarea').props.onChange({target:{value:'Original'}});
  tree=first.render('CreatorCancel',{id:'jam-42',event,onChanged:async()=>{}});elements(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));
  const cancelled={...event,moderation:{status:'cancelled'}},other=harness({storage,participateData:{}});other.setActor({id:'99',login:'other',csrfToken:'other'});
  other.render('CreatorCancel',{id:'jam-42',event:cancelled,onChanged:async()=>{}});other.flushEffects();assert.equal(other.render('CreatorCancel',{id:'jam-42',event:cancelled,onChanged:async()=>{}}),null);
  const retry=harness({storage,participateData:{},fetcher:async(_url,init)=>{calls.push(JSON.parse(init.body));return confirmed(init);}}),props={id:'jam-42',event:cancelled,onChanged:async()=>{}};
  retry.render('CreatorCancel',props);retry.flushEffects();tree=retry.render('CreatorCancel',props);
  for(const key of storage.keys())if(key.startsWith('zero-jam-operation:'))storage.delete(key);
  elements(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.length,1);assert.match(renderToStaticMarkup(retry.render('CreatorCancel',props)),/original cancellation request is unavailable/i);
});

test('an unresolved cancellation on an active reload locks its original reason and operation',async()=>{
  const storage=new Map(),calls=[],event={creator:{id:'12',login:'creator'},approvalMode:'pro-license-v1',moderation:{status:'active'}};
  const first=harness({storage,participateData:{},fetcher:async(_url,init)=>{calls.push(JSON.parse(init.body));throw Error('response lost');}});
  const props={id:'jam-42',event,onChanged:async()=>{}};first.render('CreatorCancel',props);first.flushEffects();let tree=first.render('CreatorCancel',props);
  elements(tree).find(n=>n.type==='textarea').props.onChange({target:{value:'Original reason'}});tree=first.render('CreatorCancel',props);
  elements(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));
  const retry=harness({storage,participateData:{},fetcher:async(_url,init)=>{calls.push(JSON.parse(init.body));return confirmed(init);}});
  retry.render('CreatorCancel',props);retry.flushEffects();tree=retry.render('CreatorCancel',props);
  assert.match(renderToStaticMarkup(tree),/earlier cancellation has not been confirmed/);assert.equal(elements(tree).some(n=>n.type==='textarea'),false);
  elements(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(calls[1],calls[0]);assert.equal(calls[1].reason,'Original reason');
});

test('cancellation refuses dispatch when its recovery data cannot be saved',async()=>{
  const storage=new Map();storage.set=()=>{throw Error('storage unavailable');};let calls=0;
  const h=harness({storage,participateData:{},fetcher:async()=>{calls++;return Response.json({});}});
  const event={creator:{id:'12',login:'creator'},approvalMode:'pro-license-v1',moderation:{status:'active'}},props={id:'jam-42',event,onChanged:async()=>{}};
  h.render('CreatorCancel',props);h.flushEffects();let tree=h.render('CreatorCancel',props);elements(tree).find(n=>n.type==='textarea').props.onChange({target:{value:'Reason'}});tree=h.render('CreatorCancel',props);
  elements(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls,0);assert.match(renderToStaticMarkup(h.render('CreatorCancel',props)),/could not save this cancellation request/i);
});

test('a damaged cancellation recovery record blocks a new cancellation after reload',()=>{
  const storage=new Map([['zero-jam-cancel-pending:12:jam-42','Earlier reason']]);
  const h=harness({storage,participateData:{}}),event={creator:{id:'12',login:'creator'},approvalMode:'pro-license-v1',moderation:{status:'active'}},props={id:'jam-42',event,onChanged:async()=>{}};
  h.render('CreatorCancel',props);h.flushEffects();const tree=h.render('CreatorCancel',props);
  assert.match(renderToStaticMarkup(tree),/earlier cancellation request cannot be recovered/i);
  assert.equal(elements(tree).some(n=>n.type==='button'||n.type==='textarea'),false);
});

test('confirmed cancellation cannot show a fresh form while the event refresh is pending',async()=>{
  let releaseRefresh;const h=harness({participateData:{},fetcher:async(_url,init)=>confirmed(init)});
  const event={creator:{id:'12',login:'creator'},approvalMode:'pro-license-v1',moderation:{status:'active'}};
  const props={id:'jam-42',event,onChanged:()=>new Promise(resolve=>{releaseRefresh=resolve;})};
  h.render('CreatorCancel',props);h.flushEffects();let tree=h.render('CreatorCancel',props);
  elements(tree).find(n=>n.type==='textarea').props.onChange({target:{value:'Cancelled by organizer'}});tree=h.render('CreatorCancel',props);
  elements(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(typeof releaseRefresh,'function');assert.equal(h.render('CreatorCancel',props),null);
  releaseRefresh();await new Promise(resolve=>setImmediate(resolve));assert.equal(h.render('CreatorCancel',props),null);
  assert.equal(h.render('CreatorCancel',{...props,event:{...event,moderation:{status:'cancelled'}}}),null);
});


test('confirmed cancellation receipt remains visible when refresh fails',async()=>{
  const h=harness({participateData:{},fetcher:async(_url,init)=>confirmed(init)});
  const event={creator:{id:'12',login:'creator'},approvalMode:'pro-license-v1',moderation:{status:'active'}};
  const props={id:'jam-42',event,onChanged:async()=>{throw Error('refresh failed');}};
  h.render('CreatorCancel',props);h.flushEffects();let tree=h.render('CreatorCancel',props);
  elements(tree).find(n=>n.type==='textarea').props.onChange({target:{value:'Cancelled by organizer'}});tree=h.render('CreatorCancel',props);
  elements(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));
  tree=h.render('CreatorCancel',props);assert.equal(tree,null);
});


test('JamDetail retains one cancellation receipt across loading, failed refresh and stale data',async()=>{
  let rejectRefresh;const event={id:'jam-42',title:'Jam',type:'game',summary:'Jam',theme:'Play',rules:'Be kind',eligibility:'Everyone',timezone:'UTC',schedule:{},revision:'a',creator:{id:'12',login:'creator'},approvalMode:'pro-license-v1',moderation:{status:'active'},registrationOpen:true,submissionsOpen:true,participantCount:0,participants:[],entries:[]};
  const initial={event,registration:null,entry:null,canMaintain:false},parent=harness({participateData:initial,refreshImpl:()=>{parent.setDetail({testError:'Refresh unavailable'});return new Promise((_resolve,reject)=>{rejectRefresh=reject;});}});
  const render=()=>elements(parent.render('JamDetail',{id:'jam-42'}));let child=render().find(n=>n.type?.name==='CreatorCancel');assert.ok(child);
  const worker=harness({participateData:{},fetcher:async(_url,init)=>confirmed(init)});worker.render('CreatorCancel',child.props);worker.flushEffects();let tree=worker.render('CreatorCancel',child.props);
  elements(tree).find(n=>n.type==='textarea').props.onChange({target:{value:'Closing'}});tree=worker.render('CreatorCancel',child.props);elements(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));
  let nodes=render();assert.equal(nodes.filter(n=>n.props?.role==='status'&&n.props.children==='Cancellation confirmed by Zero.').length,1);assert.equal(nodes.some(n=>n.type?.name==='CreatorCancel'),false);
  rejectRefresh(Error('Refresh unavailable'));await new Promise(resolve=>setImmediate(resolve));parent.setDetail(initial);nodes=render();
  assert.equal(nodes.filter(n=>n.props?.role==='status'&&n.props.children==='Cancellation confirmed by Zero.').length,1);child=nodes.find(n=>n.type?.name==='CreatorCancel');assert.equal(child.props.confirmedByParent,true);
  parent.setDetail({...initial,event:{...event,moderation:{status:'cancelled'}}});assert.equal(render().some(n=>n.props?.children==='Cancellation confirmed by Zero.'),false);
  parent.setDetail(initial);parent.setActor({id:'99',login:'other',csrfToken:'csrf'});assert.equal(render().some(n=>n.props?.children==='Cancellation confirmed by Zero.'),false);
});

test('participation shows the current server count and limit beside Join',()=>{
  const event={id:'jam-42',type:'game',title:'Jam',summary:'A jam',theme:'Play',rules:'Be kind',eligibility:'Everyone',timezone:'UTC',schedule:{},revision:'a',moderation:{status:'active'},registrationOpen:true,submissionsOpen:false,participantCount:8,participantLimit:100,participants:[],entries:[]};
  const h=harness({participateData:{event,registration:null,entry:null,canMaintain:false}}),nodes=elements(h.render('JamParticipate',{id:'jam-42'}));
  const count=nodes.findIndex(node=>node.type==='p'&&Array.isArray(node.props.children)&&node.props.children[0]==='Participants: ');
  const join=nodes.findIndex(node=>node.type==='button'&&node.props.children==='Join this jam');
  assert.ok(count>=0&&count<join);assert.deepEqual(Array.from(nodes[count].props.children),['Participants: ',8,' · Limit: ',100]);
});


test('fresh creation detects the browser zone only after hydration and preserves a saved or early-edited timezone',async t=>{
  const {browserJamTimezone,defaultHostedJamDraft}=await import('../lib/jam-draft.mjs');
  const Original=Intl.DateTimeFormat;let detected=0;
  t.mock.method(Intl,'DateTimeFormat',function(...args){if(args.length)return new Original(...args);detected++;return {resolvedOptions:()=>({timeZone:'Asia/Tokyo'})};});
  const initial=defaultHostedJamDraft(),initialize=()=>defaultHostedJamDraft('game',browserJamTimezone());
  const h=harness();assert.equal(h.renderDraft('hosted-create',initial,initialize)[0].timezone,'UTC');
  assert.equal(detected,0);assert.equal(h.storage.size,0,'server defaults are not saved before restore');
  h.flushEffects();assert.equal(h.renderDraft('hosted-create',initial,initialize)[0].timezone,'Asia/Tokyo');
  h.flushEffects();assert.equal(JSON.parse(h.storage.get('zero-jam-draft:hosted-create')).timezone,'Asia/Tokyo');
  const saved={...initial,title:'Kept jam',timezone:'Pacific/Auckland',startsAt:'2030-11-05T09:30'};
  const stored=new Map([['zero-jam-draft:hosted-create',JSON.stringify(saved)]]),restored=harness({storage:stored});
  const calls=detected;restored.renderDraft('hosted-create',initial,initialize);restored.flushEffects();
  assert.deepEqual(JSON.parse(JSON.stringify(restored.renderDraft('hosted-create',initial,initialize)[0])),saved);assert.equal(detected,calls,'saved draft wins over detection');
  const early=harness(),before=early.renderDraft('hosted-create',initial,initialize);
  before[1]({...initial,timezone:'Asia/Kathmandu'});early.flushEffects();
  assert.equal(early.renderDraft('hosted-create',initial,initialize)[0].timezone,'Asia/Kathmandu','an early edit cannot be overwritten');
});

test('draft restoration survives blocked storage, reloads manual timezone and does not overwrite another draft key',async()=>{
  const {defaultHostedJamDraft}=await import('../lib/jam-draft.mjs'),initial=defaultHostedJamDraft();
  const blocked=harness({storage:{get(){throw Error('blocked');},set(){throw Error('blocked');}}});
  blocked.renderDraft('hosted-create',initial,()=>({...initial,timezone:'Asia/Kathmandu'}));blocked.flushEffects();
  assert.equal(blocked.renderDraft('hosted-create',initial)[0].timezone,'Asia/Kathmandu');
  const h=harness();h.renderDraft('first',initial);h.flushEffects();
  h.renderDraft('first',initial)[1]({...initial,timezone:'Europe/Paris'});h.renderDraft('first',initial);h.flushEffects();
  const saved=JSON.stringify({...initial,timezone:'Pacific/Auckland'});h.storage.set('zero-jam-draft:second',saved);
  h.renderDraft('second',initial);h.flushEffects();assert.equal(h.storage.get('zero-jam-draft:second'),saved);
  assert.equal(h.renderDraft('second',initial)[0].timezone,'Pacific/Auckland');
  const reload=harness({storage:h.storage});reload.renderDraft('first',initial);reload.flushEffects();
  assert.equal(reload.renderDraft('first',initial)[0].timezone,'Europe/Paris');
});

test('creation shows selected IANA timezone and keeps its editable control and validation inside More schedule options',async()=>{
  const {defaultHostedJamDraft}=await import('../lib/jam-draft.mjs');
  const saved={...defaultHostedJamDraft(),timezone:'Asia/Kathmandu'},storage=new Map([['zero-jam-draft:hosted-create',JSON.stringify(saved)]]);
  const h=harness({storage});h.render('JamCreate');h.flushEffects();let tree=h.render('JamCreate');
  let nodes=elements(tree),more=nodes.find(node=>node.type==='details'&&elements(node).some(child=>child.type==='summary'&&child.props.children==='More schedule options'));
  assert.ok(elements(more).find(node=>node.type==='input'&&node.props.name==='timezone'));
  assert.ok(nodes.find(node=>node.type==='strong'&&node.props.children==='Asia/Kathmandu'));
  elements(more).find(node=>node.type==='input'&&node.props.name==='timezone').props.onChange({target:{value:'Invalid/Zone'}});
  tree=h.render('JamCreate');await elements(tree).find(node=>node.type==='form').props.onSubmit({preventDefault(){}});
  tree=h.render('JamCreate');more=elements(tree).find(node=>node.type==='details'&&elements(node).some(child=>child.type==='summary'&&child.props.children==='More schedule options'));
  assert.equal(more.props.open,true);assert.equal(elements(more).find(node=>node.type==='input'&&node.props.name==='timezone').props['aria-invalid'],true);
  assert.match(renderToStaticMarkup(more),/IANA timezone/);
});

test('detail, participation, proposal review and approved history share the requested date style, scheduled time and timezone labels',()=>{
  const manifest={type:'game',title:'Dates',timezone:'Asia/Kathmandu',summary:'A jam',theme:'Play',rules:'Be kind',eligibility:'Everyone',schedule:{startsAt:'2026-11-05T14:30:00Z'}};
  const event={...manifest,id:'jam-42',revision:'A',approvalHistory:[{revision:'A',approvedAt:'2026-11-05T14:30:00Z',manifest}],moderation:{status:'active'},registrationOpen:false,submissionsOpen:false,participantCount:0,participantLimit:100,participants:[],entries:[]};
  const detail={event,registration:null,entry:null,canMaintain:false,proposal:{revision:'B',status:'submitted',manifest}};
  for(const component of ['JamDetail','JamParticipate','Proposal','ApprovedVersions']){
    const h=harness({participateData:detail}),props=component==='Proposal'?{id:'jam-42',data:detail,onChanged:async()=>{}}:component==='ApprovedVersions'?{event}:{id:'jam-42'};
    const html=renderToStaticMarkup(h.render(component,props));
    assert.match(html,/Thu Nov 5 · 2026 · 8:15/);assert.match(html,/Asia\/Kathmandu/);
    assert.match(html,/dateTime="2026-11-05T14:30:00Z"/i);
    if(component==='ApprovedVersions')assert.match(html,/Thu Nov 5 · 2026 · 2:30[^<]* UTC/);
  }
});

test('actual SSR and initial client markup do not depend on browser timezone or read draft storage',async t=>{
  const React=require('react'),Original=Intl.DateTimeFormat;let detections=0;
  t.mock.method(Intl,'DateTimeFormat',function(...args){if(args.length)return new Original(...args);detections++;return {resolvedOptions:()=>({timeZone:'Asia/Tokyo'})};});
  const module={exports:{}};
  vm.runInNewContext(compile(clientSource),{module,exports:module.exports,require(name){
    if(name==='./HubGitHub')return {useHubGitHub:()=>({user:{id:'12',login:'creator',csrfToken:'csrf'}}),HubAccount:()=>null};
    if(name==='next/link')return {default:()=>null};
    return clientRequire(name);
  }});
  const server=renderToStaticMarkup(React.createElement(module.exports.JamCreate));
  const client=renderToStaticMarkup(harness().render('JamCreate'));
  assert.equal(server,client);assert.equal(detections,0);
  assert.match(server,/Create a ZeroJam/);assert.doesNotMatch(server,/Asia\/Tokyo/);
});


test('an early title edit merges browser timezone defaults or saved fields instead of suppressing restoration',async t=>{
  const {browserJamTimezone,defaultHostedJamDraft}=await import('../lib/jam-draft.mjs');
  const initial=defaultHostedJamDraft(),Original=Intl.DateTimeFormat;
  t.mock.method(Intl,'DateTimeFormat',function(...args){return args.length?new Original(...args):{resolvedOptions:()=>({timeZone:'Asia/Tokyo'})};});
  const initialize=()=>defaultHostedJamDraft('game',browserJamTimezone());
  const fresh=harness();fresh.renderDraft('hosted-create',initial,initialize)[1]({...initial,title:'Early title'},['title']);fresh.flushEffects();
  const freshDraft=fresh.renderDraft('hosted-create',initial,initialize)[0];
  assert.equal(freshDraft.title,'Early title');assert.equal(freshDraft.timezone,'Asia/Tokyo');
  const saved={...initial,title:'Saved title',summary:'Keep this description',rules:'Saved rules',timezone:'Pacific/Auckland',startsAt:'2030-11-05T09:30'};
  const storage=new Map([['zero-jam-draft:hosted-create',JSON.stringify(saved)]]),restored=harness({storage});
  restored.renderDraft('hosted-create',initial,initialize)[1]({...initial,title:'Early replacement'},['title']);restored.flushEffects();
  assert.deepEqual(JSON.parse(JSON.stringify(restored.renderDraft('hosted-create',initial,initialize)[0])),{...saved,title:'Early replacement'});
  restored.flushEffects();assert.deepEqual(JSON.parse(storage.get('zero-jam-draft:hosted-create')),{...saved,title:'Early replacement'});
});

test('an explicit early UTC timezone edit wins while untouched saved fields still restore',async()=>{
  const {defaultHostedJamDraft}=await import('../lib/jam-draft.mjs');
  const initial=defaultHostedJamDraft(),saved={...initial,title:'Saved title',timezone:'Pacific/Auckland',startsAt:'2030-11-05T09:30'};
  const storage=new Map([['zero-jam-draft:hosted-create',JSON.stringify(saved)]]),h=harness({storage});
  const set=h.renderDraft('hosted-create',initial,()=>({...initial,timezone:'Asia/Tokyo'}))[1];
  set({...initial,title:'New title'},['title']);
  set({...initial,timezone:'UTC'},['timezone']); // Same as the server fallback, but explicitly chosen.
  h.flushEffects();
  assert.deepEqual(JSON.parse(JSON.stringify(h.renderDraft('hosted-create',initial)[0])),{...saved,title:'New title',timezone:'UTC'});
});

test('participation merges an early title with its saved fields and isolates drafts through rapid account and event switches',()=>{
  const eventA='jam-42',eventB='jam-43',accountA={id:'12',login:'creator',csrfToken:'a'},accountB={id:'99',login:'other',csrfToken:'b'};
  const details=(id)=>({event:{id,title:'Jam',type:'game',timezone:'UTC',summary:'',theme:'',rules:'',eligibility:'',schedule:{},revision:'A',moderation:{status:'active'},registrationOpen:true,submissionsOpen:true,participants:[],participantCount:0,participantLimit:100,entries:[]},registration:{status:'joined',revision:'A'},entry:null,canMaintain:false});
  const saved=(name)=>({title:`${name} title`,description:`${name} private description`,demoUrl:`https://${name}.example/`,instructions:`${name} private instructions`});
  const key=(event,actor)=>`zero-jam-draft:entry-details:${event}:${actor.id}`;
  const sourceKey=(event,actor)=>`zero-jam-draft:entry-source:${event}:${actor.id}`;
  const a=saved('account-a'),b=saved('account-b'),c=saved('event-b'),storage=new Map();
  for(const [event,actor,draft]of [[eventA,accountA,a],[eventA,accountB,b],[eventB,accountB,c]]){
    storage.set(key(event,actor),JSON.stringify(draft));
    storage.set(sourceKey(event,actor),JSON.stringify({repositoryUrl:`https://github.com/${actor.login}/${event}`,commit:actor.id.repeat(40).slice(0,40)}));
  }
  const h=harness({storage,participateData:details(eventA)});
  const render=id=>h.render('JamParticipate',{id});
  const input=(tree,label)=>{
    const wrapper=elements(tree).find(node=>node.type==='label'&&node.props.children?.[0]===label);
    return elements(wrapper).find(node=>node.type==='input'||node.type==='textarea');
  };
  const source=tree=>elements(tree).find(node=>node.type?.name==='SourceFields').props.source;
  let tree=render(eventA);
  input(tree,'Entry title').props.onChange({target:{value:'Early participant edit'}});
  h.flushEffects();tree=render(eventA);
  assert.equal(input(tree,'Entry title').props.value,'Early participant edit');
  assert.equal(input(tree,'Description').props.value,a.description);
  assert.equal(input(tree,'Instructions (optional)').props.value,a.instructions);
  assert.equal(source(tree).repositoryUrl,`https://github.com/creator/${eventA}`);

  // Switch both identity and event before either new draft's restoration effects
  // run. No previous account/event text or source may appear in the new form.
  h.setActor(accountB);h.setDetail(details(eventA));tree=render(eventA);
  assert.equal(input(tree,'Entry title').props.value,'');assert.equal(source(tree).repositoryUrl,'');
  h.setDetail(details(eventB));tree=render(eventB);
  assert.equal(input(tree,'Description').props.value,'');assert.equal(source(tree).repositoryUrl,'');
  h.flushEffects();tree=render(eventB);
  assert.equal(input(tree,'Entry title').props.value,c.title);assert.equal(input(tree,'Description').props.value,c.description);
  assert.equal(source(tree).repositoryUrl,`https://github.com/other/${eventB}`);
  assert.equal(JSON.stringify(tree).includes(a.description),false);assert.equal(JSON.stringify(tree).includes(b.description),false);

  h.setDetail(details(eventA));tree=render(eventA);assert.equal(input(tree,'Description').props.value,'');
  h.flushEffects();tree=render(eventA);assert.equal(input(tree,'Description').props.value,b.description);
  assert.equal(source(tree).repositoryUrl,`https://github.com/other/${eventA}`);
  h.setActor(accountA);tree=render(eventA);assert.equal(input(tree,'Description').props.value,'');
  h.flushEffects();tree=render(eventA);
  assert.equal(input(tree,'Entry title').props.value,'Early participant edit');assert.equal(input(tree,'Description').props.value,a.description);
  assert.equal(source(tree).repositoryUrl,`https://github.com/creator/${eventA}`);
  h.flushEffects();
  assert.deepEqual(JSON.parse(storage.get(key(eventA,accountA))),{...a,title:'Early participant edit'});
  assert.deepEqual(JSON.parse(storage.get(key(eventA,accountB))),b);assert.deepEqual(JSON.parse(storage.get(key(eventB,accountB))),c);
});
