import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp, mkdir, readFile, rm} from 'node:fs/promises';
import {tmpdir, userInfo} from 'node:os';
import {join} from 'node:path';
import {Pool} from 'pg';
import {receiveProblemReport} from '../lib/problem-reports.mjs';
import {problemReportsConfig} from '../lib/problem-reports-config.mjs';
import {createProblemReportsStore, problemFingerprint} from '../lib/problem-reports-store.mjs';
import {createProblemReportsGithub, problemIssueBody, reportMarker} from '../lib/problem-reports-github.mjs';
import {createHubRequestDeadline} from '../lib/hub-request-deadline.mjs';
import {reconcileProblemReports, reconcileProblemReportsResponse} from '../lib/problem-reports-reconcile.mjs';

const exec = promisify(execFile);
const {privateKey} = generateKeyPairSync('rsa', {modulusLength:2048});
const env = {
  ZERO_REPORTS_ENABLED:'true', ZERO_REPORTS_ENVIRONMENT:'development',
  ZERO_REPORTS_DATABASE_URL:'postgresql://fixture:secret@localhost/reports',
  ZERO_REPORTS_GITHUB_APP_ID:'42', ZERO_REPORTS_GITHUB_INSTALLATION_ID:'43',
  ZERO_REPORTS_REPOSITORY:'example/private-reports', ZERO_REPORTS_REPOSITORY_ID:'44',
  ZERO_REPORTS_GITHUB_PRIVATE_KEY:privateKey.export({type:'pkcs8', format:'pem'})
};
const config = problemReportsConfig(env);
const base = () => ({schemaVersion:1, reportId:randomUUID(), occurredAt:'2026-11-18T12:00:00.000Z',
  source:'automatic', operation:'run-browser', stage:'checking', code:'ZERO_BUILDER_UNAVAILABLE', outcome:'failed',
  environment:{zeroVersion:'0.5.80', editorVersion:'1.105.0', os:'macos', osVersion:'15.0', architecture:'arm64',
    distribution:'development', javaVersion:'21', frameworkVersion:'0.5.80', browserBuilderVersion:'0.5.80'}, breadcrumbs:[]});
const request = (body, options = {}) => new Request('https://zero.example/api/problem-reports', {
  method:'POST', headers:{'Content-Type':'application/json', ...options.headers},
  body:typeof body === 'string' ? body : JSON.stringify(body), ...options
});
const repo = {id:44, private:true, full_name:config.repository, has_issues:true,
  url:'https://api.github.com/repos/'+config.repository, html_url:'https://github.com/'+config.repository};

function fakeGithub({privateRepo = true, ambiguous = false, redirect = false, oversized = false, badGrant = false,
  rejected = false, ambiguousPatch = false, createGate, publicOnVerify = false, wrongIssueUrl = false} = {}) {
  const issues = new Map();
  const calls = [];
  let next = 1, loseResponse = ambiguous, losePatchResponse = ambiguousPatch;
  const fetchImpl = async (url, options) => {
    const path = new URL(url).pathname, method = options.method;
    calls.push({path, method, options});
    assert.equal(options.redirect, 'manual');
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal);
    const json = (value, status = 200) => Response.json(value, {status});
    if (path === '/app/installations/43') return json({id:43, app_id:42, suspended_at:null, permissions:{issues:'write'}});
    if (path === '/app/installations/43/access_tokens') {
      assert.deepEqual(JSON.parse(options.body), {repository_ids:[44], permissions:{issues:'write', metadata:'read'}});
      return json({token:'ghs_fixture_token_value', expires_at:new Date(Date.now()+3600000).toISOString(),
        repository_selection:'selected', permissions:{issues:'write', metadata:'read', ...(badGrant ? {contents:'write'} : {})},
        repositories:[{...repo, private:privateRepo}]}, 201);
    }
    if (path === '/repositories/44') {
      if (redirect) return new Response(null, {status:302, headers:{Location:'https://github.com/other/public'}});
      return json({...repo, private:publicOnVerify ? false : privateRepo});
    }
    if (path === '/repos/'+config.repository+'/issues' && method === 'POST') {
      if (rejected) return json({message:'Private provider diagnostic'}, 403);
      const body = JSON.parse(options.body), number = next++;
      const issue = {id:100+number, number, ...body, repository_url:repo.url,
        url:repo.url+'/issues/'+number, html_url:(wrongIssueUrl ? 'https://github.com/other/public' : repo.html_url)+'/issues/'+number};
      if (createGate) await createGate; // Deliberately ignores AbortSignal like a late provider.
      issues.set(number, issue);
      if (loseResponse) { loseResponse = false; throw new Error('private provider error with secret issue URL'); }
      return json(issue, 201);
    }
    if (path === '/repos/'+config.repository+'/issues') {
      if (oversized) return new Response('x'.repeat(262145));
      return json([...issues.values()]);
    }
    const number = Number(path.split('/').at(-1));
    if (issues.has(number)) {
      const issue = issues.get(number);
      if (method === 'PATCH') {
        Object.assign(issue, JSON.parse(options.body));
        if (losePatchResponse) { losePatchResponse = false; throw Error('Ambiguous PATCH'); }
      }
      return json(issue);
    }
    throw Error('Unexpected fake call '+method+' '+path);
  };
  return {fetchImpl, issues, calls, creates:() => calls.filter(call => call.method === 'POST' && call.path.endsWith('/issues')).length};
}

