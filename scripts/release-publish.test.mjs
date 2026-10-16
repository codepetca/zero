import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm, cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {zipSync, unzipSync} from 'fflate';
import {publishZero, parseArguments, promoteDefinition, promoteReadme, verifyChecks, verifyPreparation} from './release-publish.mjs';

const sha = 'a'.repeat(40), head = 'b'.repeat(40), mergedSha = 'c'.repeat(40);
const version = '1.2.3', runId = '123', uuid = 'fixture-request';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const keys = ['kit', 'starter', 'extension'];
const filenames = ['zero-bootstrap.zip', 'zero-starter.zip', `zero-${version}.vsix`];
const harnessSource = 'sharing/harness/ZeroLibraryHarness.java';
const harnessMedia = 'extension/media/sharing-harness/ZeroLibraryHarness.java';
const harness = 'public class ZeroLibraryHarness {}\n';
const sharingSource = 'release/sharing.json';
const sharingMedia = 'extension/media/sharing-config.json';
const sharingSettings = {schema: 1, catalogUrl: 'https://zero.codepet.ca/api/sharing/catalog',
  artifactOrigin: 'https://fixture.public.blob.vercel-storage.com', policyRevision: 'a'.repeat(40)};
const sharing = JSON.stringify(sharingSettings, null, 2) + '\n';
const exec = promisify(execFile);

