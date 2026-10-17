import test, {after, before} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, mkdirSync, rmSync, statSync, symlinkSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {REGISTRY_BRANCH} from '../github-registry.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const workflow = readFileSync(join(root, '.github/workflows/sharing-games.yml'), 'utf8');
const steps = workflow.split(/^      - /m).slice(1);
function namedStep(name) {
  const step = steps.find(value => value.startsWith(`name: ${name}\n`));
  assert.ok(step, `Missing workflow step: ${name}`);
  return step;
}
function runBody(step) {
  const run = step.match(/^        run: \|\n([\s\S]*)$/m)?.[1];
  assert.ok(run, 'Expected a trusted inline run block');
  return run.split('\n').map(line => line.replace(/^          /, '')).join('\n');
}
const selectStep = namedStep('Select the reviewed publisher source before checkout');
const validateStep = namedStep('Validate operator configuration against this exact source revision');
const selectScript = runBody(selectStep), validateScript = runBody(validateStep);
let checkout, checkoutTemp, sourceA, metadataB;
function git(args, cwd = root) {
  const result = spawnSync('git', args, {cwd, encoding:'utf8'});
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
before(() => {
  sourceA = git(['rev-parse', 'HEAD']);
  checkoutTemp = mkdtempSync(join(tmpdir(), 'zero-sharing-checkout-'));
  checkout = join(checkoutTemp, 'source');
  // All history needed by this fixture belongs to this disposable local clone.
  // CI may supply only HEAD; never require a parent commit from the project.
  git(['clone', '--quiet', '--shared', '--no-checkout', root, checkout]);
  git(['checkout', '--quiet', '--detach', sourceA], checkout);
  const metadataFile = '.zero-sharing-workflow-metadata';
  writeFileSync(join(checkout, metadataFile), 'Disposable metadata update; publisher source unchanged.\n');
  git(['add', '--', metadataFile], checkout);
  git(['-c', 'user.name=Zero workflow fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null',
    'commit', '--quiet', '--no-verify', '-m', 'Disposable workflow metadata fixture'], checkout);
  metadataB = git(['rev-parse', 'HEAD'], checkout);
  assert.notEqual(sourceA, metadataB);
  assert.equal(git(['diff', '--name-only', sourceA, metadataB], checkout), metadataFile);
  git(['checkout', '--quiet', '--detach', sourceA], checkout);
  // Reuse installed pinned JS dependencies without installation or SDK calls.
  symlinkSync(join(root, 'node_modules'), join(checkout, 'node_modules'), 'dir');
});
after(() => {
  if (checkoutTemp) rmSync(checkoutTemp, {recursive:true, force:true});
});
function config(overrides = {}) {
  return {schema:1, repository:'codepetca/zero', registryBranch:REGISTRY_BRANCH,
    artifactOrigin:'https://fixture.public.blob.vercel-storage.com',
    policyRevision:sourceA, gamePublicationEnabled:true, ...overrides};
}
function fixture(t) {
  const temporary = mkdtempSync(join(tmpdir(), 'zero-sharing-workflow-'));
  t.after(() => rmSync(temporary, {recursive:true, force:true}));
  const output = join(temporary, 'outputs');
  writeFileSync(output, '');
  return {temporary, output, configFile:join(temporary, 'zero-sharing-config.json')};
}
function run(script, files, {configuration = config(), omitConfiguration = false, selected = sourceA, cwd = checkout, extraEnvironment = {}} = {}) {
  const environment = {PATH:`${dirname(process.execPath)}:${process.env.PATH}`,
    RUNNER_TEMP:files.temporary, GITHUB_OUTPUT:files.output,
    ZERO_TRUSTED_SOURCE_SHA:selected, GITHUB_WORKFLOW_SHA:metadataB, GITHUB_SHA:metadataB,
    // Untrusted issue/branch data must not select the checkout.
    GITHUB_HEAD_REF:'student-branch', GITHUB_EVENT_PATH:join(files.temporary, 'untrusted-event.json'), ...extraEnvironment};
  if (!omitConfiguration) environment.ZERO_SHARING_CONFIG = typeof configuration === 'string' ? configuration : JSON.stringify(configuration);
  return spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script],
    {cwd, env:environment, encoding:'utf8'});
}