test('reports are disabled until explicitly configured; production credentials never run in previews', () => {
  assert.ok(config);
  for (const patch of [{ZERO_REPORTS_ENABLED:'false'}, {ZERO_REPORTS_ENVIRONMENT:'preview'},
    {VERCEL_ENV:'preview'}, {VERCEL_ENV:'development'}, {CONTEXT:'deploy-preview'},
    {ZERO_REPORTS_GITHUB_APP_ID:'01'}, {ZERO_REPORTS_REPOSITORY_ID:'not-id'},
    {ZERO_REPORTS_GITHUB_PRIVATE_KEY:'invalid'}, {ZERO_REPORTS_DATABASE_URL:'https://user:secret@example.com/db'},
    {ZERO_REPORTS_DATABASE_URL:'postgresql://user:secret@example.com/db?sslmode=disable'},
    {ZERO_REPORTS_ENVIRONMENT:'production'}, {NODE_ENV:'production'}]) assert.equal(problemReportsConfig({...env,...patch}), null);
  assert.ok(problemReportsConfig({...env, ZERO_REPORTS_ENVIRONMENT:'production',
    ZERO_REPORTS_DATABASE_URL:'postgresql://fixture:secret@db.example/reports', VERCEL_ENV:'production', NODE_ENV:'production'}));
});

test('canonical automatic grouping excludes identity, time, breadcrumbs; manual reports retain distinct identity', () => {
  const first = base();
  const second = {...first, reportId:randomUUID(), occurredAt:'2026-11-18T13:00:00.000Z', outcome:'recovered',
    breadcrumbs:[{operation:'run-native', stage:'opening', outcome:'failed'}],
    environment:Object.fromEntries(Object.entries(first.environment).reverse())};
  assert.equal(problemFingerprint(first), problemFingerprint(second));
  assert.notEqual(problemFingerprint(first), problemFingerprint({...first, code:'ZERO_INTERNAL_TYPE_ERROR'}));
  assert.notEqual(problemFingerprint({...first, source:'manual', code:'MANUAL_REPORT'}),
    problemFingerprint({...second, source:'manual', code:'MANUAL_REPORT'}));
  assert.equal(problemFingerprint({...first, source:'manual', description:'A'}),
    problemFingerprint({...first, source:'manual', description:'B'}));
});

test('HTTP boundary rejects unknown fields, raw diagnostics, automatic student failures and bodies over 8192 bytes before storage', async () => {
  let opened = 0;
  const options = {env, storeFactory:() => ({open() { opened++; throw Error('unexpected'); }})};
  for (const body of [{...base(), email:'student@example.com'}, {...base(), token:'private'},
    {...base(), description:'unreviewed raw exception'}, {...base(), code:'STARTUP_FAILED'},
    {...base(), environment:{...base().environment, path:'/Users/private'}}]) {
    const response = await receiveProblemReport(request(body), options);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {status:'invalid'});
  }
  for (const req of [request('x'.repeat(8193)), request(base(), {headers:{'Content-Type':'application/json','content-length':'999999'}}),
    request(base(), {headers:{'Content-Type':'text/plain'}})]) assert.equal((await receiveProblemReport(req, options)).status, 400);
  assert.equal(opened, 0);
  const disabled = await receiveProblemReport(request(base()), {env:{}});
  assert.equal(disabled.status, 503);
  assert.deepEqual(await disabled.json(), {status:'disabled'});
});

