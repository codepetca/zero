import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
import ts from 'typescript';
import {renderToStaticMarkup} from 'react-dom/server';
import {githubHttpFixture} from '../../jams/test/github-http-fixture.mjs';
import {participant} from '../../jams/test/fixtures.mjs';
const require=createRequire(import.meta.url);
const clientSource=await readFile(new URL('../components/JamClient.tsx',import.meta.url),'utf8');
const panelSource=await readFile(new URL('../app/hub/jams/[id]/panel/route.ts',import.meta.url),'utf8');
function compile(source){return ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;}
function harness({storage=new Map(),fetcher=async()=>{throw new Error('network');},participateData=null,onRefresh=async()=>{},effects=false}={}) {
  let actor={id:'12',login:'creator',csrfToken:'csrf'},index=0,slots=[],pendingEffects=[];
  const self={},window={self,top:self};
  const react={useRef(value){const i=index++;return slots[i]??(slots[i]={current:value});},useState(value){const i=index++;if(!(i in slots))slots[i]=value;return [slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];},useCallback(fn){index++;return fn;},useEffect(fn,deps){const i=index++;if(effects&&(!slots[i]||deps.some((value,n)=>!Object.is(value,slots[i][n])))){pendingEffects.push(fn);slots[i]=deps;}}};
  const module={exports:{}};
  const context={participateData,onRefresh,module,exports:module.exports,require(name){if(name==='react')return react;if(name==='./JamPreparation')return {JamPreparation:()=>null};if(name==='./HubGitHub')return {useHubGitHub:()=>({user:actor}),HubAccount:()=>null};if(name==='next/link')return ()=>null;return require(name);},window,crypto:webcrypto,sessionStorage:{get length(){return storage.size;},key:i=>[...storage.keys()][i]??null,getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},fetch:(...args)=>fetcher(...args),AbortSignal,Response,Request,URL,Map,console};
  vm.runInNewContext(compile(clientSource)+'\nif(participateData){useResource=()=>({data:participateData,error:"",loading:false,refresh:onRefresh});useTopLevel=()=>true;}exports.testing={useMutation,useResource,JamParticipate,ApprovedVersions,Proposal,Moderation,EntryModeration,Feedback,JamCreate};',context);
  return {render(kind='useMutation',path='/api/jams/jam-42/actions'){index=0;return module.exports.testing[kind](path);},flushEffects(){const work=pendingEffects;pendingEffects=[];work.forEach(fn=>fn());},setActor(value){actor=value;},setDetail(value){context.participateData=value;},frame(){window.top={};},storage};
}
function elements(node) {
  if(Array.isArray(node))return node.flatMap(elements);
  if(!node||typeof node!=='object')return [];
  return [node,...elements(node.props?.children)];
}
function confirmed(init){const body=JSON.parse(init.body);return Response.json({configured:true,eventId:'jam-42',operationId:body.operationId});}
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
for(const kind of ['Proposal','Moderation','EntryModeration']) {
  test(`${kind} retains an uncertain reason and operation through reload, scopes drafts and clears only on confirmation`,{timeout:10000},async()=>{
    const storage=new Map(),calls=[],reason='Public test reason, preserved exactly.  ',actor={id:'22',login:'maintainer',csrfToken:'csrf'};
    let failing=true,finished,finishResponse;
    const fetcher=async(url,init)=>{calls.push(JSON.parse(init.body));if(failing)throw Error('unknown outcome');await new Promise(resolve=>{finishResponse=resolve;});return confirmed(init);};
    const props={id:'jam-42',participantId:'33',revision:'a'.repeat(64),event:{revision:'event-A',moderation:{status:'active'}},data:{event:{},canMaintain:true,proposal:{status:'submitted',revision:'a'.repeat(64),repository:{ownerId:'11',fullName:'creator/jam',commit:'a'.repeat(40)},manifest:{}}},onChanged:async()=>finished?.()};
    const render=h=>h.render(kind,props),field=tree=>elements(tree).find(node=>node.type==='textarea');
    const act=tree=>kind==='EntryModeration'?elements(tree).find(node=>node.type==='form').props.onSubmit({preventDefault(){}}):elements(tree).find(node=>node.type==='button'&&node.props.children===(kind==='Proposal'?'Request changes':'Suspend jam')).props.onClick();
    const first=harness({storage,fetcher,effects:true});first.setActor(actor);render(first);first.flushEffects();
    field(render(first)).props.onChange({target:{value:reason}});act(render(first));await new Promise(setImmediate);
    assert.equal(calls.length,1);assert.ok(elements(render(first)).find(node=>Boolean(node.props?.error)));
    const second=harness({storage,fetcher,effects:true});second.setActor(actor);render(second);second.flushEffects();
    assert.equal(field(render(second)).props.value,reason);
    if(kind==='Proposal')props.data.proposal.revision='b'.repeat(64);
    if(kind==='Moderation')props.event.moderation.status='suspended';
    if(kind==='EntryModeration')props.revision='b'.repeat(64);
    assert.equal(field(render(second)).props.value,'','a changed review subject never inherits the old reason');second.flushEffects();
    if(kind==='Proposal')props.data.proposal.revision='a'.repeat(64);
    if(kind==='Moderation')props.event.moderation.status='active';
    if(kind==='EntryModeration')props.revision='a'.repeat(64);
    render(second);second.flushEffects();assert.equal(field(render(second)).props.value,reason);
    second.setActor({...actor,id:'99'});assert.equal(field(render(second)).props.value,'','another actor cannot see the draft, even before effects');second.flushEffects();
    field(render(second)).props.onChange({target:{value:'Another actor public draft'}});
    second.setActor(actor);render(second);second.flushEffects();assert.equal(field(render(second)).props.value,reason);
    failing=false;const done=new Promise(resolve=>{finished=resolve;});act(render(second));await new Promise(setImmediate);
    second.setActor({...actor,id:'99'});render(second);second.flushEffects();assert.equal(field(render(second)).props.value,'Another actor public draft');
    finishResponse();await done;
    assert.equal(calls.length,2);assert.equal(calls[1].operationId,calls[0].operationId);assert.equal(calls[1].reason,reason);
    assert.equal(field(render(second)).props.value,'Another actor public draft','late confirmation clears only its original account/context');
    second.setActor(actor);render(second);second.flushEffects();
    assert.equal(field(render(second)).props.value,'');
    const third=harness({storage,fetcher,effects:true});third.setActor(actor);render(third);third.flushEffects();assert.equal(field(render(third)).props.value,'');
  });
}
for(const mode of ['unreadable success','unconfigured success','wrong operation confirmation']) {
  test(`client reload recovers one actual stored join after ${mode}`,{timeout:10000},async t=>{
    const f=await githubHttpFixture(t),revision=await f.approve(),storage=new Map(),calls=[];
    let damaged=true;
    const fetcher=async(url,init)=>{
      assert.equal(url,'/api/jams/jam-101/actions');const body=JSON.parse(init.body);calls.push(body);
      assert.equal(body.actor,undefined);
      const result=await f.service.mutate({...body,id:'jam-101',actor:participant});
      if(damaged) {
        if(mode==='unreadable success')return new Response('{broken',{headers:{'Content-Type':'application/json'}});
        return Response.json({...result,configured:mode!=='unconfigured success',...(mode==='wrong operation confirmation'?{operationId:'wrong-operation'}:{})});
      }
      return Response.json({configured:true,...result});
    };
    const first=harness({storage,fetcher});first.setActor({...participant,csrfToken:'fixture-csrf'});
    const payload={action:'join',revision},before=f.commits.length;
    assert.equal(await first.render('useMutation','/api/jams/jam-101/actions').send(payload),null);
    assert.equal(first.render('useMutation','/api/jams/jam-101/actions').success,'');assert.equal(f.commits.length,before+1);
    const reloaded=harness({storage,fetcher});reloaded.setActor({...participant,csrfToken:'fixture-csrf'});damaged=false;
    f.sourceUnavailable=true;f.time=Date.parse('2030-01-05T00:00:00Z');
    assert.equal((await reloaded.render('useMutation','/api/jams/jam-101/actions').send(payload)).status,'joined');
    assert.equal(calls[1].operationId,calls[0].operationId);assert.equal(f.commits.length,before+1);
    assert.equal(Object.keys(f.state().registrations).length,1);assert.equal(storage.size,0);
  });
}

