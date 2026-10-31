'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const requirements = require('./sharing/contracts');
const currentCore = Object.freeze({coordinate:Object.freeze({groupId:'school.zero',artifactId:'zero-core',version:'0.3.0'}),javaRelease:'17',javafxVersion:'21.0.12'});
const helperHashes = Object.freeze({
  'zero/AnimationSource.java': '6e8c59ead0dc61900ab51547c76295db0e3f72ecc1f314d62507a6861c23bb6e',
  'zero/AnimationPlayback.java': '2b7e9cbbb6113a9b0ae751bc6db46bc07b2e1b515294b13a734016f13fb6616c',
  'zero/ui/Row.java': '75be7cf9339fe60df6308509d4a8116d328b0dc3bd636e8d3620002861da306a',
  'zero/Key.java': 'ba68495fd911017c8ca84a53ec0211c94cf9e14796fb8462cbc6c32cbf6835f8',
  'zero/ui/TextField.java': 'b5b26ea3e0f64e6b5ceb8f225b9c89691a615fa213c13723d28b42f3bb983188',
  'zero/Actor.java': '6455d32b652900ef7ad7df897d9c20570441bbd9be4162a98afa113c3d56a7d4',
  'zero/App.java': '8402997e9d6228ffdb2a13d90f87c8baa6ca3452b75e057e7f91df74c0a0d386',
  'zero/Collisions.java': '1d1cc1c57fcbbcb8421bf469c6d74e5f1707c5542c265d1819f38e59fb4e67fe',
  'zero/Color.java': 'ac3e62480b526e4505c5640ce857757c13cec6134ec7d6d759c4321b785e07d7',
  'zero/GameApp.java': 'b93f486b931b4cd89300010ec434894119c2dbf2e3e3923f9b4c6e063fd197d1',
  'zero/ImageRegion.java': '0fd6961541501815c80f1979f7aa54d36f724a794f8d241ae26ba9c27e54d83d',
  'zero/Music.java': '4c183bb3c7807cac3086dbbb29a388541c606c11b654ca4aad914ad3a5db8450',
  'zero/Sound.java': '6247f0a0d6af9b610727094967af249321c58e6dda21ce1a2a989a3fc6e75286',
  'zero/SpriteAnimation.java': '7eb05ad248f4b781870a27859f545bddaf4f5043ea580f01a9597566625ce93c',
  'zero/ui/Button.java': '396bac56f3c35fe2274aadab10a0047d974600eef0c2815204168b71aac12c55',
  'zero/ui/Column.java': 'eeecc92fa722974da5b63ea842d5152b74436087953ab26b8d257a06fe3808e3',
  'zero/ui/Element.java': '4ad21695876906252a91beba1e499f2da4ae15bcbb0dce883525ca91393a80b6',
  'zero/ui/Label.java': '0165a8e484828ba82542f8bbc01c5db55d8ab0226dff4221c6fc97c7024808e0'
});

const coreSourcePaths = Object.freeze(Object.keys(helperHashes).map(name => 'src/main/java/' + name).sort());
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function normalizeSource(input) {
  if (typeof input !== 'string' && !Buffer.isBuffer(input) && !(input instanceof Uint8Array)) throw new Error('Core source must be UTF-8 bytes or text.');
  const bytes = typeof input === 'string' ? Buffer.from(input,'utf8') : Buffer.from(input);
  if (bytes.length > 1024 * 1024) throw new Error('Core source exceeds its size bound.');
  let text; try { text = new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes); } catch { throw new Error('Core source must be valid UTF-8.'); }
  if (typeof input === 'string' && text !== input) throw new Error('Core source must be valid UTF-8.');
  if (text.includes('\ufeff') || /\r(?!\n)/.test(text)) throw new Error('Core source must not contain a BOM or lone CR.');
  return text.replace(/\r\n/g,'\n');
}
function makeCoreRecord(sources) {
  if (!sources || typeof sources !== 'object' || Array.isArray(sources) || Object.keys(sources).sort().join('\n') !== coreSourcePaths.join('\n')) throw new Error('Core sources must contain exactly the reviewed source paths.');
  const entries = coreSourcePaths.map(name => {
    const sha256 = hash(normalizeSource(sources[name]));
    if (sha256 !== helperHashes[name.slice('src/main/java/'.length)]) throw new Error('Core source differs from the reviewed current core: ' + name);
    return {path:name,sha256};
  });
  return {schema:1,coordinate:{...currentCore.coordinate},javaRelease:currentCore.javaRelease,javafxVersion:currentCore.javafxVersion,
    sources:entries,sourceSha256:hash(JSON.stringify(entries))};
}
function validateCoreRecord(value,sources) {
  const expected = makeCoreRecord(sources);
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== Object.keys(expected).sort().join(',') ||
      value.schema !== 1 || (!value.coordinate || Object.keys(value.coordinate).sort().join(',') !== 'artifactId,groupId,version' || Object.entries(expected.coordinate).some(([name,item]) => value.coordinate[name] !== item)) || value.javaRelease !== expected.javaRelease ||
      value.javafxVersion !== expected.javafxVersion || !Array.isArray(value.sources) || value.sources.length !== coreSourcePaths.length ||
      value.sources.some((entry,index) => !entry || Object.keys(entry).sort().join(',') !== 'path,sha256' || entry.path !== expected.sources[index].path || entry.sha256 !== expected.sources[index].sha256) ||
      value.sourceSha256 !== expected.sourceSha256) throw new Error('Invalid or mismatched zero-core.json; restore the record and its exact reviewed core sources.');
  return expected;
}
async function ordinary(filename,{missing=false,directory=false}={}) {
  let current = path.parse(filename).root;
  for (const part of filename.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current,part);
    let stat; try { stat = await fs.lstat(current); } catch (error) { if (missing && error.code === 'ENOENT') return null; throw error; }
    if (stat.isSymbolicLink() || (current !== filename ? !stat.isDirectory() : directory ? !stat.isDirectory() : !stat.isFile())) throw new Error('Core paths must be ordinary files/directories: ' + current);
    if (current === filename) return stat;
  }
}
async function readProjectCore(projectRoot,{required=false}={}) {
  const root = path.resolve(projectRoot); await ordinary(root,{directory:true});
  const filename = path.join(root,'zero-core.json'); const stat = await ordinary(filename,{missing:true});
  if (!stat) {
    if (required) throw new Error('This library requires a project-owned zero-core.json. Keep this project unchanged; use a compatible library or a deliberate upgraded copy.');
    return null;
  }
  if (stat.size > 65536) throw new Error('zero-core.json exceeds its size bound.');
  let value; try { value = JSON.parse(normalizeSource(await fs.readFile(filename))); } catch { throw new Error('Invalid zero-core.json JSON/encoding.'); }
  const sources = {};
  for (const name of coreSourcePaths) {
    const source = path.join(root,...name.split('/')); const info = await ordinary(source);
    if (info.size > 1024 * 1024) throw new Error('Core source exceeds its size bound.');
    sources[name] = await fs.readFile(source);
  }
  return validateCoreRecord(value,sources);
}
module.exports = {currentCore,helperHashes,coreSourcePaths,normalizeSource,makeCoreRecord,validateCoreRecord,readProjectCore,
  validateCoreRequirement:requirements.validateCoreRequirement,versionSatisfies:requirements.versionSatisfies,
  validateCoreInput:requirements.validateCoreInput,validateCoreBuild:requirements.validateCoreBuild};