test('slow bodies, cancelled callers and stalled providers respect response deadlines without provider leakage', async () => {
  const stream = new ReadableStream({start(controller) { controller.enqueue(new Uint8Array([123])); }});
  const slow = new Request('https://zero.example/api/problem-reports', {method:'POST', headers:{'Content-Type':'application/json'}, body:stream, duplex:'half'});
  const start = Date.now();
  assert.equal((await receiveProblemReport(slow, {env, responseBudgetMs:30})).status, 503);
  assert.ok(Date.now()-start < 500);
  const controller = new AbortController(); controller.abort();
  assert.equal((await receiveProblemReport(request(base(), {signal:controller.signal}), {env})).status, 503);
  const receipt = randomUUID();
  let closed = 0;
  const pending = await receiveProblemReport(request(base()), {env, providerBudgetMs:25,
    storeFactory:() => ({open:async () => ({accept:async () => ({receipt,fingerprint:'f'.repeat(64)}), close() { closed++; }})}),
    githubFactory:() => ({deliver:() => new Promise(() => {})})});
  assert.equal(pending.status, 202);
  assert.deepEqual(await pending.json(), {receipt,status:'pending'});
  assert.equal(closed, 1);
  const secret = await receiveProblemReport(request(base()), {env,
    storeFactory:() => ({open:async () => { throw Error('postgres://private-secret'); }})});
  assert.deepEqual(await secret.json(), {status:'unavailable'});
});

