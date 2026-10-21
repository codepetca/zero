import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { documentDestination, legacyDocumentDestination, helpItems, teacherItems } from '../lib/document-navigation.mjs';
import { resolveContentLink, slugify } from '../lib/markdown.mjs';
import { buildApiReference } from '../lib/api-reference.mjs';

const read = file => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const guides = {
  'app-guide': 'APP-GUIDE.md', beginner: 'BEGINNER.md', style: 'STYLE.md', ui: 'UI.md',
};

test('old guide chapters resolve to real lesson headings or complete API categories', () => {
  const api = buildApiReference(read('student-template/API.md'));
  const apiIds = new Set(api.flatMap(category => [category.id, ...category.entries.map(entry => entry.id)]));
  const lessonFolder = new URL('../../student-template/lessons/', import.meta.url);
  for (const [id, name] of Object.entries(guides)) {
    const headings = [...read(`student-template/${name}`).matchAll(/^#{1,3} (.+)$/gm)].map(match => slugify(match[1]));
    for (const fragment of ['', ...headings]) {
      const href = legacyDocumentDestination(id, `#${encodeURIComponent(fragment)}`);
      assert.ok(href, `${id}#${fragment} still has a destination`);
      const target = new URL(href, 'https://zero.codepet.ca');
      if (target.origin !== 'https://zero.codepet.ca') continue;
      if (target.pathname.startsWith('/tutorials/')) {
        const number = target.pathname.split('/').at(-1).padStart(2, '0');
        const file = readdirSync(lessonFolder).find(name => name.startsWith(`${number}-`));
        assert.ok(file, href);
        if (target.hash) assert.ok(readFileSync(new URL(file, lessonFolder), 'utf8').split('\n')
          .some(line => /^#{1,3} /.test(line) && slugify(line.replace(/^#{1,3} /, '')) === target.hash.slice(1)), href);
      } else if (target.pathname === '/docs') {
        if (target.hash) assert.ok(apiIds.has(target.hash.slice(1)), href);
      } else assert.equal(target.pathname, '/learn');
    }
  }
});

test('bookmarks and authored links share the same destinations', () => {
  assert.equal(legacyDocumentDestination('app-guide', '#gameapp-frames-and-canvas'), '/tutorials/8#frames-input-and-canvas');
  assert.equal(legacyDocumentDestination('ui', '#name-your-programs-flow'), '/tutorials/10#screens-and-app-flow');
  assert.equal(legacyDocumentDestination('style', '#%zz'), '/tutorials/2#layout-and-appearance');
  assert.equal(documentDestination('api', 'padding'), '/docs#padding');
  assert.equal(documentDestination('constructor'), null);
  assert.equal(legacyDocumentDestination('app-guide', '#constructor'), '/tutorials/0#app-startup');
  const docs = { 'app-guide': { source: 'student-template/APP-GUIDE.md' } };
  for (const href of ['../APP-GUIDE.md#gameapp-frames-and-canvas', '/docs/app-guide#gameapp-frames-and-canvas', 'https://zero.codepet.ca/docs/app-guide#gameapp-frames-and-canvas']) {
    assert.equal(resolveContentLink('student-template/lessons/08-movement.md', href, docs, {}), '/tutorials/8#frames-input-and-canvas');
  }
});

test('help and teacher readers have separate small navigation; maintainers go to repository docs', () => {
  assert.deepEqual(helpItems.map(item => item.id), ['setup', 'course-project']);
  assert.deepEqual(teacherItems.map(item => item.id), ['teachers', 'pilot']);
  for (const item of [...helpItems, ...teacherItems]) assert.equal(documentDestination(item.id), item.href);
  assert.equal(documentDestination('starter', 'edit-and-run'), '/help/setup#edit-and-run');
  assert.equal(documentDestination('development'), 'https://github.com/codepetca/zero/blob/main/docs/DEVELOPMENT.md');
  assert.equal(documentDestination('verification'), 'https://github.com/codepetca/zero/blob/main/docs/VERIFICATION.md');
  assert.equal(documentDestination('product'), 'https://github.com/codepetca/zero/blob/main/docs/PRODUCT.md');
  assert.equal(documentDestination('lesson-guide', 'start-a-lesson'), '/learn');
});