test('workflow keeps source selection before checkout and credentials after checkout validation', () => {
  const checkoutIndex = steps.findIndex(step => step.startsWith('uses: actions/checkout@'));
  const selectIndex = steps.indexOf(selectStep), validateIndex = steps.indexOf(validateStep);
  const credentialsIndex = steps.findIndex(step => step.includes('ZERO_BLOB_TOKEN:'));
  assert.ok(selectIndex < checkoutIndex && checkoutIndex < validateIndex && validateIndex < credentialsIndex);
  assert.match(selectStep, /^        id: source$/m);
  assert.match(selectStep, /^          ZERO_SHARING_CONFIG: \$\{\{ vars.ZERO_SHARING_CONFIG \}\}$/m);
  assert.match(steps[checkoutIndex], /^          ref: \$\{\{ steps.source.outputs.source_sha \}\}$/m);
  assert.match(steps[checkoutIndex], /^          persist-credentials: false$/m);
  assert.match(validateStep, /^          ZERO_TRUSTED_SOURCE_SHA: \$\{\{ steps.source.outputs.source_sha \}\}$/m);
  assert.ok(steps.slice(0, credentialsIndex).every(step => !step.includes('secrets.') && !step.includes('github.token')));
  assert.match(workflow, /if: vars.ZERO_SHARING_GAME_PUBLICATION_ENABLED == 'true'/);
});

test('trusted inline preflight accepts the selected source despite a different workflow head', t => {
  const files = fixture(t);
  const result = run(selectScript, files, {cwd:files.temporary});
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(files.output, 'utf8'), `source_sha=${sourceA}\n`);
  assert.equal(existsSync(files.configFile), false);
});

test('trusted inline preflight rejects malformed or unenabled config without checkout output', t => {
  const cases = ['{', '', 'null', '{}', config({policyRevision:'main'}),
    config({policyRevision:'refs/heads/main'}), config({policyRevision:'g'.repeat(40)}),
    config({policyRevision:'a'.repeat(39)}), config({policyRevision:'a'.repeat(41)}),
    config({policyRevision:'A'.repeat(40)}), config({policyRevision:123}),
    config({policyRevision:`${sourceA}\nsource_sha=refs/heads/main`}),
    config({policyRevision:'$(touch injected)'}), config({gamePublicationEnabled:false}),
    config({gamePublicationEnabled:'true'})];
  const missingFlag = config(); delete missingFlag.gamePublicationEnabled; cases.push(missingFlag);
  const missingRevision = config(); delete missingRevision.policyRevision; cases.push(missingRevision);
  for (const configuration of cases) {
    const files = fixture(t);
    const result = run(selectScript, files, {configuration, cwd:files.temporary});
    assert.notEqual(result.status, 0, `Accepted ${JSON.stringify(configuration)}`);
    assert.equal(readFileSync(files.output, 'utf8'), '');
    assert.equal(existsSync(join(files.temporary, 'injected')), false);
  }
  const absent = fixture(t), result = run(selectScript, absent, {omitConfiguration:true, cwd:absent.temporary});
  assert.notEqual(result.status, 0);
  assert.equal(readFileSync(absent.output, 'utf8'), '');
});

test('trusted inline full validation seals config for the real pinned checkout, independent of workflow head', t => {
  const files = fixture(t);
  const result = run(validateScript, files);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(readFileSync(files.configFile, 'utf8')), config());
  assert.equal(statSync(files.configFile).mode & 0o777, 0o600);
  assert.equal(git(['rev-parse', 'HEAD'], checkout), sourceA);
});

test('trusted inline full validation rejects real checkout mismatch before preparing config', t => {
  const files = fixture(t);
  git(['checkout', '--quiet', '--detach', metadataB], checkout);
  try {
    assert.equal(git(['rev-parse', 'HEAD'], checkout), metadataB);
    const result = run(validateScript, files);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /checkout for the exact reviewed source/);
    assert.equal(existsSync(files.configFile), false);
  } finally {
    git(['checkout', '--quiet', '--detach', sourceA], checkout);
  }
});

test('trusted inline full validation preserves platform schema and destination constraints', t => {
  const missingFlag = config(); delete missingFlag.gamePublicationEnabled;
  const cases = [{configuration:'{'}, {configuration:config({schema:2})},
    {configuration:config({repository:'student/zero'})},
    {configuration:config({registryBranch:'main'})},
    {configuration:config({artifactOrigin:'https://attacker.example'})},
    {configuration:config({artifactOrigin:'https://fixture.public.blob.vercel-storage.com/path'})},
    {configuration:config({extra:true})}, {configuration:missingFlag},
    {configuration:config({gamePublicationEnabled:false})},
    {configuration:config({policyRevision:metadataB})}, {selected:metadataB},
    {selected:'refs/heads/main'}, {selected:''}];
  for (const options of cases) {
    const files = fixture(t), result = run(validateScript, files, options);
    assert.notEqual(result.status, 0, `Accepted ${JSON.stringify(options)}`);
    assert.equal(existsSync(files.configFile), false);
  }
});