test('actual PostgreSQL preserves receipts, grouping, recovery, rate limits and ambiguous GitHub delivery across instances', {timeout:60000}, async t => {
  if (typeof process.getuid === 'function' && process.getuid() === 0) return t.skip('initdb cannot run as root');
  let bin;
  try { bin = (await exec('which', ['pg_ctl'])).stdout.trim().replace(/\/pg_ctl$/, ''); }
  catch { return t.skip('PostgreSQL tools unavailable'); }
  const root = await mkdtemp(join(tmpdir(), 'zero-problem-reports-'));
  const data = join(root,'data'), socket = join(root,'socket');
  await mkdir(socket);
  let started = false, pool;
  try {
    await exec(join(bin,'initdb'), ['-D',data,'-A','trust','-U',userInfo().username,'--no-sync'], {timeout:30000});
    await exec(join(bin,'pg_ctl'), ['-D',data,'-l',join(root,'log'),'-o',`-h '' -k ${socket} -p 55483`,'-w','start'], {timeout:15000});
    started = true;
    pool = new Pool({host:socket, port:55483, user:userInfo().username, database:'postgres', ssl:false, max:8});
    await pool.query(await readFile(new URL('../sql/problem-reports.sql', import.meta.url), 'utf8'));
    const stores = [createProblemReportsStore(pool,config), createProblemReportsStore(pool,config)];
    const freshHealth = await reconcileProblemReports({env,apply:false,storeFactory:() => stores[0]});
    assert.deepEqual(freshHealth,{status:'ok',delivered:0,pending:0,needsAttention:0,attempted:0});
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM zero_problem_destination')).rows[0].n,0,
      'read-only health never initializes the destination on a fresh schema');
    assert.equal((await reconcileProblemReports({env,apply:true,storeFactory:() => stores[1]})).status,'ok');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM zero_problem_destination')).rows[0].n,1,
      'explicit reconciliation initializes and verifies the fixed destination');
    const github = fakeGithub();
    const response = (report, alternate = false, client = github) => receiveProblemReport(request(report), {
      env, storeFactory:() => stores[Number(alternate)], githubFactory:cfg => createProblemReportsGithub(cfg, {fetchImpl:client.fetchImpl})
    });
    const report = base();
    const result = await Promise.all(Array.from({length:8}, (_, i) => response(report, i%2 === 1)));
    const receipts = await Promise.all(result.map(item => item.json()));
    assert.ok(receipts.every(item => item.receipt === receipts[0].receipt));
    assert.equal(github.creates(), 1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM zero_problem_reports')).rows[0].n, 1);
    assert.ok(receipts.every(item => Object.keys(item).sort().join() === 'receipt,status'));
    const recovered = {...report, outcome:'recovered'};
    assert.equal((await response(recovered)).status, 202);
    assert.equal((await response({...report, reportId:randomUUID()})).status, 202);
    assert.equal(github.creates(), 1);
    const issue = [...github.issues.values()][0];
    assert.match(issue.body, /Reports: 2; failures: 2; recovered reports: 1/);
    assert.match(issue.body, /untrusted diagnostic data/);
    assert.match(issue.body, /Occurred at: 2026-11-18T12:00:00.000Z/);
    assert.match(issue.body, /Bounded breadcrumbs/);
    assert.equal((await response({...report, code:'ZERO_INTERNAL_TYPE_ERROR'})).status, 400);

    const orphan = {...base(), outcome:'recovered', environment:{...base().environment, zeroVersion:'0.5.994'}};
    const budgetsBefore = (await pool.query('SELECT bucket,count FROM zero_problem_budgets ORDER BY bucket')).rows;
    assert.equal((await response(orphan,true)).status,400,'a recovery cannot create an occurrence without an accepted failure');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM zero_problem_reports WHERE report_id=$1',[orphan.reportId])).rows[0].n,0);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM zero_problem_groups WHERE fingerprint=$1',[problemFingerprint(orphan)])).rows[0].n,0);
    assert.deepEqual((await pool.query('SELECT bucket,count FROM zero_problem_budgets ORDER BY bucket')).rows,budgetsBefore,
      'orphan recovery rolls back admission and new-group budgets');
    assert.equal((await response({...report,outcome:'recovered',code:'ZERO_INTERNAL_TYPE_ERROR'},true)).status,400,
      'recovery cannot attach an existing report ID to another fingerprint');

    const unknown = fakeGithub({ambiguous:true});
    const uncertain = {...base(), code:'ZERO_INTERNAL_REFERENCE_ERROR'};
    assert.deepEqual(await (await response(uncertain,false,unknown)).json(), {
      receipt:(await pool.query('SELECT receipt FROM zero_problem_reports WHERE report_id=$1',[uncertain.reportId])).rows[0].receipt, status:'pending'});
    assert.equal(unknown.creates(), 1);
    assert.equal((await (await response(uncertain,true,unknown)).json()).status, 'delivered');
    assert.equal(unknown.creates(), 1, 'marker reconciliation binds an ambiguous issue rather than recreating');

    const disappeared = {...base(), code:'ZERO_INTERNAL_RANGE_ERROR'};
    const noVisibleResult = fakeGithub({ambiguous:true});
    await response(disappeared,false,noVisibleResult);
    noVisibleResult.issues.clear();
    assert.equal((await (await response(disappeared,true,noVisibleResult)).json()).status, 'pending');
    assert.equal(noVisibleResult.creates(), 1, 'absence during bounded reconciliation cannot authorize a second POST');

    let releaseCreate;
    const late = fakeGithub({createGate:new Promise(resolve => { releaseCreate = resolve; })});
    const lateReport = {...base(), environment:{...base().environment, zeroVersion:'0.5.997'}};
    const lateResponse = await receiveProblemReport(request(lateReport), {env, providerBudgetMs:80,
      storeFactory:() => stores[0], githubFactory:cfg => createProblemReportsGithub(cfg,{fetchImpl:late.fetchImpl})});
    assert.equal((await lateResponse.json()).status,'pending');
    assert.equal(late.creates(),1);
    assert.equal((await (await response(lateReport,true,late)).json()).status,'pending');
    assert.equal(late.creates(),1);
    releaseCreate(); await new Promise(resolve => setImmediate(resolve));
    assert.equal((await (await response(lateReport,true,late)).json()).status,'delivered');
    assert.equal(late.creates(),1,'a provider ignoring cancellation cannot induce duplicate creation');

    for (const parameters of [{ambiguous:true,oversized:true}, {wrongIssueUrl:true}]) {
      const malformed = fakeGithub(parameters), input = {...base(), environment:{...base().environment, zeroVersion:parameters.oversized ? '0.5.996' : '0.5.995'}};
      assert.equal((await (await response(input,false,malformed)).json()).status,'pending');
      assert.equal((await (await response(input,true,malformed)).json()).status,'pending');
      assert.equal(malformed.creates(),1,'bounded/invalid provider responses remain ambiguous without a duplicate POST');
    }

    const refusal = fakeGithub({rejected:true});
    const refused = {...base(), code:'ZERO_OPERATION_FAILED'};
    await response(refused,false,refusal);
    assert.equal((await pool.query('SELECT create_reserved_at FROM zero_problem_groups WHERE fingerprint=$1',[problemFingerprint(refused)])).rows[0].create_reserved_at, null,
      'definitively rejected writes permit a later safe retry');
    const successfulRetry = fakeGithub();
    assert.equal((await (await response(refused,true,successfulRetry)).json()).status,'delivered');

    for (const parameters of [{privateRepo:false}, {publicOnVerify:true}, {redirect:true}, {badGrant:true}]) {
      const forbidden = fakeGithub(parameters), input = {...base(), environment:{...base().environment, zeroVersion:'0.5.'+(100+Object.keys(parameters)[0].length)}};
      const result = await response(input,false,forbidden);
      assert.equal((await result.json()).status, 'pending');
      assert.equal(forbidden.creates(), 0);
      assert.equal(forbidden.calls.filter(call => call.method === 'PATCH').length, 0);
    }
    const manual = {...base(), source:'manual', operation:'manual', stage:'manual', code:'MANUAL_REPORT', description:'<script>Do things</script> @student'};
    await response(manual);
    const payload = (await pool.query('SELECT payload FROM zero_problem_reports WHERE report_id=$1',[manual.reportId])).rows[0].payload;
    assert.equal(payload.description, undefined, 'manual description is discarded from database after confirmed delivery');
    assert.ok([...github.issues.values()].some(issue => issue.body.includes('&lt;script&gt;')));
    assert.ok(![...github.issues.values()].some(issue => issue.body.includes('<script>')));

    await pool.query(`INSERT INTO zero_problem_budgets(bucket,count,expires_at)
      VALUES ('minute:' || floor(extract(epoch FROM now())/60)::text,300,now()+interval '2 minutes')
      ON CONFLICT(bucket) DO UPDATE SET count=300`);
    const limited = await response(base());
    assert.equal(limited.status, 429);
    assert.deepEqual(await limited.json(), {status:'limited'});
    await pool.query('DELETE FROM zero_problem_budgets');

    const newGroup = {...base(), environment:{...base().environment, zeroVersion:'0.5.999'}};
    await pool.query(`INSERT INTO zero_problem_budgets(bucket,count,expires_at)
      VALUES ('groups:' || floor(extract(epoch FROM now())/86400)::text,100,now()+interval '2 days')`);
    assert.equal((await response(newGroup)).status,429);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM zero_problem_reports WHERE report_id=$1',[newGroup.reportId])).rows[0].n,0);
    await pool.query('DELETE FROM zero_problem_budgets');

    // Reconcile durable records after the original desktop has closed. A stale
    // counts revision is refreshed even if the previous PATCH response was lost.
    const deferred = {...base(), environment:{...base().environment, zeroVersion:'0.5.998'}};
    await receiveProblemReport(request(deferred), {env, storeFactory:() => stores[0],
      githubFactory:() => ({deliver:async () => { throw Error('Unavailable before dispatch'); }})});
    const operatorGithub = fakeGithub({ambiguousPatch:true});
    const reconcile = apply => reconcileProblemReports({env,apply,limit:20,storeFactory:() => stores[1],
      githubFactory:cfg => createProblemReportsGithub(cfg,{fetchImpl:operatorGithub.fetchImpl})});
    const health = await reconcile(false);
    assert.equal(health.attempted,0);
    assert.ok(health.pending > 0);
    assert.ok(health.needsAttention > 0);
    await reconcile(true);
    const initialCreates = operatorGithub.creates();
    const delivery = (await pool.query('SELECT * FROM zero_problem_groups WHERE fingerprint=$1',[problemFingerprint(deferred)])).rows[0];
    assert.equal(delivery.delivered_revision, delivery.revision);
    // Add recovery while holding the delivery lock, emulating simultaneous
    // instances: acceptance commits, delivery waits for the operator retry.
    const ownerDeadline = createHubRequestDeadline({budgetMs:10000});
    const owner = await stores[0].open(ownerDeadline);
    await owner.lock(problemFingerprint(deferred));
    await response({...deferred,outcome:'recovered'},true,operatorGithub);
    owner.close(); ownerDeadline.dispose();
    await reconcile(true); // PATCH succeeds remotely then loses its response.
    await reconcile(true); // Idempotent refresh reads the same body and confirms.
    const confirmed = (await pool.query('SELECT * FROM zero_problem_groups WHERE fingerprint=$1',[problemFingerprint(deferred)])).rows[0];
    assert.equal(confirmed.delivered_revision,confirmed.revision);
    assert.equal(operatorGithub.creates(),initialCreates,'scheduled retries do not duplicate issue creation');

    const mismatch = await receiveProblemReport(request(base()), {env,
      storeFactory:() => createProblemReportsStore(pool,{...config,repositoryId:45})});
    assert.equal(mismatch.status,503,'database destination pin rejects reuse for another repository');

    // A request aborted while waiting on a database lock cannot later commit or
    // retain a checked-out connection after its response deadline.
    const blocker = await pool.connect();
    await blocker.query('BEGIN');
    await blocker.query("SELECT pg_advisory_xact_lock(hashtextextended('zero-problem-admission',0))");
    const stalled = base();
    const bounded = await receiveProblemReport(request(stalled), {env, responseBudgetMs:40, storeFactory:() => stores[0]});
    assert.equal(bounded.status, 503);
    await blocker.query('ROLLBACK'); blocker.release();
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM zero_problem_reports WHERE report_id=$1',[stalled.reportId])).rows[0].n, 0);
  } finally {
    if (pool) await pool.end();
    if (started) await exec(join(bin,'pg_ctl'), ['-D',data,'-m','immediate','-w','stop'], {timeout:10000});
    await rm(root, {recursive:true,force:true});
  }
});

