import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { GET } from '../app/resume-docs/route.js';
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

test('resume response redirects before rendering, with the same validated fallback', async () => {
  const response = GET(), html = await response.text();
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  assert.ok(html.indexOf('<script>') < html.indexOf('</head>'));
  assert.doesNotMatch(html, /Opening your last/);
  assert.match(html, /<noscript>[\s\S]*href="\/tutorials\/15"/);
  const hash = createHash('sha256').update(script).digest('base64');
  assert.ok(response.headers.get('content-security-policy').includes(`'sha256-${hash}'`));
  for (const [value, expected] of [['/docs#canvas', '/docs#canvas'], ['/tutorials/2', '/tutorials/2'], ['//evil.test/docs', DOCS_RESUME_DEFAULT], [null, DOCS_RESUME_DEFAULT]]) {
    let destination;
    const window = {location: {origin, replace: value => {destination = value;}}, localStorage: {getItem: () => value}};
    runInNewContext(script, {window, URL});
    assert.equal(destination, expected);
  }
  let destination;
  const window = {location: {origin, replace: value => {destination = value;}}};
  Object.defineProperty(window, 'localStorage', {get() {throw Error('denied');}});
  runInNewContext(script, {window, URL});
  assert.equal(destination, DOCS_RESUME_DEFAULT);
});
