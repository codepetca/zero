'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {createGameJamJoin} = require('../src/game-jam-join');

const REVISION = 'a'.repeat(64);
const REPO = 'https://github.com/student/moon-game';
const JAM = {
  id:'jam-42',title:'Toast to the Moon',type:'game',revision:REVISION,registrationOpen:true,
  rules:'Build your own game.',eligibility:'Beginning Java students',timezone:'America/Toronto',
  schedule:{registrationClosesAt:'2026-11-25T12:00:00Z',submissionsCloseAt:'2026-11-30T12:00:00Z'}
};

function fixture({choose='new',choices=[],events=[JAM],send,change,registration=null,hasRegistrationSpace=true,canManageProjects,submittedRepositoryId,leaveRevision,openError,lookup}={}) {
  const ticket = {session:{accountId:'123',accessToken:'ghu_test'}};
  const calls = {picks:[],prompts:[],writes:[],projectChanges:[],leaves:[],urls:[],status:[],open:[],newProject:0,existing:0,lookups:[]};
  const saved = new Map();
  let chooseJam;
  const authentication = {
    assertCurrentNow(value) {assert.equal(value,ticket);return ticket.session;},
    async assertCurrent(value) {return this.assertCurrentNow(value);}
  };
  const join = createGameJamJoin({
    vscode:{window:{
      async showQuickPick(items) {
        calls.picks.push(items);
        const action=choices.shift()??choose;
        return items.find(item=>chooseJam && item.id===chooseJam || item.action===action) || items[0];
      },
      async showInformationMessage(message,options,accept) {calls.prompts.push({message,options});return accept;},
      async showWarningMessage(message,options,accept) {calls.prompts.push({message,options});return accept;}
    }},
    authentication,
    projects:{async newProject({preparedTicket,onCloned}) {
      assert.equal(preparedTicket,ticket);
      calls.newProject++;
      await onCloned({repositoryUrl:REPO,repositoryId:'456',projectPath:'/projects/moon-game'});
    }},
    projectPicker:{async choose(options) {
      assert.deepEqual(options,{publicRepositoriesOnly:true,...(registration?.repository?.id ?
        {repositoryId:registration.repository.id} : {standaloneOnly:true})});
      calls.existing++;
      return {repositoryUrl:REPO,repositoryId:'456'};
    }},
    repositories:{async readOwnedRepository(url,options) {
      calls.lookups.push(url);assert.equal(options.ticket,ticket);
      if(lookup)return lookup(url);
      throw Object.assign(Error('Renamed repository'),{code:'repository-not-selected'});
    }},
    async openGameJamProject({ticket:provided,repositoryUrl,repositoryId,preferredPath}) {
      assert.equal(provided,ticket);
      assert.equal(repositoryId,'456');calls.open.push({repositoryUrl,preferredPath});
      if (openError) throw openError;
    },
    globalState:{keys:()=>[...saved.keys()],get:key=>saved.get(key),update:async(key,value)=>saved.set(key,value)},
    active:()=>true,report:value=>calls.status.push(value),
    request:async(url,options)=>{
      if (!options.method) {
        assert.equal(url,'https://zero.codepet.ca/api/jams?view=summaries');
        assert.equal(options.headers,undefined);
        const summaries=events.map(({id,title,type,revision,registrationOpen,participants,submissionsOpen,schedule,timezone})=>
          ({id,title,type,revision,registrationOpen,participants,submissionsOpen,schedule,timezone}));
        return Response.json({configured:true,events:summaries,checkedAt:'2026-11-24T12:00:00Z'});
      }
      const id = new URL(url).pathname.split('/').at(-2);
      assert.equal(options.headers.Authorization,'Bearer ghu_test');
      if(url.endsWith('/projects')) {
        const body=JSON.parse(options.body);
        calls.projectChanges.push({method:options.method,...body});
        if(change)await change(calls.projectChanges.length);
        return Response.json({configured:true,eventId:id,operationId:body.operationId,status:options.method==='POST'?'project-added':'project-removed',
          ...(options.headers['X-Zero-Check-Project-Change']==='1'?{settlement:'applied'}:{})});
      }
      assert.equal(url,`https://zero.codepet.ca/api/desktop/jams/${id}/join`);
      if (options.method==='GET') return Response.json({configured:true,event:events.find(event=>event.id===id),registration,
        hasRegistrationSpace,canManageProjects,projectRevision:'',submittedRepositoryId,leaveRevision});
      if(options.method==='DELETE') {
        const body=JSON.parse(options.body),check=options.headers['X-Zero-Check-Project-Change']==='1';
        calls.leaves.push({body,check});
        if(change)await change(calls.leaves.length);
        return Response.json({configured:true,eventId:id,operationId:body.operationId,status:'left',...(check?{settlement:'applied'}:{})});
      }
      calls.urls.push(url);
      calls.writes.push(JSON.parse(options.body));
      return send ? send(calls.writes.length) : Response.json({configured:true,status:'joined',revision:calls.writes.at(-1).revision});
    }
  });
  const select=()=>join.chooseJam(ticket),continueJoin=()=>join.continueJoining(ticket);
  return {select,continueJoin,reviewDetails:join.reviewDetails,
    async run(){await select();if(join.reviewDetails(ticket.session.accountId))await continueJoin();},
    calls,saved,chooseJam:id=>{chooseJam=id;}};
}

