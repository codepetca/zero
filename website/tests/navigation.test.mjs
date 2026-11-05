import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const source = await readFile(new URL('../components/Navigation.jsx', import.meta.url), 'utf8');
const fixture = `import {useEffect,useRef,useState} from ${JSON.stringify(import.meta.resolve('react'))}; const Brand = () => null; const BetaNotice = () => null; const Icon = ({name}) => <svg data-icon={name} aria-hidden="true" />;\n${source.replace(/^import .+;\n/gm, '')}`;
const js = ts.transpileModule(fixture, {compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext}}).outputText
  .replace('"react/jsx-runtime"', JSON.stringify(import.meta.resolve('react/jsx-runtime')));
const {Navigation} = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('header links expose named destinations and the requested icons', () => {
  const html = renderToStaticMarkup(createElement(Navigation, {active:'Docs'}));
  for (const [name, href, icon] of [['Tutorials','/learn','graduation-cap'],['Docs','/docs','book-open'],['ZeroHub','/hub','graph-star']]) {
    assert.match(html, new RegExp(`href="${href}" aria-label="${name}" data-tooltip="${name}"[^>]*><svg data-icon="${icon}" aria-hidden="true"`));
  }
  assert.match(html, /aria-label="Docs"[^>]*aria-current="page"/);
  assert.doesNotMatch(html, /Open navigation|menu-toggle/);
});
