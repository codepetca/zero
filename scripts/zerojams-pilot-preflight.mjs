#!/usr/bin/env node
// Read-only operator evidence. Never import runtime/token code or load .env/key files.
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {jamDeploymentPolicy} from '../website/lib/jams-pilot-policy.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export const target = Object.freeze({projectId:'prj_b8dDCbuiF8uzVcXYMLghpWTAr4aA',
  teamId:'team_jKbtHZ7k3VeEdJKdqf2GOToE', scope:'stewarts-projects-cc2722c4',
  branch:'codex/zerojams-controlled-pilot', repository:'codepetca/zero',
  registryBranch:'zero-jams-pilot-registry', desktopAppId:'5367740'});
const names = ['ZERO_HUB_ORIGIN','ZERO_HUB_GITHUB_CLIENT_ID','ZERO_HUB_GITHUB_CLIENT_SECRET',
  'ZERO_HUB_GITHUB_SESSION_SECRET','ZERO_JAMS_ENABLED','ZERO_JAMS_PILOT_ENABLED',
  'ZERO_JAMS_MAINTAINER_IDS','ZERO_JAMS_APP_ID','ZERO_JAMS_INSTALLATION_ID','ZERO_JAMS_PRIVATE_KEY'];
const id = value => typeof value === 'string' && /^[1-9][0-9]{0,19}$/.test(value);
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
function origin(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password &&
    url.pathname === '/' && !url.search && !url.hash && value === url.origin ? url.origin : null; }
  catch { return null; }
}
function presence(env) {
  return Object.fromEntries(names.map(name => [name, env[name] === undefined ? 'absent' :
    typeof env[name] !== 'string' ? 'wrong-type' : env[name].length ? 'present' : 'empty']));
}
export async function commandRunner(command,args,{cwd} = {}) {
  try {
    const {stdout} = await promisify(execFile)(command,args,{cwd,encoding:'utf8',timeout:20_000,
      maxBuffer:1_048_576,windowsHide:true});
    return JSON.parse(stdout);
  } catch (error) {
    // Only GitHub's structured HTTP status is evidence of 404. Never infer it
    // from an exit code or diagnostic text (403 and unavailable remain unknown).
    if (command === 'gh' && args[0] === 'api') {
      try { if (JSON.parse(error.stdout).status === '404') return {httpStatus:404}; } catch {}
    }
    throw new Error('Read-only metadata unavailable');
  }
}

