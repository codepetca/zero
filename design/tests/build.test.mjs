import startPage from '../../extension/src/start-page.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { designOutputs } from '../prepare.mjs';

test('prepared production CSS is exactly derived from shared source and has no global web theme selectors', () => {
  const outputs = designOutputs();
  for (const [file, expected] of Object.entries(outputs)) {
    assert.equal(readFileSync(new URL(`../../${file}`, import.meta.url),'utf8'), expected, `${file} must be regenerated, never edited independently`);
  }
  const web = outputs['website/.generated/learn-theme.css'];
  assert.doesNotMatch(web, /(?:^|\n)\s*(?:body|:root|html)[\s{,.]/);
  assert.match(web, /\.learn-theme\[data-theme="system"\]/);
  assert.match(web, /prefers-color-scheme: dark/);
  const sidebar = outputs['extension/media/generated-theme.css'];
  assert.match(sidebar, /--vscode-font-family/);
  assert.match(sidebar, /--vscode-focusBorder/);
  assert.doesNotMatch(sidebar, /#6655cd|\.monaco-workbench/);
});

test('both editor surfaces consume the canonical control stylesheet', () => {
  const controls = readFileSync(new URL('../../extension/media/controls.css', import.meta.url), 'utf8');
  assert.ok(designOutputs()['extension/media/generated-theme.css'].includes(controls));
  const panel = {webview:{onDidReceiveMessage:()=>({dispose(){}})}, onDidDispose(){}, dispose(){}};
  const page = startPage.createStartPage({window:{createWebviewPanel:()=>panel}});
  page.show();
  assert.ok(panel.webview.html.includes(controls));
  page.dispose();
});
