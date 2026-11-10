import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';

const require=createRequire(import.meta.url);
const source=await readFile(new URL('../components/HubGitHub.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function account(connection,props={}) {
  const module={exports:{}};
  const react={...React,useContext:()=>connection};
  const context={module,exports:module.exports,require(name){if(name==='react')return react;if(name==='@/app/hub/hub.module.css')return {default:{account:'account'}};return require(name);},URLSearchParams};
  vm.runInNewContext(compiled,context);
  return renderToStaticMarkup(React.createElement(module.exports.HubAccount,props));
}
const connection=user=>({configured:true,user,error:'',callbackError:false,refresh:async()=>{}});
test('jam account hides sign out but retains identity and signed-out sign-in',()=>{
  assert.match(account(connection({id:'12',login:'creator',csrfToken:'csrf'}),{showSignOut:false}),/GitHub · @creator/);
  assert.doesNotMatch(account(connection({id:'12',login:'creator',csrfToken:'csrf'}),{showSignOut:false}),/>Sign out</);
  assert.match(account(connection(null),{showSignOut:false}),/Sign in to GitHub/);
  assert.match(account(connection({id:'12',login:'creator',csrfToken:'csrf'})),/>Sign out</);
});

test('managed Hub account uses the Zero sign-out form',()=>{
  const managed={...connection({id:'12',login:'creator',csrfToken:'csrf'}),managed:true};
  assert.match(account(managed),/<form action="\/zero-account\/sign-out" method="post">/);
  assert.doesNotMatch(account(managed,{showSignOut:false}),/<form/);
});