// Only fixed paths and validated public slugs reach the runner. Raw responses/errors
// stay inside this function, even when a CLI prints credentials in diagnostics.
export async function pilotPreflight({env = process.env, pilot, audit = false,
  projectDir = root, writerAppSlug, runner = commandRunner} = {}) {
  if (writerAppSlug !== undefined && !/^[a-z0-9][a-z0-9-]{0,99}$/.test(writerAppSlug))
    throw new Error('Invalid writer App slug');
  const checks = [];
  const check = (name, ok) => checks.push({name,status:ok ? 'pass' : 'blocked'});
  const policyShape = pilot?.schema === 1 && pilot.projectId === target.projectId &&
    pilot.branch === target.branch && pilot.registryBranch === target.registryBranch &&
    same(pilot.inviteIds,['35233916','4050555']) && same(pilot.maintainerIds,['4050555']) &&
    pilot.creatorId === '35233916' && same(pilot.limits,
      {events:2,participants:5,operations:200,safetyOperations:7,proposals:10,entryHistory:5});
  check('fixed-public-policy',policyShape);
  check('policy-enabled',pilot?.status === 'enabled');
  check('runtime-preview-policy',jamDeploymentPolicy(env,pilot)?.mode === 'pilot');
  check('preview-project-and-branch',env.VERCEL === '1' && env.VERCEL_ENV === 'preview' &&
    env.VERCEL_PROJECT_ID === target.projectId && env.VERCEL_GIT_COMMIT_REF === target.branch);
  check('fixed-origin-match',!!origin(pilot?.origin) && pilot.origin === env.ZERO_HUB_ORIGIN &&
    pilot.origin === `https://${env.VERCEL_BRANCH_URL}`);
  check('explicit-service-and-pilot-flags',env.ZERO_JAMS_ENABLED === '1' && env.ZERO_JAMS_PILOT_ENABLED === '1');
  check('numeric-writer-identifiers',id(env.ZERO_JAMS_APP_ID) && id(env.ZERO_JAMS_INSTALLATION_ID));
  check('separate-writer-app',id(env.ZERO_JAMS_APP_ID) && env.ZERO_JAMS_APP_ID !== target.desktopAppId);
  check('fixed-maintainer-role',env.ZERO_JAMS_MAINTAINER_IDS === '4050555');
  check('required-configuration-present',names.every(name => typeof env[name] === 'string' && env[name].length > 0));
  const report = {schema:1,mode:audit ? 'read-only-audit' : 'offline',target,
    localConfigurationReady:checks.every(item => item.status === 'pass'),ready:false,
    checks,environment:presence(env),audit:{},
    manualEvidenceRequired:['exact-oauth-callback-and-preview-only-secret-scope',
      'writer-private-key-validity-and-selected-repository-installation',
      'deployment-protection-preserved-without-bypass',
      'authorized-browser-and-live-flow-acceptance'],
    note:'Presence is not credential validity or live acceptance. No secrets or credentials are returned.'};
  if (!audit) return report;
  async function inspect(name,command,args,filter) {
    try { const data = await runner(command,args,{cwd:projectDir});
      const result = filter(data);
      report.audit[name] = result || {status:'unknown',reason:'unexpected-metadata'};
    } catch { report.audit[name] = {status:'unknown',reason:'unavailable-or-denied-no-credential-fallback'}; }
  }
  const gh = (path) => ['api',path,'--method','GET'];
  await inspect('desktopApp','gh',gh('/apps/codepet-zero'),data =>
    String(data?.id) === target.desktopAppId ? {status:'observed',broadDesktopApp:true,
      minimalWriter:false} : null);
  await inspect('repository','gh',gh(`/repos/${target.repository}`),data =>
    data?.full_name === target.repository && String(data.id) === '1409613370' && data.private === false ?
      {status:'pass',publicRecords:true} : null);
  await inspect('registryBranch','gh',gh(`/repos/${target.repository}/git/ref/heads/${target.registryBranch}`),data =>
    data?.ref === `refs/heads/${target.registryBranch}` && /^[a-f0-9]{40}$/.test(data.object?.sha || '') ?
      {status:'pass',exists:true} : null);
  await inspect('registryNamespace','gh',gh(`/repos/${target.repository}/contents/jams?ref=${target.registryBranch}`),data => {
    if (data?.httpStatus === 404) return report.audit.registryBranch?.exists === true ?
      {status:'pass',empty:true,records:0} : {status:'unknown',reason:'namespace-404-without-verified-branch'};
    if (!Array.isArray(data)) return null;
    const valid = data.length <= 2 && data.every(item => item?.type === 'file' &&
      /^jam-[1-9][0-9]{0,19}\.json$/.test(item.name || '') && item.path === `jams/${item.name}` &&
      /^[a-f0-9]{40}$/.test(item.sha || '')) && new Set(data.map(item => item.name)).size === data.length;
    return valid ? {status:'pass',empty:data.length === 0,records:data.length} :
      {status:'blocked',reason:'registry-namespace-invalid-or-over-capacity'};
  });
  await inspect('writerApp','gh',gh(`/apps/${writerAppSlug || 'codepet-zero'}`),data => {
    if (!writerAppSlug) return {status:'unknown',reason:'dedicated-writer-app-slug-required'};
    if (!id(env.ZERO_JAMS_APP_ID) || String(data?.id) !== env.ZERO_JAMS_APP_ID ||
      String(data.id) === target.desktopAppId) return {status:'blocked',reason:'writer-app-mismatch'};
    const permissions = data.permissions;
    const minimal = permissions?.contents === 'write' && permissions.metadata === 'read' &&
      Object.keys(permissions).every(key => ['contents','metadata'].includes(key));
    return {status:minimal ? 'pass' : 'blocked',minimalPermissions:minimal};
  });
  await inspect('writerInstallation','gh',gh('/user/installations'),data => {
    if (!Array.isArray(data?.installations) || !id(env.ZERO_JAMS_INSTALLATION_ID) || !id(env.ZERO_JAMS_APP_ID)) return null;
    const found = data.installations.find(item => String(item.id) === env.ZERO_JAMS_INSTALLATION_ID);
    if (!found) return {status:'unknown',reason:'not-visible-in-current-user-installations-page'};
    const ok = String(found.app_id) === env.ZERO_JAMS_APP_ID && String(found.app_id) !== target.desktopAppId &&
      found.account?.login === 'codepetca' && found.repository_selection === 'selected' && !found.suspended_at &&
      found.permissions?.contents === 'write' && found.permissions.metadata === 'read' &&
      Object.keys(found.permissions).every(key => ['contents','metadata'].includes(key));
    return {status:ok ? 'pass' : 'blocked',selectedRepositories:ok,
      repositoryAccess:'requires-separate-operator-verification'};
  });
  await inspect('vercelProject','vercel',['api',`/v9/projects/${target.projectId}`,'--method','GET',
    '--scope',target.scope,'--raw','--non-interactive'],data => {
    if (data?.id !== target.projectId || data.accountId !== target.teamId) return null;
    const expected = data.rootDirectory === 'website' && data.nodeVersion === '22.x' &&
      data.link?.productionBranch === 'main' && data.ssoProtection?.deploymentType === 'all_except_custom_domains';
    return {status:expected ? 'pass' : 'blocked',expectedProjectSettings:expected};
  });
  await inspect('vercelEnvironment','vercel',['env','ls','--cwd',resolve(projectDir),'--format','json',
    '--scope',target.scope,'--non-interactive'],data => {
    const items = Array.isArray(data) ? data : data?.envs;
    if (!Array.isArray(items)) return null;
    const allowed = items.filter(item => names.includes(item.key));
    // Values, unrelated variable names, CLI diagnostics and arbitrary branch names
    // are deliberately discarded; report only allowlisted presence and scope.
    return {status:'observed',variables:Object.fromEntries(names.map(name => [name,{
      production:allowed.some(item => item.key === name && (item.target || []).includes('production')),
      preview:allowed.some(item => item.key === name && (item.target || []).includes('preview')),
      pilotBranch:allowed.some(item => item.key === name && (item.target || []).includes('preview') &&
        item.gitBranch === target.branch),
      unscopedPreview:allowed.some(item => item.key === name && (item.target || []).includes('preview') && !item.gitBranch)
    }]))};
  });
  return report;
}

