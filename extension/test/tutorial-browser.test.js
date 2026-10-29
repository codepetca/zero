'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {openTutorialDocs} = require('../src/tutorial-browser');

function host({available=true, failure=false, external=true}={}) {
  const calls=[];
  return {calls, vscode:{commands:{getCommands:async()=>available?['workbench.action.browser.open']:[],executeCommand:async(...args)=>{calls.push(args);if(failure)throw Error('unavailable');}},env:{openExternal:async uri=>{calls.push(['external',uri]);return external;}},Uri:{parse:value=>value}}};
}
test('opens the requested tutorial beside code in the integrated browser',async()=>{
  const h=host();await openTutorialDocs(h.vscode,'13');
  assert.deepEqual(h.calls,[['workbench.action.browser.open',{url:'https://zero.codepet.ca/tutorials/13',openToSide:true}]]);
});
test('uses the regular browser when the integrated browser is absent or fails',async()=>{
  for(const options of [{available:false},{failure:true}]) {
    const h=host(options);await openTutorialDocs(h.vscode);
    assert.deepEqual(h.calls.at(-1),['external','https://zero.codepet.ca/tutorials/0']);
  }
});
test('reports failure to open the fallback and rejects invalid lesson IDs',async()=>{
  const h=host({available:false,external:false});
  await assert.rejects(openTutorialDocs(h.vscode),/Could not open Tutorial Docs/);
  await assert.rejects(openTutorialDocs(h.vscode,'../bad'));
});