test('Join a Game Jam reviews the rules, defaults to New project and registers its repository',async()=>{
  const f = fixture({events:[{...JAM,id:'jam-40',type:'app'},{...JAM,id:'jam-41',registrationOpen:false},JAM]});
  await f.select();
  assert.deepEqual(f.calls.picks[0].map(item=>item.label),[JAM.title]);
  const preview=f.reviewDetails('123');
  assert.equal(preview.title,JAM.title);
  assert.equal(preview.fullRules,JAM.rules);
  assert.equal(preview.eligibility,JAM.eligibility);
  assert.match(preview.registrationDeadline, /25.*7:00/);
  assert.match(preview.submissionDeadline, /30.*7:00/);
  assert.equal(f.reviewDetails('999'),undefined);
  assert.equal(f.calls.newProject,0);
  assert.deepEqual(f.calls.prompts,[]);
  await f.continueJoin();
  assert.deepEqual(f.calls.picks[1].map(item=>item.label),['New project','Use an existing repository']);
  assert.equal(f.reviewDetails('123'),undefined);
  assert.equal(f.calls.newProject,1);
  assert.equal(f.calls.existing,0);
  assert.deepEqual(f.calls.open,[]);
  assert.deepEqual(f.calls.writes,[{operationId:f.calls.writes[0].operationId,revision:REVISION,repositoryUrl:REPO,repositoryId:'456'}]);
  assert.deepEqual(f.calls.status,['Joined Toast to the Moon']);
});

test('an existing repository opens only after the registration is confirmed',async()=>{
  const uncertain = fixture({choose:'existing',send:()=>new Response('temporarily unavailable',{status:503})});
  await assert.rejects(uncertain.run(),/could not confirm/);
  assert.deepEqual(uncertain.calls.open,[]);

  const f = fixture({choose:'existing'});
  await f.run();
  assert.equal(f.calls.existing,1);
  assert.equal(f.calls.newProject,0);
  assert.equal(f.calls.writes[0].repositoryUrl,REPO);
  assert.deepEqual(f.calls.open,[{repositoryUrl:REPO,preferredPath:undefined}]);
});

test('an unreadable reply preserves the exact join request and the created project across retry',async()=>{
  const f = fixture({send:count=>count===1 ? new Response('temporarily unavailable',{status:503}) :
    Response.json({configured:true,status:'joined',revision:REVISION})});
  await assert.rejects(f.run(),/retry with the same repository.*Your new project was kept/);
  assert.deepEqual(f.calls.status,[]);
  await f.run();
  assert.equal(f.calls.newProject,1);
  assert.deepEqual(f.calls.writes,[f.calls.writes[0],f.calls.writes[0]]);
  assert.deepEqual(f.calls.open,[{repositoryUrl:REPO,preferredPath:'/projects/moon-game'}]);
  assert.ok([...f.saved.values()].every(value=>value===undefined));
});