const operationStep = namedStep('Validate the requested operator action');
const operationScript = runBody(operationStep);
const executeStep = namedStep('Execute the validated publisher action');
const executeScript = runBody(executeStep);
const releaseKey = 'game/game-r1417021749-hello-game/0.1.0';
function operation(t, extraEnvironment = {}) {
  const files = fixture(t);
  return {files, result:run(operationScript,files,{cwd:files.temporary,extraEnvironment:{
    ZERO_EVENT_NAME:'workflow_dispatch', GITHUB_REF:'refs/heads/main',
    ZERO_REQUESTED_OPERATION:'withdraw', ZERO_REQUESTED_RELEASE:releaseKey, ...extraEnvironment}})};
}
test('operator action validation precedes checkout and publisher credentials', () => {
  assert.ok(steps.indexOf(operationStep) < steps.indexOf(selectStep));
  assert.match(operationStep,/ZERO_REQUESTED_OPERATION: \$\{\{ inputs.operation \}\}/);
  assert.match(executeStep,/ZERO_OPERATOR_ACTION: \$\{\{ steps.operation.outputs.operation \}\}/);
  assert.match(executeStep,/ZERO_OPERATOR_RELEASE: \$\{\{ steps.operation.outputs.release \}\}/);
  assert.doesNotMatch(executeScript,/\$\{\{/);
});
test('scheduled, issue and ordinary manual runs retain reconciliation', t => {
  for (const event of ['schedule','issues','workflow_dispatch']) {
    const {files,result}=operation(t,{ZERO_EVENT_NAME:event,ZERO_REQUESTED_OPERATION:'',ZERO_REQUESTED_RELEASE:''});
    assert.equal(result.status,0,result.stderr);
    assert.equal(readFileSync(files.output,'utf8'),'operation=reconcile\nrelease=\n');
  }
});
test('manual main withdrawal accepts exactly one complete game release key', t => {
  const {files,result}=operation(t);
  assert.equal(result.status,0,result.stderr);
  assert.equal(readFileSync(files.output,'utf8'),`operation=withdraw\nrelease=${releaseKey}\n`);
});
test('invalid operations, event sources, refs and release injection fail before action output', t => {
  for (const changes of [
    {ZERO_EVENT_NAME:'issues'}, {ZERO_EVENT_NAME:'schedule'}, {GITHUB_REF:'refs/heads/student'},
    {ZERO_REQUESTED_OPERATION:'restore'}, {ZERO_REQUESTED_OPERATION:'withdraw; echo injected'},
    {ZERO_REQUESTED_OPERATION:'reconcile'}, {ZERO_REQUESTED_RELEASE:''},
    {ZERO_REQUESTED_RELEASE:'library/lib-r123-sample/0.1.0'},
    {ZERO_REQUESTED_RELEASE:'game/game-r123-sample'},
    {ZERO_REQUESTED_RELEASE:releaseKey+'\noperation=reconcile'},
    {ZERO_REQUESTED_RELEASE:releaseKey+',game/game-r123-sample/0.1.0'},
    {ZERO_REQUESTED_RELEASE:'$(touch injected)'}, {ZERO_REQUESTED_RELEASE:releaseKey+';touch injected'}
  ]) {
    const {files,result}=operation(t,changes);
    assert.notEqual(result.status,0,JSON.stringify(changes));
    assert.equal(readFileSync(files.output,'utf8'),'');
    assert.equal(existsSync(join(files.temporary,'injected')),false);
  }
});
test('validated actions invoke the existing CLI with literal arguments and propagate failure', t => {
  const files=fixture(t);mkdirSync(join(files.temporary,'sharing'));
  writeFileSync(join(files.temporary,'sharing/cli.mjs'),`import {writeFileSync} from 'node:fs';writeFileSync(process.env.RUNNER_TEMP+'/argv.json',JSON.stringify(process.argv.slice(2)));process.exit(Number(process.env.TEST_EXIT||0));`);
  for (const action of ['reconcile','withdraw']) {
    const result=run(executeScript,files,{cwd:files.temporary,extraEnvironment:{ZERO_OPERATOR_ACTION:action,ZERO_OPERATOR_RELEASE:releaseKey}});
    assert.equal(result.status,0,result.stderr);
    const expected=[action,'--config',files.configFile,'--execute','--role','publisher'];
    if(action==='withdraw')expected.push('--release',releaseKey);
    assert.deepEqual(JSON.parse(readFileSync(join(files.temporary,'argv.json'),'utf8')),expected);
  }
  const failed=run(executeScript,files,{cwd:files.temporary,extraEnvironment:{ZERO_OPERATOR_ACTION:'withdraw',ZERO_OPERATOR_RELEASE:releaseKey,TEST_EXIT:'7'}});
  assert.equal(failed.status,7);
});