test('lost Join reply must resolve before Leave; the next Join is a new stored operation', {timeout:10000},async t=>{
  const f=await githubHttpFixture(t),revision=await f.approve(),calls=[];let lose=true;
  const h=harness({fetcher:async(url,init)=>{
    const body=JSON.parse(init.body);calls.push(body);
    const result=await f.service.mutate({...body,id:'jam-101',actor:participant});
    if(lose){lose=false;return new Response('{broken',{headers:{'Content-Type':'application/json'}});}
    return Response.json({configured:true,...result});
  }});h.setActor({...participant,csrfToken:'fixture-csrf'});
  const render=()=>h.render('useMutation','/api/jams/jam-101/actions'),payload={action:'join',revision};
  assert.equal(await render().send(payload),null);assert.equal(f.state().registrations[participant.id].status,'joined');
  assert.equal(await render().send({action:'leave'}),null);
  assert.equal(calls.length,1,'an unresolved Join blocks an intervening Leave');
  assert.match(render().error,/Resolve your earlier request/);
  assert.equal((await render().retry()).status,'joined');
  assert.equal(calls[1].operationId,calls[0].operationId,'recovery uses exactly the uncertain operation');
  assert.equal((await render().send({action:'leave'})).status,'left');
  assert.equal(f.state().registrations[participant.id].status,'left');
  assert.equal((await render().send(payload)).status,'joined');
  assert.notEqual(calls[3].operationId,calls[0].operationId,'a new Join gets a fresh operation');
  assert.equal(f.state().registrations[participant.id].status,'joined');
  assert.equal(render().success,'Confirmed by Zero.');
});
test('retry through the original Join button identifies historical recovery after another device leaves', {timeout:10000},async t=>{
  const f=await githubHttpFixture(t),revision=await f.approve(),calls=[];let lose=true;
  const h=harness({fetcher:async(url,init)=>{const body=JSON.parse(init.body);calls.push(body);const result=await f.service.mutate({...body,id:'jam-101',actor:participant});if(lose){lose=false;return new Response('{lost');}return Response.json({configured:true,...result});}});h.setActor({...participant,csrfToken:'fixture-csrf'});
  const render=()=>h.render('useMutation','/api/jams/jam-101/actions'),join={action:'join',revision};
  await render().send(join);
  await f.service.mutate({id:'jam-101',actor:participant,operationId:'other-device-leave',action:'leave'});
  assert.equal((await render().send(join)).status,'joined');assert.equal(calls[1].operationId,calls[0].operationId);
  assert.match(render().success,/^Earlier request confirmed/,'historical recovery does not claim the new intent completed');
  assert.equal(f.state().registrations[participant.id].status,'left','historical retry never reverses the other device');
  await render().send(join);assert.notEqual(calls[2].operationId,calls[0].operationId);assert.equal(f.state().registrations[participant.id].status,'joined');
});
test('participation UI recovers a lost Join after reload and authoritative refresh, then Leave → Join commits once each', {timeout:10000},async t=>{
  const f=await githubHttpFixture(t);await f.approve();const storage=new Map(),calls=[];let lose=true,h,finishRefresh;
  const read=()=>f.service.read('jam-101',participant);
  const refresh=async()=>{h.setDetail({configured:true,...await read()});finishRefresh?.();finishRefresh=null;};
  const fetcher=async(url,init)=>{const body=JSON.parse(init.body);calls.push(body);const result=await f.service.mutate({...body,id:'jam-101',actor:participant});if(lose){lose=false;return new Response('{broken');}return Response.json({configured:true,...result});};
  const make=async()=>{h=harness({storage,fetcher,effects:true,participateData:{configured:true,...await read()},onRefresh:refresh});h.setActor({...participant,csrfToken:'fixture-csrf'});render();h.flushEffects();};
  const render=()=>h.render('JamParticipate',{id:'jam-101'}),button=(tree,name)=>elements(tree).find(n=>n.type==='button'&&n.props.children===name);
  const acknowledge=()=>elements(render()).find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});
  const click=async name=>{button(render(),name).props.onClick();await new Promise(setImmediate);};
  const before=f.commits.length;await make();acknowledge();await click('Join this jam');
  // The UI handler is void; wait for the actual loopback request to complete.
  // Await transport completion without timing assumptions using the shared lock.
  const settled=async()=>{for(let i=0;i<200;i++){const feedback=elements(render()).find(n=>n.props?.mutation);if(!feedback.props.mutation.busy)return;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('request did not settle');};
  await settled();assert.equal(f.state().registrations[participant.id].status,'joined');
  await make();assert.equal(button(render(),'Join this jam'),undefined,'authoritative refresh removes the original Join button');
  await click('Leave jam and withdraw my entry');await settled();assert.equal(calls.length,1,'Leave is blocked by the pending Join');
  const feedback=elements(render()).find(n=>n.props?.mutation),recovery=h.render('Feedback',feedback.props);
  await button(recovery,'Resolve earlier request').props.onClick();assert.equal(calls[1].operationId,calls[0].operationId);
  let changed=new Promise(resolve=>finishRefresh=resolve);await click('Leave jam and withdraw my entry');await changed;assert.equal(f.state().registrations[participant.id].status,'left');
  acknowledge();changed=new Promise(resolve=>finishRefresh=resolve);await click('Join this jam');await changed;assert.equal(f.state().registrations[participant.id].status,'joined');
  assert.notEqual(calls[3].operationId,calls[0].operationId);assert.equal(f.commits.length,before+3,'Join, Leave and new Join each commit once; resolution only reads the historical result');
});
test('operation identity changes for payload, actor and endpoint; duplicate in-flight writes are suppressed',async()=>{
  const ids=[],fetcher=async(url,init)=>{ids.push(JSON.parse(init.body).operationId);throw new Error('unknown');};
  const h=harness({fetcher});await h.render().send({action:'join',revision:'a'});await h.render().send({action:'join',revision:'b'});
  h.setActor({id:'99',login:'other',csrfToken:'other'});await h.render().send({action:'join',revision:'b'});await h.render('useMutation','/api/jams/jam-88/actions').send({action:'join',revision:'b'});
  assert.equal(new Set(ids).size,3);assert.equal(ids.length,3,'changed payload is blocked until the earlier intent resolves');
  let finish;const active=harness({fetcher:async(url,init)=>{await new Promise(resolve=>{finish=resolve;});return confirmed(init);}}).render();
  const pending=active.send({action:'join',revision:'a'});assert.equal(await active.send({action:'join',revision:'a'}),null);finish();assert.ok(await pending);
});
test('legacy pending requests restore an independent recovery control even when the original action disappears',async()=>{
  const storage=new Map(),payload={action:'join',revision:'approved'},operationId=webcrypto.randomUUID(),path='/api/jams/jam-42/actions';
  storage.set('zero-jam-operation:'+JSON.stringify(['12',path,payload]),operationId);
  const calls=[],h=harness({storage,effects:true,fetcher:async(url,init)=>{calls.push(JSON.parse(init.body));return confirmed(init);}});
  h.render();h.flushEffects();const mutation=h.render();assert.equal(mutation.pending.action,'join');
  let refreshed=0;
  const tree=h.render('Feedback',{mutation,onRecovered:async()=>refreshed++});
  const retry=elements(tree).find(n=>n.type==='button'&&n.props.children==='Resolve earlier request');assert.ok(retry);
  await retry.props.onClick();assert.equal(refreshed,1);assert.equal(calls[0].operationId,operationId);assert.equal(storage.size,0);
});
test('all legacy unknown intents are settled in order, including across same-endpoint controls',async()=>{
  const storage=new Map(),path='/api/jams/jam-42/actions',ids=[webcrypto.randomUUID(),webcrypto.randomUUID()];
  for(const [i,payload] of [{action:'join',revision:'a'},{action:'leave'}].entries())storage.set('zero-jam-operation:'+JSON.stringify(['12',path,payload]),ids[i]);
  const calls=[],h=harness({storage,effects:true,fetcher:async(url,init)=>{calls.push(JSON.parse(init.body));return confirmed(init);}});
  assert.equal(await h.render().send({action:'submit'}),null);
  await h.render().retry();assert.equal(h.render().pending.action,'leave');await h.render().retry();assert.equal(h.render().pending,undefined);
  assert.deepEqual(calls.map(c=>c.operationId),ids);
});
test('first explicit rejection allows correction; rejection after an unknown outcome retains recovery',async()=>{
  const calls=[];let mode='reject';const h=harness({fetcher:async(url,init)=>{calls.push(JSON.parse(init.body));if(mode==='lost')throw Error('lost');if(mode==='ok')return confirmed(init);return Response.json({configured:true,error:'Review the current rules'},{status:409});}});
  assert.equal(await h.render().send({action:'join',revision:'old'}),null);assert.equal(h.render().pending,undefined);
  mode='lost';await h.render().send({action:'join',revision:'new'});const id=calls.at(-1).operationId;
  mode='reject';await h.render().retry();assert.equal(h.render().pending.revision,'new');
  mode='ok';await h.render().retry();assert.equal(calls.at(-1).operationId,id);assert.equal(h.render().pending,undefined);
});
test('pending requests and late feedback stay with their original actor and endpoint',async()=>{
  let finish;const storage=new Map(),h=harness({storage,fetcher:async(url,init)=>{await new Promise(resolve=>finish=resolve);return confirmed(init);}});
  const first=h.render(),request=first.send({action:'join',revision:'a'});
  assert.equal(await h.render().send({action:'leave'}),null,'a sibling control shares the lock');
  h.setActor({id:'99',login:'other',csrfToken:'other'});assert.equal(h.render().pending,undefined);assert.equal(h.render().busy,false);
  finish();await request;assert.equal(h.render().success,'');assert.equal(storage.size,0);
});
test('frames and signed-out callers cannot mutate; unconfigured or unconfirmed responses never succeed',async()=>{
  let writes=0;const fetcher=async()=>{writes++;return Response.json({configured:false,error:'Not configured'},{status:503});};
  const framed=harness({fetcher});framed.frame();assert.equal(await framed.render().send({action:'join'}),null);
  const signedOut=harness({fetcher});signedOut.setActor(null);assert.equal(await signedOut.render().send({action:'join'}),null);assert.equal(writes,0);
  assert.equal(await harness({fetcher}).render().send({action:'join'}),null);
  const malformed=harness({fetcher:async()=>Response.json({configured:true})});assert.equal(await malformed.render().send({action:'join'}),null);
});
test('submission contract requires a demo URL and preserves exact source and demo in the request',async()=>{
  assert.match(clientSource,/<label>Demo URL<input type="url" required value=\{demoUrl\}/);
  assert.match(clientSource,/act\('submit',\{source,title,description,demoUrl,/);
  const payload={action:'submit',revision:'accepted',source:{repositoryUrl:'https://github.com/creator/project',commit:'a'.repeat(40)},title:'My app',description:'An app',demoUrl:'https://creator.github.io/project/'};
  let received;
  const h=harness({fetcher:async(url,init)=>{received=JSON.parse(init.body);return confirmed(init);}});
  assert.ok(await h.render().send(payload));
  const {operationId,...sent}=received;assert.deepEqual(sent,payload);assert.ok(operationId);
});
test('entry moderation is maintainer-only in the gallery and sends the public reason and participant identity',async()=>{
  assert.match(clientSource,/data\.canMaintain&&<EntryModeration id=\{id\} participantId=\{entry\.participantId\} revision=\{entry\.revision\} onChanged=\{refresh\}/);
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
  assert.match(clientSource,/useDraft<Source>\('create-source'/);
  assert.match(clientSource,/useDraft\(`entry-details:/);
});
function panelModule(reply,seen) {
  const module={exports:{}};
  const context={module,exports:module.exports,require:name=>name.includes('jams-access')?{authorizeJamRequest:()=>null}:name.includes('jams-pilot-policy')?{jamOfficialOrigin:()=> 'https://zero.codepet.ca'}:{getJamResponse:async(request,id)=>{seen.push({request,id});return Response.json(reply.body,{status:reply.status||200});}},Request,Response,URL};
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
