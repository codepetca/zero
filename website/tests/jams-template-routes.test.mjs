import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {hiddenJamsResponse} from '../lib/jams-visibility.mjs';

test('legacy custom-site ZIP and preview API routes are closed locally and retain the production visibility hold',async()=>{
  for(const path of ['template/route.ts','template/preview/route.ts']){
    const source=await readFile(new URL(`../app/api/jams/${path}`,import.meta.url),'utf8');
    const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    for(const env of [{NODE_ENV:'development'},{NODE_ENV:'production',ZERO_JAMS_ENABLED:'1'}]){
      const module={exports:{}};
      vm.runInNewContext(compiled,{module,exports:module.exports,Response,require:name=>{
        if(name==='@/lib/jams-visibility.mjs')return {hiddenJamsResponse:()=>hiddenJamsResponse(env)};
        assert.ok(['@/lib/jam-template.mjs','@/lib/jam-template-http.mjs'].includes(name));
        const blocked=()=>{throw Error('Closed legacy handler was invoked');};
        return {createJamTemplateZip:blocked,preparedJamResponse:blocked};
      }});
      for(const method of ['GET','POST']){
        const result=await module.exports[method](new Request('http://localhost/api/jams/template',{method}));
        assert.equal(result.status,env.NODE_ENV==='development'?410:404);
        assert.equal(result.headers.get('cache-control'),'no-store');
        if(result.status===410)assert.match((await result.json()).error,/Zero-hosted proposal/);
      }
    }
  }
});
