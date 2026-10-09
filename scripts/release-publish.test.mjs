import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm, cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {zipSync} from 'fflate';
import {publishZero, parseArguments, promoteDefinition, verifyChecks, verifyPreparation} from './release-publish.mjs';

const sha = 'a'.repeat(40), head = 'b'.repeat(40), mergedSha = 'c'.repeat(40);
const version = '1.2.3', runId = '123', uuid = 'fixture-request';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const keys = ['kit', 'starter', 'extension'];
const filenames = ['zero-bootstrap.zip', 'zero-starter.zip', `zero-${version}.vsix`];

async function fixture(t, changes = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'zero-publisher-test-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const template = path.join(root, 'template');
  await mkdir(path.join(template, 'release'), {recursive: true});
  await mkdir(path.join(template, 'extension/src'), {recursive: true});
  await mkdir(path.join(template, 'framework'), {recursive: true});
  await mkdir(path.join(template, 'component-workshop'), {recursive: true});
  const definition = {schema: 1, kitVersion: version, coreVersion: '0.1.1', publication: {status: 'local', repository: 'codepetca/zero', tag: `v${version}`},
    assets: {kit: {filename: filenames[0], label: 'Kit'}, starter: {filename: filenames[1], label: 'Starter'},
      extension: {filename: filenames[2], label: 'Extension'}, components: {filename: 'zero-components.zip', label: 'Components', publicationStatus: 'local'}}};
  const manifest = JSON.stringify({version, license: 'MIT'}), license = 'MIT License\nfixture notice\n', js = 'module.exports = 42;\n';
  await Promise.all(Object.entries({'release/kit.json': JSON.stringify(definition, null, 2) + '\n', 'extension/package.json': manifest,
    'extension/src/extension.js': js, LICENSE: license, 'framework/pom.xml': '<artifactId>zero-core</artifactId>\n  <version>0.1.1</version>',
    'component-workshop/pom.xml': '<artifactId>zero-core</artifactId><version>0.1.1</version>',
    'README.md': '# Zero\n[Download Zero 1.2.2](https://github.com/codepetca/zero/releases/download/v1.2.2/zero-bootstrap.zip)\nUnrelated source and learning changes stay.\n'})
    .map(([name, body]) => writeFile(path.join(template, name), body)));
  const bytes = [Buffer.from('reviewed kit bytes'), Buffer.from('reviewed starter bytes'), Buffer.from(zipSync({
    'extension/LICENSE.txt': Buffer.from(license), 'extension/src/extension.js': Buffer.from(js), 'extension/package.json': Buffer.from(manifest)}))];
  const receipt = {...definition, assets: Object.fromEntries(keys.map((key, i) => [key, {...definition.assets[key], size: bytes[i].length, sha256: digest(bytes[i])}]))};
  const release = {id: 7, tag_name: `v${version}`, target_commitish: sha, draft: true, prerelease: false,
    html_url: 'https://github.com/codepetca/zero/releases/tag/untagged-fixture123', assets: filenames.map((name, i) => ({
      id: i + 20, name, size: bytes[i].length, digest: `sha256:${digest(bytes[i])}`, state: 'uploaded',
      browser_download_url: `https://github.com/codepetca/zero/releases/download/untagged-fixture123/${name}`}))};
  const prepared = {databaseId: Number(runId), workflowName: 'Release checks and preparation', event: 'workflow_dispatch', headSha: sha,
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
    await writeFile(path.join(template, 'README.md'), `# Zero\n[Download Zero ${version}](${metadata.assets.kit.url})\n`);
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
      if (args[0] === 'rev-parse') return output(args[1] === 'HEAD' ? head : promoted ? mergedSha : sha);
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
            .replace('[Download Zero 1.2.2](https://github.com/codepetca/zero/releases/download/v1.2.2/zero-bootstrap.zip)', `[Download Zero ${version}](${promotedDefinition.assets.kit.url})`));
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
        if (endpoint === `git/ref/tags/v${version}`) return published ? output({object: {type: 'commit', sha}}) : notFound();
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
          await writeFile(path.join(destination, 'SOURCE.txt'), changes.sourceReceipt || `Repository: codepetca/zero\nCommit: ${sha}\nVersion: ${version}\nRun: ${runId}\n`);
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
            await writeFile(readmeFile, (await readFile(readmeFile, 'utf8')).replace('[Download Zero 1.2.2](https://github.com/codepetca/zero/releases/download/v1.2.2/zero-bootstrap.zip)', `[Download Zero ${version}](${metadata.assets.kit.url})`));
          }
          pr.state = 'MERGED'; promoted = true; return output('');
        }
      }
    }
    throw new Error(`Unexpected mocked transport: ${command} ${args.join(' ')}`);
  };
  const request = async url => {
    requests.push(url);
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

test('verify-only checks all public metadata/downloads and actual live anchor without mutations', async t => {
  const f = await fixture(t, {existing: true, published: true, promoted: true});
  assert.equal((await publishZero({version, verifyOnly: true}, f.dependencies)).phase, 'verified');
  assert.ok(!f.calls.some(call => call.command === 'gh' && ['workflow', 'release', 'pr'].includes(call.args[0])));
  assert.ok(!f.calls.some(call => call.args.includes('PATCH') || ['push', '-c', 'add', 'worktree'].includes(call.args[0])));
  assert.equal(f.requests.length, 5);
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
    if (command === 'git' && args[0] === 'diff' && args.includes('--')) return 'framework/src/main/java/zero/SimpleApp.java\n';
  }});
  await assert.rejects(publishZero({version, runId}, f.dependencies), /Packaged source changed/);
  assert.ok(!f.calls.some(call => call.args[0] === 'release' || call.args.includes('PATCH')));
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
