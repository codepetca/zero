import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setReleaseVersion} from './set-release-version.mjs';

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'zero-version-'));
  for (const name of ['release', 'extension', 'docs', 'student-template']) mkdirSync(join(dir, name));
  const files = {
    'release/kit.json': JSON.stringify({schema:1,kitVersion:'0.5.56',coreVersion:'0.3.0',publication:{status:'local',tag:'v0.5.56'},assets:{extension:{filename:'zero-0.5.56.vsix'}}}, null, 2) + '\n',
    'extension/package.json': '{\n  "name": "zero\\u00e9",\n  "version": "0.5.56"\n}\n',
    'release/START-HERE.md': '0.5.56 zero-0.5.56.vsix 0.5.560 0.5.55\n',
    'docs/GETTING-STARTED.md': 'Current 0.5.56, older 0.5.55\n',
    'student-template/README.md': 'Historical 0.5.51\n',
    'release/published-kit.json': 'immutable 0.5.56\n',
    'release/installer.json': 'immutable 0.5.56\n'
  };
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return {dir, files, read: name => readFileSync(join(dir, name), 'utf8')};
}

test('advances aligned local version and only matching guide references', t => {
  const f = fixture(); t.after(() => rmSync(f.dir, {recursive:true,force:true}));
  assert.deepEqual(setReleaseVersion(f.dir, '0.5.57'), {previous:'0.5.56', version:'0.5.57'});
  const kit = JSON.parse(f.read('release/kit.json'));
  assert.equal(kit.kitVersion, '0.5.57'); assert.equal(kit.publication.tag, 'v0.5.57');
  assert.equal(kit.assets.extension.filename, 'zero-0.5.57.vsix'); assert.equal(kit.coreVersion, '0.3.0');
  assert.equal(JSON.parse(f.read('extension/package.json')).version, '0.5.57');
  assert.equal(f.read('extension/package.json'), f.files['extension/package.json'].replace('0.5.56', '0.5.57'));
  assert.equal(f.read('release/START-HERE.md'), '0.5.57 zero-0.5.57.vsix 0.5.560 0.5.55\n');
  assert.equal(f.read('docs/GETTING-STARTED.md'), 'Current 0.5.57, older 0.5.55\n');
  for (const name of ['student-template/README.md','release/published-kit.json','release/installer.json']) assert.equal(f.read(name), f.files[name]);
});

test('rejects invalid, nonincreasing, published and inconsistent inputs without writes', t => {
  const f = fixture(); t.after(() => rmSync(f.dir, {recursive:true,force:true}));
  const unchanged = () => { for (const [name, text] of Object.entries(f.files)) assert.equal(f.read(name), text); };
  for (const value of ['0.5.56','0.5.55','01.5.57','0.5.65535','65534.0.0','1.2']) { assert.throws(() => setReleaseVersion(f.dir, value)); unchanged(); }
  const kitPath = join(f.dir, 'release/kit.json');
  for (const modify of [kit => kit.publication.status = 'published', kit => kit.publication.tag = 'v0.5.55', kit => kit.assets.extension.filename = 'stale.vsix']) {
    const kit = JSON.parse(f.files['release/kit.json']); modify(kit);
    f.files['release/kit.json'] = JSON.stringify(kit, null, 2) + '\n'; writeFileSync(kitPath, f.files['release/kit.json']);
    assert.throws(() => setReleaseVersion(f.dir, '0.5.57')); unchanged();
    kit.publication.status = 'local'; kit.publication.tag = 'v0.5.56'; kit.assets.extension.filename = 'zero-0.5.56.vsix';
    f.files['release/kit.json'] = JSON.stringify(kit, null, 2) + '\n'; writeFileSync(kitPath, f.files['release/kit.json']);
  }
  rmSync(join(f.dir, 'student-template/README.md'));
  assert.throws(() => setReleaseVersion(f.dir, '0.5.57'));
  for (const name of ['release/kit.json', 'extension/package.json', 'release/START-HERE.md']) assert.equal(f.read(name), f.files[name]);
});
