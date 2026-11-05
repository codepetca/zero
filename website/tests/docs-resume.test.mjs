import test from 'node:test';
import assert from 'node:assert/strict';
import { DOCS_RESUME_DEFAULT, DOCS_RESUME_KEY, learningLocation, rememberLearningLocation, resumeLearningLocation } from '../lib/docs-resume.mjs';

const origin = 'https://zero.codepet.ca';
const storage = () => {
  const data = new Map();
  return { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
};

test('remembers learning paths and fragments without query strings', () => {
  const store = storage();
  rememberLearningLocation(store, { origin, pathname: '/tutorials/15', hash: '#repair', search: '?secret=value' });
  assert.equal(store.getItem(DOCS_RESUME_KEY), '/tutorials/15#repair');
  rememberLearningLocation(store, { origin, pathname: '/docs', hash: '#game' });
  assert.equal(resumeLearningLocation(store, origin), '/docs#game');
  rememberLearningLocation(store, { origin, pathname: '/resume-docs', hash: '' });
  assert.equal(resumeLearningLocation(store, origin), '/docs#game');
});

test('only resumes same-origin learning locations', () => {
  const store = storage();
  for (const value of ['https://evil.example/docs', '//evil.example/docs', '/\\evil.example/docs', '/docs-evil', '/tutorials', '/hub', '/docs/../../hub', 'javascript:alert(1)']) {
    store.setItem(DOCS_RESUME_KEY, value);
    assert.equal(resumeLearningLocation(store, origin), DOCS_RESUME_DEFAULT, value);
  }
  assert.equal(learningLocation('/docs/api?secret=1#entry', origin), '/docs/api#entry');
});

test('uses the default when storage is empty or denied', () => {
  assert.equal(resumeLearningLocation(storage(), origin), DOCS_RESUME_DEFAULT);
  const denied = { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } };
  assert.equal(resumeLearningLocation(denied, origin), DOCS_RESUME_DEFAULT);
  assert.doesNotThrow(() => rememberLearningLocation(denied, { origin, pathname: '/docs', hash: '' }));
});
