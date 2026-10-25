import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import {renderToStaticMarkup} from 'react-dom/server';
import {jamsPreviewAvailable,hiddenJamsResponse} from '../lib/jams-visibility.mjs';

const require=createRequire(import.meta.url);
const compile=source=>ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function load(source,imports) {
  const module={exports:{}};
  vm.runInNewContext(compile(source),{module,exports:module.exports,
    require:name=>Object.hasOwn(imports,name)?imports[name]:require(name),Response,Request,URL});
  return module.exports;
}

test('owner hold defaults closed; activation flags cannot reveal production pages or previews',()=>{
  assert.equal(jamsPreviewAvailable({NODE_ENV:'development'}),true);
  for(const env of [{},{NODE_ENV:'test'},{NODE_ENV:'production'},
    {NODE_ENV:'production',VERCEL_ENV:'preview',ZERO_JAMS_ENABLED:'1'},
    {NODE_ENV:'development',VERCEL_ENV:'production'}]) {
    assert.equal(jamsPreviewAvailable(env),false);
    const response=hiddenJamsResponse(env);assert.equal(response.status,404);
    assert.equal(response.headers.get('cache-control'),'no-store');
  }
});

test('every jam API/panel route returns 404 before calling services, reading template files or resolving params',async()=>{
  const routes=[['api/jams/route.ts','GET'],['api/jams/[id]/route.ts','GET'],
    ['api/jams/[id]/actions/route.ts','POST'],['api/jams/proposals/route.ts','POST'],
    ['api/jams/template/route.ts','GET'],['api/jams/template/route.ts','POST'],['api/jams/template/preview/route.ts','POST'],['api/jams/template/preview/route.ts','GET'],['hub/jams/[id]/panel/route.ts','GET']];
  const blocked=()=>{throw new Error('A production-hidden dependency was invoked');};
  for(const [path,method] of routes) {
    const source=await readFile(new URL(`../app/${path}`,import.meta.url),'utf8');
    const route=load(source,{
      '@/lib/jams-visibility.mjs':{hiddenJamsResponse:()=>hiddenJamsResponse({NODE_ENV:'production'})},
      '@/lib/jams-http.mjs':{getJamsResponse:blocked,getJamResponse:blocked,postJamActionResponse:blocked,postJamProposalResponse:blocked},
      '@/lib/jam-template.mjs':{createJamTemplateZip:blocked},
      '@/lib/jam-template-http.mjs':{preparedJamResponse:blocked}
    });
    const context={get params(){throw new Error('Hidden route resolved parameters');}};
    const response=await route[method](new Request('https://zero.codepet.ca/hidden',{method}),context);
    assert.equal(response.status,404,path);assert.equal(await response.text(),'Not found');
  }
});

test('one server layout hides discovery, preparation, details and participation; local children remain usable',async()=>{
  const source=await readFile(new URL('../app/hub/jams/layout.tsx',import.meta.url),'utf8');
  for(const visible of [false,true]) {
    const layout=load(source,{'@/lib/jams-visibility.mjs':{jamsPreviewAvailable:()=>visible},
      'next/navigation':{notFound:()=>{throw new Error('not-found');}}});
    if(visible)assert.equal(layout.default({children:'local preview'}),'local preview');
    else assert.throws(()=>layout.default({children:'private preview'}),/not-found/);
  }
});

test('ZeroHub navigation has no production jam link and preserves existing catalog links',async()=>{
  const source=await readFile(new URL('../components/HubNavigation.tsx',import.meta.url),'utf8');
  for(const visible of [false,true]) {
    const component=load(source,{'@/lib/jams-visibility.mjs':{jamsPreviewAvailable:()=>visible},
      'next/link':{default:({href,children,...props})=>require('react').createElement('a',{href,...props},children)},
      '@/app/hub/hub.module.css':{default:{}}});
    const html=renderToStaticMarkup(component.HubNavigation({active:'game'}));
    assert.equal(html.includes('href="/hub/jams"'),visible);
    assert.match(html,/href="\/hub\?kind=game"/);assert.match(html,/href="\/hub\?kind=library"/);
  }
});
