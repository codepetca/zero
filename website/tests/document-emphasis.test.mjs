import test from 'node:test';
import assert from 'node:assert/strict';
import {documentEmphasisKind} from '../lib/document-emphasis.mjs';
const text = value => ({type:'text', value});
const strong = (...children) => ({type:'element', tagName:'strong', children});

test('recognizes shortcuts with platform variants and palette commands', () => {
  assert.equal(documentEmphasisKind(strong({type:'element', children:[text('Cmd+Shift+P')]}, {type:'element', children:[text('Ctrl+Shift+P')]})), 'shortcut');
  assert.equal(documentEmphasisKind(strong(text('Zero: Show Sidebar'))), 'command');
  assert.equal(documentEmphasisKind(strong(text('Preferences: Color Theme'))), 'command');
  assert.equal(documentEmphasisKind(strong(text('Project → New'))), 'selection');
  assert.equal(documentEmphasisKind(strong(text('New branch…'))), 'selection');
  for (const action of ['Run', 'New class…', 'New folder…', 'Import assets…', 'Extract library', 'Browse tutorial practice', 'Commit & push', 'Merge to main', 'Publish & open app']) {
    assert.equal(documentEmphasisKind(strong(text(action))), 'selection', action);
  }
  assert.equal(documentEmphasisKind(strong(text('Project ▾ → Open local project…'))), 'selection');
  assert.equal(documentEmphasisKind(strong(text('Libraries and games → Extract library'))), 'selection');
  assert.equal(documentEmphasisKind(strong(text('2 → 0 → 1'))), null);
  assert.equal(documentEmphasisKind(strong(text('Run App'))), null);
  assert.equal(documentEmphasisKind(strong(text('Main.java'))), null);
});
