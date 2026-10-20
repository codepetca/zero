'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createGitHubSetup} = require('../src/github-app/setup-ui');
const url = 'https://github.com/apps/codepet-zero/installations/new';
const waitFor = async fn => {const end=Date.now()+2000;while(!fn()){assert.ok(Date.now()<end,'Setup state did not arrive');await new Promise(resolve=>setImmediate(resolve));}};
function fixture({ready=false, check, open=async()=>true, capture}={}) {
  const ticket={session:{accountId:'42',label:'learner'}},calls=[],reports=[],focus=new Set(),pickers=[];
  let changed=false,cancel;
  const auth={capture:capture||(async()=>ticket),assertCurrent:async value=>{assert.equal(value,ticket);if(changed)throw Error('Account changed');}};
  const vscode={Uri:{parse:value=>value},ProgressLocation:{Notification:15},env:{openExternal:async value=>{calls.push(['open',value]);return open(value);}},window:{
    withProgress:async(options,run)=>{assert.equal(options.cancellable,true);return run({}, {onCancellationRequested:fn=>{cancel=fn;return {dispose(){cancel=undefined;}};}});},
    onDidChangeWindowState:fn=>{focus.add(fn);return {dispose:()=>focus.delete(fn)};},
    createQuickPick:()=>{const accept=new Set(),hide=new Set();const picker={selectedItems:[],onDidAccept:fn=>{accept.add(fn);return {dispose:()=>accept.delete(fn)};},onDidHide:fn=>{hide.add(fn);return {dispose:()=>hide.delete(fn)};},show(){this.shown=true;},dispose(){this.disposed=true;for(const fn of hide)fn();},choose(action){this.selectedItems=this.items.filter(x=>x.action===action);for(const fn of accept)fn();},escape(){for(const fn of hide)fn();}};pickers.push(picker);return picker;}
  }};
  const setup=createGitHubSetup({vscode,authentication:auth,repositories:{async checkSetup(options){calls.push(['check',options]);if(check)return check(options);if(!ready)throw Object.assign(Error('Approval required'),{code:'installation-required',actionUrl:url});return {ticket};}},installationUrl:url,report:value=>reports.push(value)});
  return {setup,calls,reports,pickers,ready(value=true){ready=value;},changed(){changed=true;},cancel(){cancel();},focus(){for(const fn of focus)fn({focused:true});}};
}
test('ready saved connection checks access without a browser or setup picker',async()=>{
  const f=fixture({ready:true});assert.equal(await f.setup.ensure(),true);assert.equal(f.pickers.length,0);assert.equal(f.calls.length,1);assert.equal(f.reports.at(-1),'GitHub is ready for your projects');f.setup.dispose();
});
test('explicit approval opens only the pinned URL, then returning to Zero continues automatically',async()=>{
  const f=fixture(),pending=f.setup.ensure();await waitFor(()=>f.pickers[0]?.shown);const p=f.pickers[0];
  assert.equal(f.calls.filter(x=>x[0]==='open').length,0);assert.match(p.placeholder,/learner/);assert.match(p.items[0].detail,/selected repositories/);assert.equal(p.ignoreFocusOut,true);
  p.choose('open');await waitFor(()=>!p.busy);assert.equal(f.calls.at(-1)[1],url);
  f.ready();f.focus();assert.equal(await pending,true);assert.equal(p.disposed,true);f.focus();assert.equal(f.calls.filter(x=>x[0]==='check').length,2);f.setup.dispose();
});
test('unconfirmed access stays in setup; Check again resumes the same pending operation',async()=>{
  const f=fixture(),pending=f.setup.ensure();assert.equal(f.setup.ensure(),pending);await waitFor(()=>f.pickers[0]?.shown);const p=f.pickers[0];p.choose('check');await waitFor(()=>!p.busy);assert.match(p.placeholder,/Access not confirmed/);assert.equal(p.disposed,undefined);f.ready();p.choose('check');assert.equal(await pending,true);f.setup.dispose();
});
test('Escape preserves sign-in and permits retry without granting access or reporting ready',async()=>{
  const f=fixture(),pending=f.setup.ensure();await waitFor(()=>f.pickers[0]?.shown);f.pickers[0].escape();assert.equal(await pending,false);assert.ok(f.calls[0][1].signal.aborted);assert.ok(!f.reports.includes('GitHub is ready for your projects'));f.ready();assert.equal(await f.setup.ensure(),true);f.setup.dispose();
});
test('native progress cancellation aborts the preflight and discards its late result',async()=>{
  let release;const f=fixture({check:()=>new Promise(resolve=>{release=resolve;})}),pending=f.setup.ensure();await waitFor(()=>release);f.cancel();release({});assert.equal(await pending,false);assert.equal(f.pickers.length,0);assert.ok(f.calls[0][1].signal.aborted);assert.ok(!f.reports.includes('GitHub is ready for your projects'));f.setup.dispose();
});
test('disposal during preflight or approval does not open a browser or finish onboarding',async()=>{
  let release;const f=fixture({check:()=>new Promise(resolve=>{release=resolve;})}),pending=f.setup.ensure();await waitFor(()=>release);f.setup.dispose();release({});assert.equal(await pending,false);assert.equal(f.pickers.length,0);
  const g=fixture(),next=g.setup.ensure();await waitFor(()=>g.pickers[0]?.shown);g.setup.dispose();assert.equal(await next,false);g.focus();assert.equal(g.calls.length,1);assert.equal(g.pickers[0].disposed,true);
});
test('network errors and untrusted setup URLs fail without opening approval UI',async()=>{
  for(const error of [Object.assign(Error('Network unavailable'),{code:'network-error'}),Object.assign(Error('Wrong URL'),{code:'permission-required',actionUrl:'https://example.invalid'})]){
    const f=fixture({check:async()=>{throw error;}});await assert.rejects(f.setup.ensure(),error);assert.equal(f.pickers.length,0);assert.equal(f.calls.filter(x=>x[0]==='open').length,0);f.setup.dispose();
  }
});
test('permission and access rejections use the same guided approval path',async()=>{
  for(const code of ['permission-required','github-error']){const f=fixture({check:async()=>{throw Object.assign(Error('Approval required'),{code,actionUrl:url});}}),pending=f.setup.ensure();await waitFor(()=>f.pickers[0]?.shown);f.pickers[0].escape();assert.equal(await pending,false);f.setup.dispose();}
});
test('browser-open failure can be retried without treating a focus event as approval',async()=>{
  let opens=0;const f=fixture({open:async()=>++opens>1}),pending=f.setup.ensure();await waitFor(()=>f.pickers[0]?.shown);const p=f.pickers[0];p.choose('open');await waitFor(()=>!p.busy);assert.match(p.placeholder,/browser did not open/);f.focus();assert.equal(f.calls.filter(x=>x[0]==='check').length,1);p.choose('open');await waitFor(()=>!p.busy);f.ready();f.focus();assert.equal(await pending,true);f.setup.dispose();
});
test('changed account during approval stops continuation',async()=>{
  const f=fixture(),pending=f.setup.ensure();await waitFor(()=>f.pickers[0]?.shown);f.changed();f.ready();f.pickers[0].choose('check');await assert.rejects(pending,/Account changed/);assert.ok(!f.reports.includes('GitHub is ready for your projects'));f.setup.dispose();
});
test('late canceled recheck cannot complete or overwrite a new setup attempt',async()=>{
  let call=0,release;const f=fixture({check:async()=>{call++;if(call===1)throw Object.assign(Error('Approval required'),{code:'installation-required',actionUrl:url});if(call===2)return new Promise(resolve=>{release=resolve;});return {};}}),first=f.setup.ensure();await waitFor(()=>f.pickers[0]?.shown);f.pickers[0].choose('check');await waitFor(()=>release);f.pickers[0].escape();assert.equal(await first,false);const next=f.setup.ensure();assert.equal(await next,true);const before=f.reports.length;release({});await new Promise(resolve=>setImmediate(resolve));assert.equal(f.reports.length,before);f.setup.dispose();
});