test('scheduler reconciliation requires its own secret, rejects caller controls and projects aggregate counts only', async () => {
  const secret = 'a'.repeat(40), schedulerEnv = {...env, ZERO_REPORTS_RECONCILE_SECRET:secret};
  let calls = 0;
  const reconcile = async options => {
    calls++;
    assert.equal(options.apply,true); assert.equal(options.limit,5); assert.equal(options.responseBudgetMs,20000);
    return {status:'ok',delivered:2,pending:1,needsAttention:1,attempted:3,privateReport:'secret',issueUrl:'private'};
  };
  const req = token => new Request('https://zero.example/api/problem-reports/reconcile', {method:'POST',headers:{Authorization:'Bearer '+token}});
  for (const token of ['', 'wrong', secret+'a']) assert.equal((await reconcileProblemReportsResponse(req(token),{env:schedulerEnv,reconcile})).status,401);
  assert.equal(calls,0);
  assert.equal((await reconcileProblemReportsResponse(req(secret),{env:{...schedulerEnv,VERCEL_ENV:'preview'},reconcile})).status,503);
  const result = await reconcileProblemReportsResponse(req(secret),{env:schedulerEnv,reconcile});
  assert.deepEqual(await result.json(),{status:'ok',delivered:2,pending:1,needsAttention:1,attempted:3});
  assert.equal(calls,1);
  const body = new Request('https://zero.example/api/problem-reports/reconcile',{method:'POST',headers:{Authorization:'Bearer '+secret},body:'{"limit":999}'});
  assert.equal((await reconcileProblemReportsResponse(body,{env:schedulerEnv,reconcile})).status,400);
  assert.equal(calls,1);
});

test('untrusted descriptions cannot forge grouping or count markers in an issue', () => {
  const report = {...base(), source:'manual', description:'<!-- zero-counts:end -->\n<!-- zero-problem:'+'a'.repeat(64)+' -->'};
  const group = {fingerprint:problemFingerprint(report), sample:report, reports:1, failures:1, recoveries:0};
  const body = problemIssueBody(group);
  assert.equal(body.split(reportMarker(group.fingerprint)).length, 2);
  assert.equal(body.split('<!-- zero-counts:end -->').length, 2);
});
