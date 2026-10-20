'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {textInput,minimalPrompts} = require('../src/prompts');
function fixture() {
  const handlers = {change:new Set(),accept:new Set(),hide:new Set()};
  const event = name => fn => {handlers[name].add(fn);return {dispose:()=>handlers[name].delete(fn)};};
  const emit = async (name,value) => {for(const fn of [...handlers[name]])await fn(value);};
  const picker = {items:[],value:'',disposed:0,shown:false,onDidChangeValue:event('change'),onDidAccept:event('accept'),onDidHide:event('hide'),show(){this.shown=true;},dispose(){this.disposed++;}};
  let active='first';
  const window = {get activeTextEditor(){return active;},createQuickPick:()=>picker,showInputBox(){throw Error('Standard InputBox must not be used');}};
  const vscode = {window,InputBoxValidationSeverity:{Error:3,Warning:2,Info:1}};
  return {vscode,picker,emit,async type(value){picker.value=value;await emit('change',value);await new Promise(resolve=>setImmediate(resolve));},set active(value){active=value;}};
}
test('one short label and keyboard helper; native Enter accepts typed text without a selected item',async()=>{
  const f=fixture();const pending=textInput(f.vscode,{placeHolder:'Class name',ignoreFocusOut:true});
  assert.equal(f.picker.placeholder,'Class name');assert.equal(f.picker.title,'Enter to confirm · Esc to cancel');assert.deepEqual(f.picker.items,[]);assert.equal(f.picker.ignoreFocusOut,true);
  await f.type('Player');await f.emit('accept');assert.equal(await pending,'Player');assert.equal(f.picker.disposed,1);
});
test('Escape/focus cancellation returns undefined; an accepted optional empty value remains empty',async()=>{
  const f=fixture();const pending=textInput(f.vscode,{title:'Preview image'});await f.emit('hide');assert.equal(await pending,undefined);assert.equal(f.picker.disposed,1);
  const g=fixture();const blank=textInput(g.vscode,{title:'Preview image'});await g.emit('accept');assert.equal(await blank,'');
});
test('validation blocks invalid acceptance and clears when corrected',async()=>{
  const f=fixture();const pending=textInput(f.vscode,{title:'Class name',validateInput:value=>value==='Player'?undefined:'Invalid class name'});
  await f.type('bad name');await f.emit('accept');assert.equal(f.picker.disposed,0);assert.equal(f.picker.items[0].label,'Invalid class name');
  await f.type('Player');assert.deepEqual(f.picker.items,[]);await f.emit('accept');assert.equal(await pending,'Player');
});
test('older validation results and errors cannot replace newer input or accept stale text',async()=>{
  for(const failure of [false,true]) {
    const f=fixture();let release;
    const pending=textInput(f.vscode,{title:'Name',validateInput:value=>value==='old'?new Promise((resolve,reject)=>{release=()=>failure?reject(Error('old error')):resolve('old error');}):undefined});
    f.picker.value='old';await f.emit('change','old');await f.type('new');release();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(f.picker.items,[]);assert.equal(f.picker.disposed,0);
    await f.emit('accept');assert.equal(await pending,'new');
  }
});
test('editing during acceptance never submits the old value; duplicate Enter does not submit twice',async()=>{
  const f=fixture();let release;
  const pending=textInput(f.vscode,{title:'Name',validateInput:value=>value==='old'?new Promise(resolve=>{release=resolve;}):undefined});
  f.picker.value='old';const accept=f.emit('accept');await new Promise(resolve=>setImmediate(resolve));await f.emit('accept');await f.type('new');release();await accept;assert.equal(f.picker.disposed,0);
  await f.emit('accept');assert.equal(await pending,'new');assert.equal(f.picker.disposed,1);
});
test('current validator failure rejects and disposes instead of leaving a stuck input',async()=>{
  const f=fixture();const pending=textInput(f.vscode,{title:'Name',validateInput:()=>{throw Error('Project changed');}});const rejected=assert.rejects(pending,/Project changed/);await f.emit('accept');await rejected;assert.equal(f.picker.disposed,1);
});
test('context and prefilled values remain; informational validation does not block acceptance',async()=>{
  const f=fixture();const pending=textInput(f.vscode,{placeHolder:'Repository name',prompt:'Public repository · student',value:'my-project',validateInput:()=>({message:'Info',severity:1})});
  assert.equal(f.picker.title,'Public repository · student · Enter to confirm · Esc to cancel');assert.equal(f.picker.value,'my-project');await f.emit('accept');assert.equal(await pending,'my-project');
});
test('the Zero API facade preserves live editor state and never mutates VS Code',async()=>{
  const f=fixture();const ui=minimalPrompts(f.vscode);f.active='second';assert.equal(ui.window.activeTextEditor,'second');assert.notEqual(ui.window.showInputBox,f.vscode.window.showInputBox);
  const pending=ui.window.showInputBox({title:'Commit message'});await f.type('Update greeting');await f.emit('accept');assert.equal(await pending,'Update greeting');
});
