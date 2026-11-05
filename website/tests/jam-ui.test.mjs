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
function harness({storage=new Map(),fetcher=async()=>{throw new Error('network');},participateData=null}={}) {
  let actor={id:'12',login:'creator',csrfToken:'csrf'},index=0,slots=[];
  const self={},window={self,top:self};
  const react={useRef(value){const i=index++;return slots[i]??(slots[i]={current:value});},useState(value){const i=index++;if(!(i in slots))slots[i]=value;return [slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];},useCallback(fn){index++;return fn;},useEffect(){index++;}};
  const module={exports:{}};
  const context={participateData,module,exports:module.exports,require(name){if(name==='react')return react;if(name==='./JamPreparation')return {JamPreparation:()=>null};if(name==='./HubGitHub')return {useHubGitHub:()=>({user:actor}),HubAccount:()=>null};if(name==='next/link')return ()=>null;return require(name);},window,crypto:webcrypto,sessionStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},fetch:(...args)=>fetcher(...args),AbortSignal,Response,Request,URL,Map,console};
  vm.runInNewContext(compile(clientSource)+'\nif(participateData){useResource=()=>({data:participateData?.testError?null:participateData,error:participateData?.testError||"",loading:false,refresh:async()=>{}});useTopLevel=()=>true;}exports.testing={useMutation,useResource,JamPlanNotice,JamCreate,JamDiscovery,JamParticipate:JamParticipateForm,JamParticipateWrapper:JamParticipate,ApprovedVersions,JamDetail,HeldEntryModeration,ModerationInbox,MaintainerTools};',context);
  return {render(kind='useMutation',path='/api/jams/jam-42/actions',discardOnError=false){index=0;return module.exports.testing[kind](path,discardOnError);},setActor(value){actor=value;},setDetail(value){context.participateData=value;},frame(){window.top={};},storage};
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
test('entry moderation is maintainer-only in the gallery and sends the public reason and participant identity',async()=>{
  assert.match(clientSource,/data\.canMaintain&&<EntryModeration id=\{id\} participantId=\{entry\.participantId\} onChanged=\{refreshAfterModeration\}/);
  assert.match(clientSource,/<summary>Maintainer review<\/summary>/);
  assert.match(clientSource,/<label>Public reason<textarea required/);
  assert.match(clientSource,/mutation\.send\(\{action:'withdraw-entry',participantId,reason\}\)/);
  assert.match(clientSource,/if\(result\)await onChanged\(\)/);
  const payload={action:'withdraw-entry',participantId:'14',reason:'Uncredited copied work'};
  let received;
  const h=harness({fetcher:async(url,init)=>{received=JSON.parse(init.body);return confirmed(init);}});
  assert.ok(await h.render().send(payload));
  const {operationId,...sent}=received;assert.deepEqual(sent,payload);assert.ok(operationId);
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
  assert.equal(elements(h.render('JamDetail',{id:'jam-42'})).filter(node=>node.type?.name==='MaintainerTools').length,1);
  assert.equal(elements(h.render('MaintainerTools',{id:'jam-42',onChanged:async()=>{}})).filter(node=>node.type?.name==='ModerationInbox').length,1);
  const inbox=h.render('ModerationInbox',{id:'jam-42',onChanged:async()=>{}});
  const held=elements(inbox).filter(node=>node.type?.name==='HeldEntryModeration');
  assert.equal(held.length,1);assert.equal(held[0].props.entries[0].title,'Hidden project');
  const section=h.render('HeldEntryModeration',{id:'jam-42',entries:[entry],onChanged:async()=>{}});
  assert.ok(elements(section).some(node=>node.type?.name==='EntryModeration'&&node.props.participantId==='33'));
  h.setDetail({...data,canMaintain:false});assert.equal(elements(h.render('MaintainerTools',{id:'jam-42',onChanged:async()=>{}})).some(node=>node.type?.name==='ModerationInbox'),false);
  h.setDetail({...data,moderationEntries:[]});assert.equal(elements(h.render('ModerationInbox',{id:'jam-42',onChanged:async()=>{}})).some(node=>node.type?.name==='HeldEntryModeration'),false);
  h.setDetail(null);assert.ok(elements(h.render('JamDetail',{id:'jam-42'})).some(node=>node.type?.name==='MaintainerTools'),'gallery failure does not unmount the independent maintainer path');
  h.setActor(null);assert.equal(elements(h.render('JamDetail',{id:'jam-42'})).some(node=>node.type?.name==='MaintainerTools'),false);
});