export const help = `ZeroJams pilot preflight (read-only; JSON; no .env/key loading)\n\n` +
  `node scripts/zerojams-pilot-preflight.mjs [--audit] [--project-dir PATH] [--writer-app-slug SLUG]\n` +
  `Default: offline public jams/pilot.json + allowlisted process-env presence/type checks.\n` +
  `--audit: explicit gh/vercel read-only GET metadata; existing login only; no fallback.\n` +
  `--project-dir: existing Vercel-linked directory, default repository root; never links it.\n` +
  `--writer-app-slug: public dedicated writer App slug to compare with configured ID.\n` +
  `--help: this help. Unknown/duplicate/missing flags are errors.\n` +
  `Exit 0: ready; 1: blocked/unverified (including manual live evidence); 2: usage/read failure.\n` +
  `This preparation tool cannot attest manual acceptance and never authorizes activation.\n`;
export async function main(args = process.argv.slice(2),{env = process.env,runner,read = readFile,
  write = value => process.stdout.write(value)} = {}) {
  try {
    const options = {env,runner}; const seen = new Set();
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (seen.has(arg)) throw new Error('duplicate');
      seen.add(arg);
      if (arg === '--help' && args.length === 1) { write(help); return 0; }
      if (arg === '--audit') options.audit = true;
      else if (arg === '--project-dir' || arg === '--writer-app-slug') {
        const value = args[++i]; if (!value || value.startsWith('-')) throw new Error('missing');
        options[arg === '--project-dir' ? 'projectDir' : 'writerAppSlug'] = value;
      } else throw new Error('unknown');
    }
    options.pilot = JSON.parse(await read(new URL('../jams/pilot.json',import.meta.url),'utf8'));
    const result = await pilotPreflight(options);
    write(`${JSON.stringify(result,null,2)}\n`); return result.ready ? 0 : 1;
  } catch { write(`${JSON.stringify({schema:1,ready:false,error:'Invalid arguments or unreadable public policy; use --help. No raw diagnostics emitted.'})}\n`); return 2; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  process.exitCode = await main();