test('a registered student can open the linked repository after registration closes',async()=>{
  const f = fixture({events:[{...JAM,registrationOpen:false,submissionsOpen:true,participants:[{id:'123'}]}],
    registration:{status:'joined',repository:{id:'456',fullName:'student/old-moon-game'}}});
  await f.run();
  assert.deepEqual(f.calls.picks[0].map(item=>item.label),[`Manage jam projects · ${JAM.title}`]);
  assert.equal(f.calls.newProject,0);
  assert.equal(f.calls.writes.length,0);
  assert.deepEqual(f.calls.open,[{repositoryUrl:REPO,preferredPath:undefined}]);
  assert.match(f.calls.status[0],/already joined/);
});

test('a joined student removes a deleted submitted repository without asking GitHub to resolve it',async()=>{
  const f=fixture({choices:['jam','remove'],events:[{...JAM,registrationOpen:false,submissionsOpen:true,participants:[{id:'123'}]}],
    canManageProjects:true,submittedRepositoryId:'456',registration:{status:'joined',repositories:[{id:'456',fullName:'student/deleted'}]}});
  await f.run();
  assert.match(f.calls.prompts[0].options.detail,/withdraws its entry/);
  assert.deepEqual(f.calls.projectChanges.map(({method,repositoryId})=>({method,repositoryId})),[{method:'DELETE',repositoryId:'456'}]);
  assert.deepEqual(f.calls.lookups,[]);
  assert.equal(f.calls.writes.length,0);
});

test('a projectless member can add a public project after the registration deadline',async()=>{
  const f=fixture({choices:['jam','add','existing'],events:[{...JAM,registrationOpen:false,submissionsOpen:true,participants:[{id:'123'}]}],
    canManageProjects:true,registration:{status:'joined',repositories:[]}});
  await f.run();
  assert.deepEqual(f.calls.projectChanges.map(({method,repositoryId,repositoryUrl})=>({method,repositoryId,repositoryUrl})),
    [{method:'POST',repositoryId:'456',repositoryUrl:REPO}]);
  assert.equal(f.calls.writes.length,0);
  assert.match(f.calls.status.at(-1),/Added project/);
});

test('leaving reviews the effect and recovers the same request if the reply is lost',async()=>{
  const f=fixture({choices:['jam','leave'],events:[{...JAM,participants:[{id:'123'}]}],
    canManageProjects:true,leaveRevision:REVISION,registration:{status:'joined',repositories:[]},
    change(count){if(count===1)throw Error('Connection lost');}});
  await assert.rejects(f.run(),/could not confirm that you left/);
  assert.match(f.calls.prompts[0].options.detail,/withdraws your entry/);
  assert.match(f.calls.prompts[0].options.detail,/GitHub repositories stay available/);
  await f.run();
  assert.deepEqual(f.calls.leaves.map(call=>call.check),[false,true]);
  assert.deepEqual(f.calls.leaves[0].body,f.calls.leaves[1].body);
  assert.equal(f.calls.leaves[0].body.participationRevision,REVISION);
  assert.match(f.calls.status.at(-1),/You left/);
  assert.equal([...f.saved.values()].filter(Boolean).length,0);
});

test('an uncertain project change is recovered with the same operation before another project change',async()=>{
  const f=fixture({choices:['jam','add','existing'],events:[{...JAM,participants:[{id:'123'}]}],
    canManageProjects:true,registration:{status:'joined',repositories:[]},
    change(count){if(count===1)throw Error('Connection lost');}});
  await assert.rejects(f.run(),/Check project change/);
  assert.equal([...f.saved.values()].filter(Boolean).length,1);
  await f.run();
  assert.equal(f.calls.picks.at(-1)[0].label,`Check project change · ${JAM.title}`);
  assert.deepEqual(f.calls.projectChanges,[f.calls.projectChanges[0],f.calls.projectChanges[0]]);
  assert.equal([...f.saved.values()].filter(Boolean).length,0);
});

test('a project open failure preserves the confirmed registration',async()=>{
  const f = fixture({choose:'existing',openError:new Error('Could not clone the repository.')});
  await assert.rejects(f.run(),/Joined Toast to the Moon\. Could not clone the repository/);
  assert.equal(f.calls.writes.length,1);
  assert.ok([...f.saved.values()].every(value=>value===undefined));
});

test('a student who left can rejoin with the same repository under its current name',async()=>{
  const f = fixture({registration:{status:'left',repository:{id:'456',fullName:'student/old-moon-game'}}});
  await f.run();
  assert.equal(f.calls.newProject,0);
  assert.equal(f.calls.existing,1);
  assert.equal(f.calls.writes[0].repositoryUrl,REPO);
});

