'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const {createRepositorySyncLedger}=require('../src/repository-sync-ledger');
const {serializeRepositoryReminders}=require('../src/repository-reminder-queue');
const env={...Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/i.test(key))),GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull,GIT_TERMINAL_PROMPT:'0'};
async function fixture(t){const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-ledger-queue-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));execFileSync('git',['init','-q'],{cwd:root,env});return root;}
function state(){const data=new Map();return {keys:()=>[...data.keys()],get:key=>data.get(key),async update(key,value){data.set(key,structuredClone(value));}};}
const row=root=>({root,branch:'main',head:'a'.repeat(40),remote:'',type:'local'});
test('same-host status reads wait for an owned action and then read its fresh reminder',async t=>{
 const root=await fixture(t),ledger=serializeRepositoryReminders(createRepositorySyncLedger({state:state()}));let entered,release;
 const started=new Promise(resolve=>{entered=resolve;}),hold=new Promise(resolve=>{release=resolve;});
 const action=ledger.withTransaction(root,async tx=>{const record=await tx.add(row(root));entered();await hold;assert.deepEqual(await tx.list(),[record]);return record;});await started;
 let completed=0;const reads=Array.from({length:3},()=>ledger.list(root).then(records=>{completed++;return records;}));await new Promise(resolve=>setImmediate(resolve));assert.equal(completed,0);
 release();const record=await action;for(const records of await Promise.all(reads))assert.deepEqual(records,[record]);assert.equal(completed,3);
});
test('other hosts still fail closed and failed local calls do not poison the queue',async t=>{
 const root=await fixture(t),ledger=serializeRepositoryReminders(createRepositorySyncLedger({state:state()})),other=createRepositorySyncLedger({state:state()});let entered,release;
 const started=new Promise(resolve=>{entered=resolve;}),hold=new Promise(resolve=>{release=resolve;});
 const held=ledger.withTransaction(root,async tx=>{await tx.list();entered();await hold;});await started;await assert.rejects(other.list(root),/locked/);release();await held;
 await assert.rejects(ledger.add(root,{...row(root),head:'invalid'}),/Invalid/);assert.deepEqual(await ledger.list(root),[]);
});
test('one repository queue does not block a different project',async t=>{
 const root=await fixture(t),other=await fixture(t),ledger=serializeRepositoryReminders(createRepositorySyncLedger({state:state()}));let entered,release;
 const started=new Promise(resolve=>{entered=resolve;}),hold=new Promise(resolve=>{release=resolve;});
 const held=ledger.withTransaction(root,async()=>{entered();await hold;});await started;
 try{const record=await ledger.add(other,row(other));assert.deepEqual(await ledger.list(other),[record]);}finally{release();await held;}
});
