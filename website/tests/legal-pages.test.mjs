import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

async function render(relative, exported = 'default') {
  const source = await readFile(new URL(`../${relative}`, import.meta.url), 'utf8');
  const fixture = `import {useEffect, useState} from ${JSON.stringify(import.meta.resolve('react'))};
const LearnTheme = ({children}) => children;
${source.replace(/^import .+;\n/gm, '')}`;
  const js = ts.transpileModule(fixture, {compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext}}).outputText
    .replace('"react/jsx-runtime"', JSON.stringify(import.meta.resolve('react/jsx-runtime')));
  const component = (await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`))[exported];
  return renderToStaticMarkup(createElement(component));
}
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('active terms state prospective agreement and retain mandatory rights and software licenses', async () => {
  const html = await render('app/terms/page.tsx'), content = text(html);
  assert.match(html, /dateTime="2026-10-25"/i);
  assert.match(content, /Effective.*upon publication of this version/);
  assert.doesNotMatch(content, /Draft for review|proposed terms|not yet in effect/i);
  assert.match(content, /By accessing or using the Services after this version is published and these terms are brought to your attention, you agree/);
  assert.match(content, /does not treat past visits or use of unrelated products as acceptance/);
  assert.match(content, /services that display or expressly link to these terms/);
  assert.match(content, /do not remove rights granted by those licenses/);
  assert.match(content, /MIT license/);
  assert.match(content, /These exclusions and limits do not apply where prohibited by law/);
  assert.match(content, /fraud, wilful misconduct/);
  assert.match(content, /replace express consent required by law/);
});

test('footer presents one direct Terms and Privacy link without the use-based notice', async () => {
  const html = await render('components/LegalFooter.tsx', 'LegalFooter');
  assert.doesNotMatch(text(html), /By using this site, you agree/i);
  assert.equal((html.match(/href="\/terms"/g) || []).length, 1);
  assert.equal((html.match(/href="\/privacy"/g) || []).length, 1);
});

test('privacy notice distinguishes terms agreement from required personal-information consent', async () => {
  const content = text(await render('app/privacy/page.tsx'));
  assert.doesNotMatch(content, /agreement to the proposed terms/);
  assert.match(content, /does not authorize new uses of personal information or replace consent required by privacy law/);
  assert.match(content, /Reading this page is not recorded as an explicit consent event/);
});