test('maintainer overview errors can be retried and gallery moderation refreshes the independent inbox',async()=>{
  const entry={participantId:'33',login:'student',title:'Project',description:'Project',demoUrl:'https://student.github.io/project/',repository:{id:'202',ownerId:'33',fullName:'student/project'}};
  const event={id:'jam-42',title:'Jam',type:'game',timezone:'UTC',summary:'',theme:'',rules:'',eligibility:'',schedule:{},revision:'A',moderation:{status:'active'},registrationOpen:false,submissionsOpen:false,participants:[],participantCount:1,entries:[entry]};
  const data={configured:true,event,entry:null,registration:null,canMaintain:true,moderationEntries:[entry]};
  const h=harness({participateData:data}),render=()=>elements(h.render('JamDetail',{id:'jam-42'}));
  const first=render().find(node=>node.type?.name==='MaintainerTools');
  await render().find(node=>node.type?.name==='EntryModeration').props.onChanged();
  const next=render().find(node=>node.type?.name==='MaintainerTools');
  assert.notEqual(first.key,next.key,'gallery moderation remounts the separately fetched inbox');
  h.setDetail(null);
  assert.ok(render().some(node=>node.props?.role==='status'&&node.props.children==='Most recent confirmed moderation: submission withdrawn.'),'confirmation survives an unavailable gallery');
  h.setActor({id:'99',login:'other',csrfToken:'other'});
  assert.equal(render().some(node=>node.props?.role==='status'&&node.props.children==='Most recent confirmed moderation: submission withdrawn.'),false,'confirmation is scoped to the signed-in identity');
  h.setDetail({...data,testError:'Overview unavailable'});
  const retry=elements(h.render('MaintainerTools',{id:'jam-42',onChanged:async()=>{}})).find(node=>node.type?.name==='Retry');
  assert.equal(retry.props.error,'Overview unavailable');assert.equal(typeof retry.props.refresh,'function');
  const sameError=elements(h.render('MaintainerTools',{id:'jam-42',onChanged:async()=>{},galleryError:'Overview unavailable'}));
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

test('participation shows the server-provided capacity before the join action',async()=>{
  const source=await readFile(new URL('../components/JamClient.tsx',import.meta.url),'utf8');
  assert.match(source,/room for up to \{data\.event\.participantLimit\} participants/);
  assert.ok(source.indexOf('room for up to {data.event.participantLimit}')<source.indexOf("'Join this jam'"));
});


test('Jam discovery and creation explain free participation and manual Pro access',()=>{
  const h=harness(),markup=renderToStaticMarkup(h.render('JamPlanNotice'));
  assert.match(markup,/Joining a jam is free/);assert.match(markup,/Pro license/);assert.match(markup,/up to 100 participants/);
  assert.match(markup,/href="mailto:info@codepet.ca"/);assert.match(markup,/enabled manually/);assert.match(markup,/no online checkout yet/);
  for(const page of ['JamDiscovery','JamCreate'])assert.ok(elements(h.render(page)).some(node=>node.type?.name==='JamPlanNotice'));
});

test('server-denied Pro proposal shows its error and keeps the operation for retry',async()=>{
  const storage=new Map(),denial='A Pro license is required to propose a jam. Contact info@codepet.ca.';let calls=0;
  const h=harness({storage,fetcher:async()=>{calls++;return Response.json({configured:true,error:denial},{status:403});}});
  assert.equal(await h.render('useMutation','/api/jams/proposals').send({manifest:{title:'Draft'}}),null);
  assert.equal(h.render('useMutation','/api/jams/proposals').error,denial);assert.equal(calls,1);assert.equal(storage.size,1);
});
