import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {buildApiReference,searchApiReference} from '../lib/api-reference.mjs';
import {apiSearchLabels} from '../lib/api-search-labels.mjs';

const source=await readFile(new URL('../components/ApiReference.tsx',import.meta.url),'utf8');
const categories=buildApiReference(await readFile(new URL('../../student-template/API.md',import.meta.url),'utf8'));
const compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const require=createRequire(import.meta.url);

test('rendered search links expose distinct labels and original deep links',()=>{
  const module={exports:{}};
  let first=true;
  const react={...React,useState(initial){if(first){first=false;return React.useState('setImage');}return React.useState(initial);}};
  const component=()=>null;
  const modules={react,'next/link':{default:component},'./Icon':{Icon:component},'./CodeBlock':{CodeBlock:component},
    './SidebarLayout':{SidebarLayout:({sidebar})=>sidebar},'react-markdown':{default:component},
    '@/lib/api-reference.mjs':{searchApiReference},'@/lib/api-search-labels.mjs':{apiSearchLabels},'./ApiReference.css':{}};
  vm.runInNewContext(compiled,{module,exports:module.exports,require:name=>modules[name]??require(name)});
  const html=renderToStaticMarkup(React.createElement(module.exports.ApiReference,{categories,links:{}}));
  for(const [id,label] of [['actor-setImage','setImage(Image)'],['actor-setImage-region','setImage(ImageRegion)'],
    ['actor-setImage-animation','setImage(SpriteAnimation)'],['actor-setImage-source','setImage(AnimationSource)']]) {
    assert.ok(html.includes(`href="#${id}"`),id);
    assert.ok(html.includes(`>${label}</a><small>Actors · Actor</small>`),label);
  }
});
