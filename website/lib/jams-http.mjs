import {jamDeploymentPolicy} from './jams-pilot-policy.mjs';
import {hubConfig, readSession, sameOrigin, equalSecret, githubUser, json} from './hub-github-auth.mjs';
import {createJamRuntime, jamServiceConfig} from './jams-runtime.mjs';
import {JamError} from '../../jams/service.mjs';

const actions = new Set(['approve','request-changes','reject','suspend','resume','cancel','withdraw-entry','join','leave','submit','withdraw']);
const actionKeys = new Set(['operationId','action','revision','reason','participantId','source','title','description','demoUrl','instructions']);
const proposalKeys = new Set(['operationId','repositoryUrl','commit']);
const publicCache = new Map();
const unavailable = () => json({configured:false,error:'ZeroJams participation is not available yet. You can still prepare and host your website.'},503);
const validId = value => typeof value === 'string' && /^jam-[1-9][0-9]{0,19}$/.test(value);

function failure(error) {
  if (error instanceof JamError && [400,401,403,404,409,413,429,503].includes(error.status))
    return json({error:error.message,configured:true}, error.status);
  return json({error:'ZeroJams could not confirm this request. Keep your details and retry with the same request.',configured:true},503);
}

function optionsFor(options) {
  const now = typeof options.now === 'function' ? options.now : () => options.now ?? Date.now();
  return {...options,env:options.env ?? process.env,fetchImpl:options.fetchImpl ?? fetch,now};
}

function enabled(options) {
  return options.env.ZERO_JAMS_ENABLED === '1' &&
    (options.service !== undefined || jamServiceConfig(options.env) !== null);
}

async function serviceFor(options, sourceToken) {
  return options.service ?? await createJamRuntime({...options,sourceToken});
}

async function bodyJson(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new JamError(400,'Enter the request details.');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const value = await reader.read();
      if (value.done) break;
      size += value.value.byteLength;
      if (size > 16_384) throw new JamError(413,'This request is too large. Shorten the project details.');
      chunks.push(value.value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new JamError(400,'Enter valid request details.'); }
}

export async function getJamsResponse(request, inputOptions = {}) {
  const options = optionsFor(inputOptions);
  if (!enabled(options)) return unavailable();
  // Only anonymous projections enter this process-local, bounded cache. Writes
  // always read the authoritative store and never consult this cache.
  const config = hubConfig(options.env);
  const session = config && readSession(request,config,options.now());
  const actor = session ? {id:session.id,login:session.login} : undefined;
  const policy=jamDeploymentPolicy(options.env);
  const canCache=!actor&&!options.service&&policy?.mode!=='pilot';
  const cacheKey = `list:${policy?.mode}:${policy?.origin}:${policy?.registryBranch}:${options.env.ZERO_JAMS_APP_ID}:${options.env.ZERO_JAMS_INSTALLATION_ID}`;
  const cached = canCache && publicCache.get(cacheKey);
  if (cached && cached.expiresAt > options.now()) return json(cached.result);
  try {
    const service = await serviceFor(options);
    const result = {configured:true,...await service.list(actor),checkedAt:new Date(options.now()).toISOString()};
    if (canCache) {
      if (publicCache.size >= 32) publicCache.delete(publicCache.keys().next().value);
      publicCache.set(cacheKey,{result,expiresAt:options.now()+30_000});
    }
    return json(result);
  } catch (error) { return failure(error); }
}

export async function getJamResponse(request, id, inputOptions = {}) {
  if (!validId(id)) return json({error:'Unknown jam.'},404);
  const options = optionsFor(inputOptions);
  if (!enabled(options)) return unavailable();
  try {
    const config = hubConfig(options.env);
    const session = config && readSession(request,config,options.now());
    const actor = session ? {id:session.id,login:session.login} : undefined;
    const policy=jamDeploymentPolicy(options.env);
    const canCache=!actor&&!options.service&&policy?.mode!=='pilot';
    const cacheKey = `event:${policy?.mode}:${policy?.origin}:${policy?.registryBranch}:${id}:${options.env.ZERO_JAMS_APP_ID}:${options.env.ZERO_JAMS_INSTALLATION_ID}`;
    const cached = canCache && publicCache.get(cacheKey);
    if (cached && cached.expiresAt > options.now()) return json(cached.result);
    const service = await serviceFor(options);
    const result = {configured:true,...await service.read(id,actor),checkedAt:new Date(options.now()).toISOString()};
    if (canCache) {
      if (publicCache.size >= 32) publicCache.delete(publicCache.keys().next().value);
      publicCache.set(cacheKey,{result,expiresAt:options.now()+15_000});
    }
    return json(result);
  } catch (error) { return failure(error); }
}

async function postResponse(request, id, proposal, inputOptions) {
  const options = optionsFor(inputOptions);
  if (!enabled(options)) return unavailable();
  if (!proposal && !validId(id)) return json({error:'Unknown jam.'},404);
  const config = hubConfig(options.env);
  if (!config) return json({error:'GitHub sign-in is unavailable.'},503);
  if (!sameOrigin(request,config)) return json({error:'Open this action on Zero to continue.'},403);
  const session = readSession(request,config,options.now());
  if (!session) return json({error:'Sign in to GitHub to continue.'},401);
  if (!equalSecret(request.headers.get('x-hub-csrf'),session.csrf))
    return json({error:'Your session changed. Reconnect GitHub and try again.'},403);
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') || ''))
    return json({error:'Expected JSON request details.'},415);
  try {
    const body = await bodyJson(request);
    const allowed = proposal ? proposalKeys : actionKeys;
    if (Object.keys(body).some(key => !allowed.has(key)) || !proposal && !actions.has(body.action))
      return json({error:'This jam request contains unsupported details.'},400);
    // Session identity is sealed, but an expired/revoked GitHub authorization
    // must not continue accepting official actions for the remaining cookie age.
    const user = await githubUser(session.token,options.fetchImpl);
    if (String(user.id) !== session.id || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(user.login || ''))
      return json({error:'Your GitHub account changed. Reconnect to continue.'},401);
    const actor = {id:session.id,login:user.login};
    const service = await serviceFor(options,session.token);
    const result = proposal ? await service.propose({...body,actor}) : await service.mutate({...body,id,actor});
    publicCache.clear();
    return json({configured:true,...result});
  } catch (error) { return failure(error); }
}

export const postJamProposalResponse = (request, options = {}) => postResponse(request,null,true,options);
export const postJamActionResponse = (request, id, options = {}) => postResponse(request,id,false,options);