async function fixture(t, changes = {}) {
  const sourceSha = changes.sourceSha || sha;
  const root = await mkdtemp(path.join(tmpdir(), 'zero-publisher-test-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const template = path.join(root, 'template');
  await mkdir(path.join(template, 'release'), {recursive: true});
  await mkdir(path.join(template, 'extension/src'), {recursive: true});
  await mkdir(path.join(template, 'framework'), {recursive: true});
  await mkdir(path.join(template, 'sharing/harness'), {recursive: true});
  const definition = {schema: 1, kitVersion: version, coreVersion: '0.1.1', publication: {status: 'local', repository: 'codepetca/zero', tag: `v${version}`},
    assets: {kit: {filename: filenames[0], label: 'Kit'}, starter: {filename: filenames[1], label: 'Starter'},
      extension: {filename: filenames[2], label: 'Extension'}, components: {filename: 'zero-components.zip', label: 'Components', publicationStatus: 'local'}}};
  const manifest = JSON.stringify({version, license: 'MIT'}), license = 'MIT License\nfixture notice\n', js = 'module.exports = 42;\n';
  await Promise.all(Object.entries({'release/kit.json': JSON.stringify(definition, null, 2) + '\n', 'extension/package.json': manifest,
    'extension/src/extension.js': js, [harnessSource]: harness, [sharingSource]: sharing, LICENSE: license, 'framework/pom.xml': '<artifactId>zero-core</artifactId>\n  <version>0.1.1</version>',
    'README.md': '# Zero\n[Download for Windows — complete kit ZIP 1.2.2](https://github.com/codepetca/zero/releases/download/v1.2.2/zero-bootstrap.zip)\nUnrelated source and learning changes stay.\n'})
    .map(([name, body]) => writeFile(path.join(template, name), body)));
  const bytes = [Buffer.from('reviewed kit bytes'), Buffer.from('reviewed starter bytes'), Buffer.from(zipSync({
    'extension/LICENSE.txt': Buffer.from(license), 'extension/src/extension.js': Buffer.from(js), 'extension/package.json': Buffer.from(manifest),
    [harnessMedia]: Buffer.from(harness), [sharingMedia]: Buffer.from(sharing)}))];
  const receipt = {...definition, assets: Object.fromEntries(keys.map((key, i) => [key, {...definition.assets[key], size: bytes[i].length, sha256: digest(bytes[i])}]))};
  const release = {id: 7, tag_name: `v${version}`, target_commitish: sourceSha, draft: true, prerelease: false,
    html_url: 'https://github.com/codepetca/zero/releases/tag/untagged-fixture123', assets: filenames.map((name, i) => ({
      id: i + 20, name, size: bytes[i].length, digest: `sha256:${digest(bytes[i])}`, state: 'uploaded',
      browser_download_url: `https://github.com/codepetca/zero/releases/download/untagged-fixture123/${name}`}))};
  const prepared = {databaseId: Number(runId), workflowName: 'Release checks and preparation', event: 'workflow_dispatch', headSha: sourceSha,
    status: 'completed', conclusion: 'success', displayTitle: `Prepare Zero ${version} [${uuid}]`};
  const pr = {state: 'OPEN', headRefOid: head, baseRefName: 'main', isDraft: false, reviewDecision: '', reviewRequests: [], mergeStateStatus: 'CLEAN',
    statusCheckRollup: [{__typename: 'CheckRun', name: 'review', status: 'COMPLETED', conclusion: 'SUCCESS'}]};
  const calls = [], requests = [], logs = [];
  let exists = Boolean(changes.existing), published = Boolean(changes.published), promoted = Boolean(changes.promoted), clock = 0, createdPr = false;
  const publishUrls = () => {
    release.draft = false;
    release.html_url = `https://github.com/codepetca/zero/releases/tag/v${version}`;
    for (const asset of release.assets) asset.browser_download_url = `https://github.com/codepetca/zero/releases/download/v${version}/${asset.name}`;
  };
  if (published) publishUrls();
  if (promoted) {
    const metadata = promoteDefinition(definition, receipt, release.assets);
    await writeFile(path.join(template, 'release/kit.json'), JSON.stringify(metadata, null, 2) + '\n');
    await writeFile(path.join(template, 'README.md'), `# Zero\n[Download for Windows — complete kit ZIP ${version}](${metadata.assets.kit.url})\n`);
  }
  const environment = {definition, receipt, release, prepared, pr, bytes, calls, requests, logs, root, template};
  if (changes.modify) await changes.modify(environment);
  const output = value => ({stdout: typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)});
  const notFound = () => {const error = new Error('Fixture 404'); error.httpStatus = 404; throw error;};
  const runner = async (command, args, options) => {
    calls.push({command, args, cwd: options.cwd});
    if (changes.intercept) {
      const result = await changes.intercept(command, args, options, environment);
      if (result !== undefined) return output(result);
    }
    if (command === 'git') {
      if (args[0] === 'clone') {await cp(template, args.at(-1), {recursive: true}); return output('');}
      if (args[0] === 'rev-parse') return output(args[1] === 'HEAD' ? head : promoted ? mergedSha : changes.mainSha || sourceSha);
      if (args[0] === 'worktree') {await cp(template, args[3], {recursive: true});
        // On resumed public metadata, the exact candidate still has the original local definition.
        await writeFile(path.join(args[3], 'release/kit.json'), JSON.stringify(definition, null, 2) + '\n');
        return output('');}
      if (args[0] === 'diff') return output(args.includes('--check') || args.includes('--') ? '' : 'README.md\nrelease/kit.json\n');
      if (args[0] === 'show') {
        const name = args[1].slice(args[1].indexOf(':') + 1);
        if (changes.validBranch && args[1].startsWith(`${head}:`)) {
          const promotedDefinition = promoteDefinition(definition, receipt, release.assets);
          if (name === 'release/kit.json') return output(JSON.stringify(promotedDefinition, null, 2) + '\n');
          if (name === 'README.md') return output((await readFile(path.join(options.cwd, name), 'utf8'))
            .replace('[Download for Windows — complete kit ZIP 1.2.2](https://github.com/codepetca/zero/releases/download/v1.2.2/zero-bootstrap.zip)', `[Download for Windows — complete kit ZIP ${version}](${promotedDefinition.assets.kit.url})`));
        }
        return output(await readFile(path.join(options.cwd, name), 'utf8'));
      }
      if (['checkout', 'merge-base', 'fetch', 'add', 'push', '-c'].includes(args[0])) return output('');
    }
    if (command === 'gh') {
      if (args[0] === 'api') {
        if (args[1] === 'user') return output({id: 999, login: 'fixture-owner'});
        const endpoint = args[1].replace('repos/codepetca/zero/', '');
        if (endpoint === 'releases') return output([exists ? [release] : []]);
        if (endpoint === `git/ref/tags/v${version}`) return published ? output({object: {type: 'commit', sha: sourceSha}}) : notFound();
        if (endpoint.startsWith('git/ref/heads/')) return changes.branchExists ? output({object: {sha: head}}) : notFound();
        if (endpoint === `actions/runs/${runId}`) return output({id: Number(runId), path: '.github/workflows/release-review.yml'});
        if (endpoint === 'releases/7') {
          if (args.includes('PATCH')) {published = true; publishUrls();}
          return output(release);
        }
        if (endpoint.startsWith('releases/assets/')) {
          const i = Number(endpoint.split('/').at(-1)) - 20;
          return output(changes.corruptUploaded === i ? Buffer.alloc(bytes[i].length) : bytes[i]);
        }
      }
      if (args[0] === 'workflow') return output('');
      if (args[0] === 'run') {
        if (args[1] === 'view') return output(prepared);
        if (args[1] === 'list') return output(args.includes('pull_request') ? [{...prepared, event: 'pull_request', headSha: head}] : [prepared]);
        if (args[1] === 'download') {
          const destination = args[args.indexOf('--dir') + 1];
          for (let i = 0; i < 3; i++) await writeFile(path.join(destination, filenames[i]), changes.corruptReview === i ? Buffer.from('corrupt') : bytes[i]);
          await writeFile(path.join(destination, 'release.json'), JSON.stringify(receipt));
          await writeFile(path.join(destination, 'SOURCE.txt'), changes.sourceReceipt || `Repository: codepetca/zero\nCommit: ${sourceSha}\nVersion: ${version}\nRun: ${runId}\n`);
          await writeFile(path.join(destination, 'SHA256SUMS'), changes.checksums || keys.map(key => `${receipt.assets[key].sha256}  ${receipt.assets[key].filename}\n`).join(''));
          return output('');
        }
      }
      if (args[0] === 'release' && args[1] === 'create') {exists = true; return output(release.html_url);}
      if (args[0] === 'pr') {
        if (args[1] === 'list') return output(changes.branchExists ? [{number: 8, url: 'https://github.com/codepetca/zero/pull/8', state: 'OPEN', headRefOid: head}] : []);
        if (args[1] === 'create') {createdPr = true; return output('https://github.com/codepetca/zero/pull/8\n');}
        if (args[1] === 'diff') return output(changes.arbitraryDiff ? 'README.md\nrelease/kit.json\nextension/src/extension.js\n' : 'README.md\nrelease/kit.json\n');
        if (args[1] === 'view') return output(pr.state === 'MERGED' ? {...pr, mergeCommit: {oid: mergedSha}} : pr);
        if (args[1] === 'merge') {
          if (changes.deniedMerge) throw new Error('Merge denied by repository rules.');
          assert.ok(createdPr || changes.branchExists);
          assert.ok(args.includes('--match-head-commit'));
          assert.equal(args[args.indexOf('--match-head-commit') + 1], head);
          if (changes.validBranch) {
            const metadata = promoteDefinition(definition, receipt, release.assets);
            await writeFile(path.join(root, 'temporary/source/release/kit.json'), JSON.stringify(metadata, null, 2) + '\n');
            const readmeFile = path.join(root, 'temporary/source/README.md');
            await writeFile(readmeFile, (await readFile(readmeFile, 'utf8')).replace('[Download for Windows — complete kit ZIP 1.2.2](https://github.com/codepetca/zero/releases/download/v1.2.2/zero-bootstrap.zip)', `[Download for Windows — complete kit ZIP ${version}](${metadata.assets.kit.url})`));
          }
          pr.state = 'MERGED'; promoted = true; return output('');
        }
      }
    }
    throw new Error(`Unexpected mocked transport: ${command} ${args.join(' ')}`);
  };
  const request = async url => {
    requests.push(url);
    if (['https://zero.codepet.ca/learn','https://zero.codepet.ca/downloads'].includes(url) && changes.choices) return {status: 200, text: async () => changes.choices(release.assets[0].browser_download_url), url: changes.choicesRedirect || url};
    if (url.startsWith('https://zero.codepet.ca/') && changes.choices) return {status: 200, url:changes.landingRedirect || url, text: async () => `<a href="${changes.choicesHref || '/learn#downloads'}">Download Zero</a>`};
    if (url.startsWith('https://zero.codepet.ca/')) return {status: 200, text: async () => changes.staleSite ?
      `<script>"${release.assets[0].browser_download_url}"</script><a href="https://old.example/old.zip">Download Zero</a>` :
      `<a class="download" href="${release.assets[0].browser_download_url}"><span>Download Zero</span></a>`};
    const i = release.assets.findIndex(asset => asset.browser_download_url === url);
    assert.ok(i >= 0, 'Fetch must use the exact public release URL.');
    return {status: changes.failedDownload ? 503 : 200,
      arrayBuffer: async () => changes.corruptPublic === i ? Buffer.from('corrupt') :
        changes.corruptLive && i === 0 && requests.filter(item => item === url).length > 1 ? Buffer.alloc(bytes[i].length) : bytes[i]};
  };
  return {...environment, dependencies: {runner, fetch: request, log: value => logs.push(value), uuid: () => uuid,
    makeTemp: async () => {const folder = path.join(root, 'temporary'); await mkdir(folder); return folder;},
    now: () => clock, sleep: async ms => {clock += ms;}, preparationTimeout: 30, ciTimeout: 30, liveTimeout: 30, pollInterval: 10}};
}

test('arguments require one version and keep verification read-only', () => {
  assert.deepEqual(parseArguments(['--version', version, '--run-id', runId]), {version, runId});
  for (const args of [[], ['--version', 'v1.2.3'], ['--version', version, '--run-id', 'x'], ['--version', version, '--verify-only', '--run-id', runId], ['--version', version, '--force']]) assert.throws(() => parseArguments(args));
});

test('full bounded lifecycle dispatches exact main, publishes three exact files, merges checked metadata and verifies live bytes', async t => {
  const f = await fixture(t);
  const result = await publishZero({version}, f.dependencies);
  assert.equal(result.phase, 'verified');
  assert.equal(result.runId, runId);
  assert.equal(result.prUrl, 'https://github.com/codepetca/zero/pull/8');
  const dispatch = f.calls.find(call => call.args[0] === 'workflow');
  assert.ok(dispatch.args.includes(`request_id=${uuid}`));
  const create = f.calls.find(call => call.args[0] === 'release');
  assert.deepEqual(create.args.filter(arg => arg.endsWith('.zip') || arg.endsWith('.vsix')).map(name => path.basename(name)), filenames);
  assert.equal(f.release.draft, false);
  assert.equal(f.pr.state, 'MERGED');
  assert.equal(f.requests.filter(url => url === f.release.assets[0].browser_download_url).length, 2, 'Public and live kit both fetched');
  assert.ok(f.logs.some(value => value.includes(result.prUrl)));
});

for (const published of [false, true]) test(`resumes exact existing ${published ? 'public release' : 'draft'} without reupload or dispatch`, async t => {
  const f = await fixture(t, {existing: true, published});
  assert.equal((await publishZero({version, runId}, f.dependencies)).phase, 'verified');
  assert.ok(!f.calls.some(call => call.args[0] === 'workflow' || call.args[0] === 'release'));
  assert.equal(f.calls.filter(call => call.args.includes('PATCH')).length, published ? 0 : 1);
});

for (const scenario of ['wrong lightweight tag', 'wrong annotated tag', 'tag changed during asset verification']) {
  test(`resumed draft rejects ${scenario} before publication`, async t => {
    let lookups = 0;
    const f = await fixture(t, {existing: true, intercept: async (command, args) => {
      if (command !== 'gh' || args[0] !== 'api') return;
      if (args[1] === `repos/codepetca/zero/git/ref/tags/v${version}`) {
        lookups++;
        if (scenario === 'tag changed during asset verification' && lookups === 1) return;
        return {object: {type: scenario === 'wrong annotated tag' ? 'tag' : 'commit', sha: 'd'.repeat(40)}};
      }
      if (args[1] === `repos/codepetca/zero/git/tags/${'d'.repeat(40)}`) return {object: {type: 'commit', sha: 'e'.repeat(40)}};
    }});
    await assert.rejects(publishZero({version, runId}, f.dependencies), /Release tag target drift/);
    assert.equal(f.release.draft, true, 'Conflicting draft stays private');
    assert.ok(!f.calls.some(call => call.args.includes('PATCH') || call.args[0] === 'release' || call.args[0] === 'pr'));
    if (scenario === 'tag changed during asset verification') assert.equal(lookups, 2);
  });
}

test('resumed draft accepts an annotated tag pinned to the prepared commit', async t => {
  const f = await fixture(t, {existing: true, intercept: async (command, args) => {
    if (command !== 'gh' || args[0] !== 'api') return;
    if (args[1] === `repos/codepetca/zero/git/ref/tags/v${version}`) return {object: {type: 'tag', sha: 'd'.repeat(40)}};
    if (args[1] === `repos/codepetca/zero/git/tags/${'d'.repeat(40)}`) return {object: {type: 'commit', sha}};
  }});
  assert.equal((await publishZero({version, runId}, f.dependencies)).phase, 'verified');
  assert.equal(f.calls.filter(call => call.args.includes('PATCH')).length, 1);
});

test('verify-only checks all public metadata/downloads and actual live anchor without mutations', async t => {
  const f = await fixture(t, {existing: true, published: true, promoted: true});
  assert.equal((await publishZero({version, verifyOnly: true}, f.dependencies)).phase, 'verified');
  assert.ok(!f.calls.some(call => call.command === 'gh' && ['workflow', 'release', 'pr'].includes(call.args[0])));
  assert.ok(!f.calls.some(call => call.args.includes('PATCH') || ['push', '-c', 'add', 'worktree'].includes(call.args[0])));
  assert.equal(f.requests.length, 5);
});

test('verify-only follows the same-site download choices and measures the exact kit anchor', async t => {
  const f = await fixture(t, {existing:true, published:true, promoted:true,
    choices: url => `<section id="downloads"><a href="https://example.com/setup.dmg">Download for Mac</a><details><a href="${url}">Complete kit ZIP 1.2.3 — Windows, Linux or manual setup</a></details></section>`});
  assert.equal((await publishZero({version, verifyOnly:true}, f.dependencies)).phase, 'verified');
  assert.ok(f.requests.includes('https://zero.codepet.ca/learn'));
  assert.equal(f.requests.filter(url => url === f.release.assets[0].browser_download_url).length, 2);
  assert.ok(!f.calls.some(call => call.args.includes('PATCH') || ['push', '-c', 'add', 'worktree'].includes(call.args[0])));
});

for (const href of ['/downloads','https://zero.codepet.ca/downloads']) {
  test(`verify-only follows the current Downloads page from ${href}`, async t => {
    const f = await fixture(t, {existing:true,published:true,promoted:true,choicesHref:href,
      choices: url => `<main><h1>Download Zero</h1><section id="downloads"><a href="https://example.com/setup.dmg">Download for Mac Silicon</a><a href="${url}">Download for Windows (ZIP)</a></section></main>`});
    assert.equal((await publishZero({version,verifyOnly:true},f.dependencies)).phase,'verified');
    assert.ok(f.requests.includes('https://zero.codepet.ca/downloads'));
    assert.ok(!f.requests.includes('https://zero.codepet.ca/learn'));
    assert.equal(f.requests.filter(url => url === f.release.assets[0].browser_download_url).length,2);
    assert.ok(!f.calls.some(call => call.args.includes('PATCH') || ['push','-c','add','worktree'].includes(call.args[0])));
  });
}
for (const wrapper of ['template','div hidden','div hidden="false"','div inert','div aria-hidden="true"','div style="display: none"','div style="visibility:hidden"']) {
  test(`modern download verification excludes ${wrapper} ancestors`,async t=>{
    const close=wrapper.split(' ')[0];
    const f=await fixture(t,{existing:true,published:true,promoted:true,choicesHref:'/downloads',
      choices:url=>`<section id="downloads"><a href="https://example.com/stale-kit.zip">Download for Windows (ZIP)</a><${wrapper}><a href="${url}">old placeholder</a></${close}></section>`});
    await assert.rejects(publishZero({version,verifyOnly:true},f.dependencies),/choices kit link is stale/);
    assert.equal(f.requests.filter(url=>url===f.release.assets[0].browser_download_url).length,1);
  });
  test(`modern download verification cannot use only a ${wrapper} kit`,async t=>{
    const close=wrapper.split(' ')[0];
    const f=await fixture(t,{existing:true,published:true,promoted:true,choicesHref:'/downloads',
      choices:url=>`<section id="downloads"><${wrapper}><a href="${url}">Download for Windows (ZIP)</a></${close}></section>`});
    await assert.rejects(publishZero({version,verifyOnly:true},f.dependencies),/one kit candidate/);
  });
}
for (const redirect of ['https://evil.example/','https://zero.codepet.ca/hub']) {
  test(`live landing rejects redirect to ${redirect}`,async t=>{
    const f=await fixture(t,{existing:true,published:true,promoted:true,choicesHref:'/downloads',landingRedirect:redirect,
      choices:url=>`<section id="downloads"><a href="${url}">Download for Windows (ZIP)</a></section>`});
    await assert.rejects(publishZero({version,verifyOnly:true},f.dependencies),/landing redirected outside/);
    assert.ok(!f.requests.includes('https://zero.codepet.ca/downloads'));
  });
}

for (const [label,changes,pattern] of [
  ['stale modern kit',{choices:()=>'<section id="downloads"><a href="https://github.com/codepetca/zero/releases/download/v1.2.2/zero-bootstrap.zip">Download for Windows (ZIP)</a></section>'},/choices kit link is stale/],
  ['modern page redirect to Learn',{choices:()=>'',choicesRedirect:'https://zero.codepet.ca/learn'},/redirected outside/],
  ['external modern page redirect',{choices:()=>'',choicesRedirect:'https://evil.example/downloads'},/redirected outside/],
  ['modern duplicate kit',{choices:url=>`<section id="downloads"><a href="${url}">Download for Windows (ZIP)</a><a href="${url}">Download for Windows (ZIP)</a></section>`},/one kit candidate/],
]) test(`modern live download choices reject ${label}`,async t=>{
  const f=await fixture(t,{existing:true,published:true,promoted:true,choicesHref:'/downloads',...changes});
  await assert.rejects(publishZero({version,verifyOnly:true},f.dependencies),pattern);
  assert.equal(f.requests.filter(url=>url===f.release.assets[0].browser_download_url).length,1);
});

for (const [label, changes, pattern] of [
  ['stale kit', {choices: () => '<section id="downloads"><a href="https://old.example/old.zip">Complete kit ZIP 1.2.2</a></section>'}, /choices kit link is stale/],
  ['script-only kit', {choices: url => `<section id="downloads"><script><a href="${url}">Complete kit ZIP</a></script></section>`}, /one kit candidate/],
  ['data attribute instead of href', {choices: url => `<section id="downloads"><a data-href="${url}">Complete kit ZIP</a></section>`}, /one kit candidate/],
  ['data attribute instead of section id', {choices: url => `<section data-id="downloads"><a href="${url}">Complete kit ZIP</a></section>`}, /one downloads section/],
  ['kit outside section', {choices: url => `<a href="${url}">Complete kit ZIP</a><section id="downloads"></section>`}, /one kit candidate/],
  ['duplicate kit', {choices: url => `<section id="downloads"><a href="${url}">Complete kit ZIP</a><a href="${url}">Complete kit ZIP</a></section>`}, /one kit candidate/],
  ['missing section', {choices: () => '<p>No downloads</p>'}, /one downloads section/],
  ['external choice link', {choicesHref:'https://evil.example/learn#downloads', choices: () => ''}, /download link is stale/],
  ['external choice redirect', {choicesRedirect:'https://evil.example/learn', choices: () => ''}, /redirected outside/]
]) test(`live download choices reject ${label}`, async t => {
  const f = await fixture(t, {existing:true, published:true, promoted:true, ...changes});
  await assert.rejects(publishZero({version, verifyOnly:true}, f.dependencies), pattern);
  assert.equal(f.requests.filter(url => url === f.release.assets[0].browser_download_url).length, 1, 'Only prior independent public verification fetched the kit');
});

for (const [label, changes, pattern] of [
  ['failed preparation', {modify: f => {f.prepared.conclusion = 'failure';}}, /did not succeed/],
  ['wrong preparation head', {modify: f => {f.prepared.headSha = 'd'.repeat(40);}}, /head differs/],
  ['unknown preparation status', {modify: f => {f.prepared.status = 'mystery';}}, /Unknown preparation/],
  ['wrong source receipt', {sourceReceipt: 'wrong'}, /SOURCE receipt drift/],
  ['wrong checksum receipt', {checksums: 'wrong'}, /SHA256SUMS drift/],
  ['corrupt prepared bytes', {corruptReview: 0}, /size drift/],
  ['extra receipt asset', {modify: f => {f.receipt.assets.components = f.definition.assets.components;}}, /three public assets/],
  ['receipt metadata drift', {modify: f => {f.receipt.assets.kit.label = 'unexpected';}}, /metadata drift/],
  ['existing draft without run', {existing: true}, /exact preparation --run-id/]
]) test(`${label} stops before publication`, async t => {
  const f = await fixture(t, changes);
  await assert.rejects(publishZero({version}, f.dependencies), pattern);
  assert.ok(!f.calls.some(call => call.args.includes('PATCH') || call.args[0] === 'release'));
});

for (const [label, modify, pattern] of [
  ['different target', f => {f.release.target_commitish = 'd'.repeat(40);}, /target must be/],
  ['additional component', f => {f.release.assets.push({...f.release.assets[0], name: 'zero-components.zip'});}, /exactly three/],
  ['checksum conflict', f => {f.release.assets[0].digest = `sha256:${'0'.repeat(64)}`;}, /digest drift/],
  ['actual draft byte conflict without API digest', f => {f.release.assets[0].digest = null;}, /byte checksum drift/]
]) test(`existing conflicting draft ${label} is immutable and stopped`, async t => {
  const f = await fixture(t, {existing: true, modify, ...(label.startsWith('actual draft') ? {corruptUploaded: 0} : {})});
  await assert.rejects(publishZero({version, runId}, f.dependencies), pattern);
  assert.ok(!f.calls.some(call => call.args.includes('PATCH') || call.args[0] === 'release'));
});

for (const [label, changes, pattern] of [
  ['arbitrary PR diff', {arbitraryDiff: true}, /arbitrary changes/],
  ['changed PR head', {modify: f => {f.pr.headRefOid = 'd'.repeat(40);}}, /head changed/],
  ['failed CI', {modify: f => {f.pr.statusCheckRollup[0].conclusion = 'FAILURE';}}, /did not succeed/],
  ['unknown CI', {modify: f => {f.pr.statusCheckRollup[0].status = 'mystery';}}, /status unknown/],
  ['missing CI', {modify: f => {f.pr.statusCheckRollup = [];}}, /before timeout/],
  ['requested review', {modify: f => {f.pr.reviewRequests = [{login: 'reviewer'}];}}, /outstanding review/],
  ['blocked rules', {modify: f => {f.pr.mergeStateStatus = 'BLOCKED';}}, /blocked/],
  ['denied merge', {deniedMerge: true}, /Merge denied/],
  ['failed public download', {failedDownload: true}, /download failed/],
  ['corrupt public bytes', {corruptPublic: 1}, /download size drift/],
  ['stale live link despite expected URL in script', {staleSite: true}, /Live verification timed out.*stale/]
]) test(`${label} leaves recoverable exact release/PR state`, async t => {
  const f = await fixture(t, changes);
  await assert.rejects(publishZero({version}, f.dependencies), pattern);
  assert.equal(f.release.draft, false, 'Verified publication remains intact');
  if (!changes.staleSite) assert.equal(f.pr.state, 'OPEN');
});

test('main definition drift preserves the public release and stops metadata promotion', async t => {
  const f = await fixture(t, {intercept: async (command, args, options) => {
    if (command === 'git' && args[0] === 'fetch' && args[2] === 'main') {
      const filename = path.join(options.cwd, 'release/kit.json');
      const current = JSON.parse(await readFile(filename, 'utf8'));
      current.assets.kit.label = 'different current main definition';
      await writeFile(filename, JSON.stringify(current));
      return '';
    }
  }});
  await assert.rejects(publishZero({version}, f.dependencies), /Main release definition drift/);
  assert.ok(!f.calls.some(call => call.args[0] === 'push' || call.args[0] === 'pr'));
});

test('a colliding fixed metadata branch is rejected without pushing', async t => {
  const f = await fixture(t, {branchExists: true});
  await assert.rejects(publishZero({version}, f.dependencies), /branch differs from generated/);
  assert.ok(!f.calls.some(call => call.args[0] === 'push' || call.args[0] === 'pr'));
});

test('exact existing metadata branch/PR resumes without duplicate push or PR', async t => {
  const f = await fixture(t, {existing: true, published: true, branchExists: true, validBranch: true});
  assert.equal((await publishZero({version, runId}, f.dependencies)).phase, 'verified');
  assert.ok(!f.calls.some(call => call.args[0] === 'push' || (call.args[0] === 'pr' && call.args[1] === 'create')));
});

test('expired review artifact cannot trigger release creation', async t => {
  const f = await fixture(t, {intercept: async (command, args) => {
    if (command === 'gh' && args[0] === 'run' && args[1] === 'download') throw new Error('Review artifact expired or unavailable.');
  }});
  await assert.rejects(publishZero({version, runId}, f.dependencies), /expired or unavailable/);
  assert.ok(!f.calls.some(call => call.args[0] === 'release' || call.args.includes('PATCH')));
});

test('changed packaged Java/source stops before release publication', async t => {
  const f = await fixture(t, {intercept: async (command, args) => {
    if (command === 'git' && args[0] === 'diff' && args.includes('--')) return 'framework/src/main/java/zero/App.java\n';
  }});
  await assert.rejects(publishZero({version, runId}, f.dependencies), /Packaged source changed/);
  assert.ok(!f.calls.some(call => call.args[0] === 'release' || call.args.includes('PATCH')));
});

for (const missing of [false, true]) test(`downloaded review with ${missing ? 'missing' : 'stale'} harness stops before publication despite matching checksums`, async t => {
  const f = await fixture(t, {modify: f => {
    const members = unzipSync(f.bytes[2]);
    if (missing) delete members[harnessMedia];
    else members[harnessMedia] = Buffer.from('public class ZeroLibraryHarness { int stale; }\n');
    f.bytes[2] = Buffer.from(zipSync(members));
    f.receipt.assets.extension.size = f.bytes[2].length;
    f.receipt.assets.extension.sha256 = digest(f.bytes[2]);
  }});
  await assert.rejects(publishZero({version, runId}, f.dependencies), /VSIX sharing harness drift/);
  assert.ok(!f.calls.some(call => call.args[0] === 'release' || call.args.includes('PATCH') || call.args[0] === 'pr'));
});

for (const kind of ['missing', 'wrong', 'stale']) test(`downloaded review with ${kind} sharing settings stops before publication despite matching checksums`, async t => {
  const f = await fixture(t, {modify: f => {
    const members = unzipSync(f.bytes[2]);
    if (kind === 'missing') delete members[sharingMedia];
    else members[sharingMedia] = Buffer.from(JSON.stringify({...sharingSettings,
      ...(kind === 'wrong' ? {catalogUrl: 'https://wrong.example/catalog'} : {policyRevision: 'b'.repeat(40)})}));
    f.bytes[2] = Buffer.from(zipSync(members));
    f.receipt.assets.extension.size = f.bytes[2].length;
    f.receipt.assets.extension.sha256 = digest(f.bytes[2]);
  }});
  await assert.rejects(publishZero({version, runId}, f.dependencies), /VSIX sharing configuration drift/);
  assert.ok(!f.calls.some(call => call.args[0] === 'release' || call.args.includes('PATCH') || call.args[0] === 'pr'));
});

for (const [kind, source, original, updated] of [
  ['harness', harnessSource, harness, 'public class ZeroLibraryHarness { int updated; }\n'],
  ['sharing configuration', sharingSource, sharing, JSON.stringify({...sharingSettings, policyRevision: 'b'.repeat(40)}, null, 2) + '\n']
]) for (const stage of ['selected main', 'latest main']) test(`a ${kind}-only commit on ${stage} rejects an older successful supplied run`, async t => {
  const history = await mkdtemp(path.join(tmpdir(), 'zero-packaged-history-'));
  t.after(() => rm(history, {recursive: true, force: true}));
  const emptyConfig = path.join(history, 'fixture.gitconfig'), emptyHooks = path.join(history, 'fixture-hooks');
  await writeFile(emptyConfig, '');
  await mkdir(emptyHooks);
  const git = args => exec('git', args, {cwd: history, env: {...process.env, GIT_CONFIG_GLOBAL: emptyConfig, GIT_CONFIG_SYSTEM: emptyConfig, GIT_CONFIG_NOSYSTEM: '1'}});
  await git(['init', '--initial-branch=main']);
  await mkdir(path.dirname(path.join(history, source)), {recursive: true});
  await writeFile(path.join(history, source), original);
  await git(['add', '--', source]);
  const commit = () => git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', `core.hooksPath=${emptyHooks}`, '-c', 'commit.gpgsign=false', 'commit', '-m', 'Disposable packaged-source fixture']);
  await commit();
  const before = (await git(['rev-parse', 'HEAD'])).stdout.trim();
  await writeFile(path.join(history, source), updated);
  await git(['add', '--', source]);
  await commit();
  const after = (await git(['rev-parse', 'HEAD'])).stdout.trim();
  assert.equal((await git(['diff', '--name-only', before, after])).stdout.trim(), source);
  let fetched = false;
  const f = await fixture(t, {existing: true, published: stage === 'latest main', sourceSha: before, mainSha: stage === 'selected main' ? after : before,
    intercept: async (command, args, options, environment) => {
      if (command !== 'git') return;
      if (args[0] === 'clone' && stage === 'selected main') {
        await cp(environment.template, args.at(-1), {recursive: true});
        await writeFile(path.join(args.at(-1), source), await readFile(path.join(history, source)));
        return '';
      }
      if (args[0] === 'fetch' && args[2] === 'main') {
        fetched = true;
        await writeFile(path.join(options.cwd, source), await readFile(path.join(history, source)));
        return '';
      }
      if (args[0] === 'rev-parse' && args[1] === 'origin/main' && fetched) return after;
      if (args[0] === 'merge-base' || (args[0] === 'diff' && args.includes('--'))) return (await git(args)).stdout;
    }});
  await assert.rejects(publishZero({version, runId}, f.dependencies), stage === 'selected main' ? /Packaged source changed since preparation/ : /Packaged source changed on latest main/);
  const comparisons = f.calls.filter(call => call.command === 'git' && call.args[0] === 'diff' && call.args.includes('--'));
  assert.equal(comparisons.at(-1).args[2], before);
  assert.equal(comparisons.at(-1).args[3], after);
  assert.ok(!f.calls.some(call => call.args[0] === 'push' || call.args[0] === 'pr'));
  if (stage === 'selected main') assert.ok(!f.calls.some(call => call.args[0] === 'release' || call.args.includes('PATCH')));
  else {
    assert.equal(f.release.draft, false, 'The existing verified publication remains intact');
    assert.ok(!f.calls.some(call => call.args[0] === 'release' || call.args.includes('PATCH')), 'Existing assets are never republished or replaced');
  }
});

test('actual corrupt live kit times out after successful publication and metadata merge', async t => {
  const f = await fixture(t, {corruptLive: true});
  await assert.rejects(publishZero({version}, f.dependencies), /Live verification timed out.*SHA256 drift/);
  assert.equal(f.pr.state, 'MERGED');
  assert.equal(f.release.draft, false);
});

test('gating cannot accept green unrelated workflow, wrong head, skipped or missing checks', () => {
  const run = {headSha: head, event: 'pull_request', workflowName: 'Release checks and preparation', status: 'completed', conclusion: 'success'};
  const pr = {headRefOid: head, baseRefName: 'main', statusCheckRollup: [{status: 'COMPLETED', conclusion: 'SUCCESS'}], mergeStateStatus: 'CLEAN'};
  assert.equal(verifyChecks(pr, [run], head), true);
  assert.equal(verifyChecks(pr, [{...run, workflowName: 'unrelated'}], head), false);
  assert.equal(verifyChecks(pr, [{...run, headSha: sha}], head), false);
  assert.equal(verifyChecks({...pr, statusCheckRollup: []}, [run], head), false);
  assert.throws(() => verifyChecks({...pr, statusCheckRollup: [{status: 'COMPLETED', conclusion: 'SKIPPED'}]}, [run], head), /did not succeed/);
  assert.throws(() => verifyPreparation({...run, event: 'push'}, version, head), /manual workflow/);
});


test('README kit promotion preserves the independent Mac installer link and instructions', () => {
  const mac = '[Download for Mac with Apple Silicon — setup 0.5.7](https://github.com/codepetca/zero/releases/download/setup-v0.5.7/Zero-Setup-0.5.7-macos.dmg)';
  const kit = '[Download for Windows — complete kit ZIP 0.5.3](https://github.com/codepetca/zero/releases/download/v0.5.3/zero-bootstrap.zip)';
  const before = `# Zero\n- ${mac}\n- ${kit}; follow START-HERE.md.\nOther source stays.\n`;
  const url = 'https://github.com/codepetca/zero/releases/download/v0.5.8/zero-bootstrap.zip';
  const after = promoteReadme(before, '0.5.8', url);
  assert.equal(after, before.replace(kit, `[Download for Windows — complete kit ZIP 0.5.8](${url})`));
  assert.equal(promoteReadme(after, '0.5.8', url), after);
  assert.throws(() => promoteReadme(mac, '0.5.8', url), /exactly one Windows complete-kit link/);
  assert.throws(() => promoteReadme(`${before}\n${kit}`, '0.5.8', url), /exactly one Windows complete-kit link/);
});
