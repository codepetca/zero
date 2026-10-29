import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {platformMarkdown} from '../lib/platform-content.mjs';
import {foldSections} from '../lib/markdown.mjs';
const source = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('platform variants preserve recovery lesson instructions and offer both shortcuts', () => {
  const text = platformMarkdown('lesson-15', source('student-template/lessons/15-recover-zero.md'));
  for (const part of ['[Cmd+Shift+P](#zero-platform-mac)', '[Ctrl+Shift+P](#zero-platform-windows)', '[Cmd+P](#zero-platform-mac)', '[Ctrl+P](#zero-platform-windows)', 'Type a command below']) assert.ok(text.includes(part), part);
});

test('setup and style use the correct wrappers and retain ordinary content', () => {
  for (const id of ['setup', 'starter']) {
    const text = platformMarkdown(id, source('docs/GETTING-STARTED.md'));
    for (const part of ['[Cmd+Shift+B](#zero-platform-mac)', '[Ctrl+Shift+B](#zero-platform-windows)', '`setup/Setup.command`](#zero-platform-mac)', '`setup/Setup.cmd`](#zero-platform-windows)', '`.\\mvnw.cmd clean compile javafx:run`](#zero-platform-windows)', 'your GitHub repository']) assert.ok(text.toLowerCase().includes(part.toLowerCase()), part);
  }
  assert.match(platformMarkdown('style', source('student-template/STYLE.md')), /mvnw\.cmd clean compile javafx:run/);
});

test('changed source fails closed rather than silently showing mixed instructions', () => {
  assert.throws(() => platformMarkdown('lesson-15', 'changed lesson'), /Missing platform instruction/);
});

test('Mac setup section is marked for platform filtering', () => {
  const heading = {type:'element', tagName:'h2', properties:{}, children:[{type:'text',value:'Zero app for Mac'}]};
  const tree = {children:[heading, {type:'element',tagName:'p',properties:{},children:[{type:'text',value:'Mac instructions'}]}]};
  foldSections({platformSetup:true})(tree);
  assert.ok(tree.children[0].properties.className.includes('platform-mac'));
});
