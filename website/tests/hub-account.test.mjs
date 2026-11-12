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
  const context={module,exports:module.exports,require(name){if(name==='react')return react;if(name==='@/app/hub/hub.module.css')return {default:{account:'account'}};if(name==='./useZeroAccount')return {};return require(name);},URLSearchParams};
  vm.runInNewContext(compiled,context);
  return renderToStaticMarkup(React.createElement(module.exports.HubAccount,props));
}
const connection=user=>({configured:true,user,error:'',callbackError:false,refresh:async()=>{},
  zeroAccount:{state:{configured:true,user:null},error:false}});
test('jam account hides sign out but retains identity and signed-out sign-in',()=>{
  assert.match(account(connection({id:'12',login:'creator',csrfToken:'csrf'}),{showSignOut:false}),/Signed in as @creator/);
  assert.doesNotMatch(account(connection({id:'12',login:'creator',csrfToken:'csrf'}),{showSignOut:false}),/>Sign out</);
  assert.match(account(connection(null),{showSignOut:false}),/Sign in to Zero/);
  assert.match(account(connection({id:'12',login:'creator',csrfToken:'csrf'})),/>Sign out</);
});

test('managed Hub account uses the Zero sign-out form',()=>{
  const managed={...connection({id:'12',login:'creator',csrfToken:'csrf'}),managed:true};
  assert.match(account(managed),/<form action="\/zero-account\/sign-out" method="post">/);
  assert.doesNotMatch(account(managed,{showSignOut:false}),/<form/);
});

test('both sign-in paths name Zero and identify GitHub as the provider',()=>{
  assert.match(account({...connection(null),managed:true}),/>Sign in to Zero</);
  assert.match(account({...connection(null),managed:true}),/Use your GitHub account/);
  assert.match(account(connection(null)),/>Sign in to Zero</);
  assert.match(account(connection(null)),/Use your GitHub account/);
  assert.match(account({...connection(null),managed:true},{signInLabel:'Reconnect GitHub to Zero'}),/>Reconnect GitHub to Zero</);
});

const myProjects={showSignOut:false,showZeroAccountStatus:true};

test('My Projects offers to connect when a Zero session has no GitHub access',()=>{
  const zeroAccount={state:{configured:true,user:{avatarId:null}},error:false};
  const session={...connection(null),managed:true,zeroAccount,returnTo:'/hub/listings'};
  const html=account(session,myProjects);
  assert.match(html,/Signed in to Zero\.<\/span><a href="\/api\/hub\/github\/login\?returnTo=%2Fhub%2Flistings">Connect to GitHub<\/a>/);
  assert.doesNotMatch(html,/Sign in to Zero|Use your GitHub account|Sign out/);
  assert.match(account(session,{showSignOut:false}),/>Sign in to Zero</);
  assert.doesNotMatch(account(session,{showSignOut:false}),/Signed in to Zero|Connect to GitHub/);
  assert.match(account({...session,zeroAccount:connection(null).zeroAccount},myProjects),/>Sign in to Zero</);

  const connected=account({...session,user:{id:'12',login:'creator',csrfToken:'csrf'}},myProjects);
  assert.match(connected,/Signed in as @creator/);
  assert.doesNotMatch(connected,/Connect to GitHub/);

  const unavailable=account({...session,configured:false},myProjects);
  assert.match(unavailable,/Signed in to Zero\..*GitHub connection is unavailable/);
  assert.doesNotMatch(unavailable,/Connect to GitHub|Zero sign-in is unavailable/);
  const failed=account({...session,error:'Could not check your GitHub connection.'},myProjects);
  assert.match(failed,/Signed in to Zero\..*Could not check your GitHub connection.*Retry/);
  assert.doesNotMatch(failed,/Connect to GitHub|Sign in to Zero/);
});

test('My Projects waits for the managed Zero account check',()=>{
  const session={...connection(null),managed:true,zeroAccount:{state:null,error:false}};
  const pending=account(session,myProjects);
  assert.match(pending,/Checking your account/);
  assert.doesNotMatch(pending,/Sign in to Zero|Connect to GitHub/);
  assert.match(account({...session,configured:false},myProjects),/Checking your account/);
  const failed=account({...session,zeroAccount:{state:null,error:true}},myProjects);
  assert.match(failed,/Could not check your Zero account/);
  assert.doesNotMatch(failed,/Sign in to Zero|Connect to GitHub/);
});

test('sign-in follows the selected Hub pane',()=>{
  const html=account({...connection(null),returnTo:'/hub/listings'});
  assert.match(html,/href="\/api\/hub\/github\/login\?returnTo=%2Fhub%2Flistings"/);
});