test('a student who left can create a project when the join response has no available binding',async()=>{
  const f=fixture({registration:{status:'left'}});
  await f.run();
  assert.deepEqual(f.calls.picks[1].map(item=>item.label),['New project','Use an existing repository']);
  assert.equal(f.calls.newProject,1);
  assert.deepEqual(f.calls.lookups,[]);
  assert.equal(f.calls.writes[0].repositoryId,'456');
});

test('a newer approved revision reopens the rules before offering repository choices',async()=>{
  const event={...JAM},f=fixture({events:[event]});
  await f.select();
  const originalDeadline=f.reviewDetails('123').submissionDeadline;
  event.revision='b'.repeat(64);
  event.rules='Credit all assets.\n'+`${'Make your own work. '.repeat(14)}Ends with more detail.`;
  event.schedule={...event.schedule,submissionsCloseAt:'2026-12-02T12:00:00Z'};
  await f.continueJoin();
  assert.equal(f.calls.newProject,0);
  assert.equal(f.calls.writes.length,0);
  const preview=f.reviewDetails('123');
  assert.equal(preview.fullRules,event.rules);
  assert.notEqual(preview.submissionDeadline,originalDeadline);
  assert.match(f.calls.status.at(-1),/rules changed/);
  await f.continueJoin();
  assert.equal(f.calls.writes[0].revision,event.revision);
});

test('a full Game Jam stops before project selection',async()=>{
  const f = fixture({hasRegistrationSpace:false});
  await f.run();
  assert.equal(f.calls.picks.length,1);
  assert.equal(f.calls.writes.length,0);
  assert.match(f.calls.status[0],/is full/);
});

test('a pending join remains recoverable while a student joins another Game Jam',async()=>{
  const other = {...JAM,id:'jam-43',title:'Another Game Jam'};
  const f = fixture({events:[JAM,other],send:count=>count===1 ? new Response('temporarily unavailable',{status:503}) :
    Response.json({configured:true,status:'joined',revision:REVISION})});
  await assert.rejects(f.run(),/could not confirm/);
  f.chooseJam(other.id);
  await f.run();
  assert.ok([...f.saved.values()].some(item=>item?.id===JAM.id));
  assert.deepEqual(f.calls.urls.map(url=>new URL(url).pathname),[
    '/api/desktop/jams/jam-42/join','/api/desktop/jams/jam-43/join'
  ]);
});

test('reopens an unchanged registered repository directly by its authoritative name and ID',async()=>{
  const f=fixture({registration:{status:'joined',repository:{id:'456',fullName:'student/moon-game'}},
    lookup:url=>({id:456,html_url:url,private:false})});
  await f.select();
  assert.deepEqual(f.calls.lookups,[REPO]);
  assert.equal(f.calls.existing,0);
  assert.deepEqual(f.calls.open,[{repositoryUrl:REPO,preferredPath:undefined}]);
});

test('an older retry without an immutable ID reviews the rules and requires a new project choice',async()=>{
  const f=fixture({choose:'existing'});
  const oldOperation='a'.repeat(36);
  f.saved.set('zero.gameJam.pending:123:'+JAM.id,{id:JAM.id,title:JAM.title,revision:REVISION,operationId:oldOperation,repositoryUrl:REPO});
  await f.select();
  assert.equal(f.calls.writes.length,0);
  assert.equal(f.reviewDetails('123').title,JAM.title);
  await f.continueJoin();
  assert.equal(f.calls.existing,1);
  assert.notEqual(f.calls.writes[0].operationId,oldOperation);
  assert.equal(f.calls.writes[0].repositoryId,'456');
});

test('a replaced registered full name falls back to discovery of only the original ID',async()=>{
  const f=fixture({registration:{status:'joined',repository:{id:'456',fullName:'student/old-moon-game'}},
    lookup:url=>({id:789,html_url:url,private:false})});
  await f.select();
  assert.deepEqual(f.calls.lookups,['https://github.com/student/old-moon-game']);
  assert.equal(f.calls.existing,1);
  assert.deepEqual(f.calls.open,[{repositoryUrl:REPO,preferredPath:undefined}]);
});
