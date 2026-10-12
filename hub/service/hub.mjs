import {createHash, randomBytes, randomUUID, timingSafeEqual} from 'node:crypto';
import {sha256,createStorage} from './artifacts.mjs';
import {createPipeline} from './pipeline.mjs';
import {transaction as runTransaction,migrateDatabase} from './database.mjs';
import {scaffoldBundle} from './scaffold.mjs';
import {lockAdmission,admitReservation,admitSubmission} from './admission.mjs';
import {githubJson} from './oauth-client.mjs';
import {admitOAuthStart,admitSession} from './auth-admission.mjs';
import {artifactRoute} from './artifact-route.mjs';
import {catalogPage,canonicalHubQuery} from './catalog.mjs';
import {EXACT_ARTIFACT_SQL,RELEASE_ACTION_SQL,RELEASE_AVAILABLE_SQL,WITHDRAWN_MESSAGE} from './release-availability.mjs';

const BASE = '/api/hub';
const GROUP = 'ca.codepet.zero.library';
const COOKIE = 'zero_hub_session';
const STATE_COOKIE = 'zero_hub_oauth';
const MAX_BODY = 1024 * 1024;
const token = () => randomBytes(32).toString('hex');
const loopback = (host) => ['127.0.0.1','localhost','::1','[::1]','::ffff:127.0.0.1'].includes(host);
const equal = (left,right) => typeof left === 'string' && typeof right === 'string' && left.length === right.length && timingSafeEqual(Buffer.from(left),Buffer.from(right));
function problem(status,message) { return Object.assign(new Error(message),{status}); }
function identity(user) {
  const id = String(user?.id ?? '');
  if (!/^[1-9][0-9]{0,19}$/.test(id) || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(user?.login ?? '')) throw problem(400,'Invalid GitHub identity');
  return {id,login:user.login};
}
function attributedRelease(row) {
  const contributor=identity({id:row.contributor_id,login:row.contributor_login});
  return {...row.manifest,contributor:{githubId:contributor.id,login:contributor.login}};
}
function object(value,keys) { return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key)) && keys.every(key => Object.hasOwn(value,key)); }
function cookies(req) {
  const values = new Map();
  for (const item of (req.headers.cookie ?? '').split(';')) {
    const index = item.indexOf('=');
    if (index > 0) values.set(item.slice(0,index).trim(),item.slice(index+1).trim());
  }
  return values;
}
function safeError(error) { return error?.status ? error.message : 'The hub could not complete this operation'; }
function validationError(error) { return String(error?.message ?? 'Invalid source bundle').replace(/[\x00-\x1f\x7f]/g,' ').slice(0,512); }


export function createHub({pool,storageRoot,storage:storageAdapter,checker,origin,localIdentity,oauth,uploadsEnabled=true}) {
  if (typeof uploadsEnabled !== 'boolean') throw new Error('Uploads capability must be boolean');
  if (storageAdapter && (typeof storageAdapter.read !== 'function' || typeof storageAdapter.put !== 'function')) throw new Error('Storage adapter requires read and put');
  const publicOrigin = new URL(origin);
  if (publicOrigin.origin !== origin || !['http:','https:'].includes(publicOrigin.protocol) || publicOrigin.username || publicOrigin.password) throw new Error('Configure an exact HTTP(S) hub origin');
  if (!pool?.query || !pool?.connect || (!storageRoot && !storageAdapter) || !checker?.validateBundle || !checker?.sourceDigest || !checker?.checkSubmission || !checker?.expectedPom || typeof checker?.expectedPolicyDigest !== 'function') throw new Error('Hub database, storage and trusted checker configuration required');
  if (localIdentity && (!loopback(publicOrigin.hostname) || process.env.NODE_ENV === 'production')) throw new Error('Local identity is allowed only on an explicit loopback development origin');
  if (oauth && (!oauth.clientId || !oauth.clientSecret || publicOrigin.protocol !== 'https:')) throw new Error('OAuth requires credentials and an HTTPS origin');
  if (localIdentity && oauth) throw new Error('Choose either local identity or GitHub OAuth');
  const mode = localIdentity ? 'local' : 'production';
  const localUser = localIdentity ? identity(localIdentity) : null;
  const secure = publicOrigin.protocol === 'https:';
  let storagePromise;
  const storage = () => storagePromise ??= storageAdapter ? Promise.resolve(storageAdapter) : createStorage(storageRoot);
  let timer;
  let running = false;
  let active;

  const transaction=action=>runTransaction(pool,action);
  async function migrate() { await migrateDatabase(pool); await storage(); }
  async function rememberUser(client,user) {
    const actor = identity(user);
    await client.query('INSERT INTO hub_users(github_id,login) VALUES($1,$2) ON CONFLICT(github_id) DO UPDATE SET login=$2,updated_at=now()',[actor.id,actor.login]);
    return actor;
  }
  async function reserveLibrary(user,input) {
    if (!uploadsEnabled) throw problem(503,'Uploads are not available in this staging service');
    if (!object(input,['className','title']) || !/^[A-Z][A-Za-z0-9]{0,63}$/.test(input.className) || ['Application','Node','Main','BehaviorCheck','Label','String','Platform','Scene','StackPane','Stage','Exception','CountDownLatch','AtomicReference','Throwable','AssertionError'].includes(input.className) || typeof input.title !== 'string' || input.title.length < 1 || input.title.length > 120 || /[\x00-\x1f\x7f<>]/.test(input.title)) throw problem(400,'Provide a readable title and Java class name');
    const actor=identity(user);
    return transaction(async client => {
      await lockAdmission(client);
      await admitReservation(client,actor.id);
      await rememberUser(client,actor);
      const {rows:[number]} = await client.query("SELECT nextval('hub_library_number')::text AS n");
      const libraryId = 'ui' + BigInt(number.n).toString(36);
      await client.query('INSERT INTO hub_libraries(id,owner_id) VALUES($1,$2)',[libraryId,actor.id]);
      const bundle = scaffoldBundle({libraryId,...input,login:actor.login});
      checker.validateBundle(bundle);
      return {libraryId,namespace:`zero.${libraryId}`,coordinate:{groupId:GROUP,artifactId:libraryId,version:bundle.descriptor.version},bundle};
    });
  }
  async function submit(user,bundle) {
    if (!uploadsEnabled) throw problem(503,'Uploads are not available in this staging service');
    const actor = identity(user);
    if (Buffer.byteLength(JSON.stringify(bundle)) > MAX_BODY) throw problem(413,'Submission exceeds 1 MiB');
    try { checker.validateBundle(bundle); } catch (error) { throw problem(400,validationError(error)); }
    // Snapshot before awaiting DB operations: callers cannot mutate checked input.
    const snapshot = JSON.parse(JSON.stringify(bundle));
    const digest = checker.sourceDigest(snapshot);
    return transaction(async client => {
      await lockAdmission(client);
      const {rows:[library]} = await client.query('SELECT owner_id FROM hub_libraries WHERE id=$1 FOR UPDATE',[snapshot.descriptor.libraryId]);
      if (!library || library.owner_id !== actor.id) throw problem(403,'This library belongs to another GitHub identity');
      await rememberUser(client,actor);
      const {rows:[existing]} = await client.query("SELECT id,status,source_digest FROM hub_submissions WHERE library_id=$1 AND version=$2 ORDER BY (status <> 'failed') DESC, created_at DESC LIMIT 1",[snapshot.descriptor.libraryId,snapshot.descriptor.version]);
      if (existing?.source_digest === digest) return {id:existing.id,status:existing.status};
      if (existing && existing.status !== 'failed') throw problem(409,'This library version already has immutable source');
      await admitSubmission(client,actor.id,snapshot);
      const id = randomUUID();
      await client.query('INSERT INTO hub_submissions(id,library_id,owner_id,version,bundle,source_digest,status) VALUES($1,$2,$3,$4,$5,$6,\'queued\')',[id,snapshot.descriptor.libraryId,actor.id,snapshot.descriptor.version,snapshot,digest]);
      return {id,status:'queued'};
    });
  }
  async function getSubmission(user,id) {
    if (!uploadsEnabled) throw problem(503,'Uploads are not available in this staging service');
    const actor = identity(user);
    if (!/^[a-f0-9-]{36}$/.test(id)) throw problem(404,'Submission not found');
    const {rows:[row]} = await pool.query('SELECT s.id,s.status,s.owner_id,s.error,r.report,l.manifest,u.github_id AS contributor_id,u.login AS contributor_login FROM hub_submissions s JOIN hub_users u ON u.github_id=s.owner_id LEFT JOIN hub_results r ON r.submission_id=s.id LEFT JOIN hub_releases l ON l.submission_id=s.id WHERE s.id=$1',[id]);
    if (!row || row.owner_id !== actor.id) throw problem(404,'Submission not found');
    return {id:row.id,status:row.status,...(row.report ? {report:row.report}:{}),...(row.manifest ? {release:attributedRelease(row)}:{}),...(row.error ? {error:row.error}:{})};
  }
  async function catalog(params=new URLSearchParams()) {
    return {mode,capabilities:{uploads:uploadsEnabled},...await catalogPage(pool,params,attributedRelease)};
  }
  const {workOnce,publishOnce}=createPipeline({pool,storage,checker});
  async function drain({max=100}={}) {
    let operations=0;
    while (operations < max) {
      const checked = await workOnce();
      const published = await publishOnce();
      if (!checked && !published) break;
      operations++;
    }
    return operations;
  }
  function startWorkers({intervalMs=1000}={}) {
    if (timer) throw new Error('Hub workers already started');
    timer = setInterval(() => {
      if (running) return;
      running=true;
      active=drain({max:10}).catch(()=>{}).finally(()=>{running=false;});
    },intervalMs);
    timer.unref();
  }
  async function stop() { clearInterval(timer); timer=undefined; await active; }

  function setCookie(res,name,value,maxAge) {
    const previous=res.getHeader('Set-Cookie');
    const values=previous===undefined?[]:Array.isArray(previous)?previous:[previous];
    res.setHeader('Set-Cookie',[...values,`${name}=${value}; Path=${BASE}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure?'; Secure':''}`]);
  }
  async function openSession(req,res,user) {
    const sessionToken=token();
    const previous=cookies(req).get(COOKIE);
    const previousHash=/^[a-f0-9]{64}$/.test(previous??'')?sha256(previous):null;
    await transaction(async client => {
      const actor=identity(user);
      await admitSession(client,actor.id,previousHash);
      await rememberUser(client,actor);
      await client.query('INSERT INTO hub_sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval \'8 hours\')',[sha256(sessionToken),actor.id,token()]);
    });
    setCookie(res,COOKIE,sessionToken,8*3600);
  }
  async function session(req) {
    if (!uploadsEnabled) return null;
    if (!localUser && !oauth) return null;
    const sessionToken=cookies(req).get(COOKIE);
    if (!/^[a-f0-9]{64}$/.test(sessionToken??'')) return null;
    const {rows:[row]}=await pool.query('SELECT s.token_hash,s.csrf_token,u.github_id,u.login FROM hub_sessions s JOIN hub_users u ON u.github_id=s.user_id WHERE token_hash=$1 AND expires_at>now()',[sha256(sessionToken)]);
    return row?{user:{id:row.github_id,login:row.login},csrfToken:row.csrf_token,hash:row.token_hash}:null;
  }
  async function mutation(req) {
    const actor=await session(req);
    if (!actor) throw problem(401,'Sign in to GitHub first');
    if (req.headers.origin !== origin || !equal(req.headers['x-zero-csrf'],actor.csrfToken)) throw problem(403,'Session and same-origin CSRF validation required');
    return actor;
  }
  async function body(req) {
    if (!(req.headers['content-type']??'').match(/^application\/json(?:\s*;\s*charset=utf-8)?$/i) || req.headers['content-encoding']) throw problem(415,'Send uncompressed application/json');
    const declared=Number(req.headers['content-length']);
    if (declared > MAX_BODY) throw problem(413,'Submission exceeds 1 MiB');
    const parts=[]; let size=0;
    for await (const part of req) { size+=part.length; if (size>MAX_BODY) throw problem(413,'Submission exceeds 1 MiB'); parts.push(part); }
    try { return JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { throw problem(400,'Invalid JSON body'); }
  }
  function json(res,status,value,head=false) { const bytes=Buffer.from(JSON.stringify(value)); res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}); res.end(head?undefined:bytes); }
  async function oauthStart(req,res) {
    if (localUser) {
      await openSession(req,res,localUser); res.writeHead(302,{Location:'/hub/prepare','Cache-Control':'no-store'}); return res.end();
    }
    if (!oauth) throw problem(503,'GitHub authentication is not configured');
    const state=token(); const binding=token();
    await transaction(async client=>{
      await admitOAuthStart(client);
      await client.query('INSERT INTO hub_oauth_states(state_hash,binding_hash,expires_at) VALUES($1,$2,now()+interval \'10 minutes\')',[sha256(state),sha256(binding)]);
    });
    setCookie(res,STATE_COOKIE,binding,600);
    const target=new URL('https://github.com/login/oauth/authorize');
    target.searchParams.set('client_id',oauth.clientId); target.searchParams.set('redirect_uri',`${origin}${BASE}/auth/callback`); target.searchParams.set('state',state); target.searchParams.set('scope','read:user');
    target.searchParams.set('code_challenge',createHash('sha256').update(binding,'utf8').digest('base64url')); target.searchParams.set('code_challenge_method','S256');
    res.writeHead(302,{Location:target.href,'Cache-Control':'no-store'}); res.end();
  }
  async function oauthCallback(req,res,url) {
    if (!oauth || localUser) throw problem(503,'GitHub authentication is not configured');
    setCookie(res,STATE_COOKIE,'',0);
    const state=url.searchParams.get('state'); const code=url.searchParams.get('code'); const binding=cookies(req).get(STATE_COOKIE);
    if (!/^[a-f0-9]{64}$/.test(state??'') || !/^[a-f0-9]{64}$/.test(binding??'')) throw problem(403,'GitHub sign-in state is invalid');
    const {rowCount}=await pool.query('DELETE FROM hub_oauth_states WHERE state_hash=$1 AND binding_hash=$2 AND expires_at>now()',[sha256(state),sha256(binding)]);
    if (rowCount!==1) throw problem(403,'GitHub sign-in state expired or was already used');
    if (!code || code.length>512 || url.searchParams.has('error')) throw problem(403,'GitHub sign-in was cancelled or invalid');
    const transport=oauth.fetch??fetch;
    const credentials=await githubJson(transport,'https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({client_id:oauth.clientId,client_secret:oauth.clientSecret,code,code_verifier:binding,redirect_uri:`${origin}${BASE}/auth/callback`})},{maxBytes:16*1024});
    if (typeof credentials.access_token!=='string' || !credentials.access_token || credentials.access_token.length>2048 || /\s/.test(credentials.access_token) || typeof credentials.token_type!=='string' || credentials.token_type.toLowerCase()!=='bearer') throw problem(502,'GitHub sign-in failed');
    const user=await githubJson(transport,'https://api.github.com/user',{headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${credentials.access_token}`,'User-Agent':'Zero-Hub','X-GitHub-Api-Version':'2022-11-28'}},{maxBytes:64*1024});
    if (!Number.isSafeInteger(user.id) || user.id<1 || typeof user.login!=='string') throw problem(502,'GitHub identity verification failed');
    let actor;
    try {actor=identity(user);} catch {throw problem(502,'GitHub identity verification failed');}
    await openSession(req,res,actor);
    res.writeHead(302,{Location:'/hub/prepare','Cache-Control':'no-store'}); res.end();
  }
  async function serveArtifact(req,res,requestPath) {
    const route=artifactRoute(requestPath);
    if (!route) throw problem(404,'Artifact not found');
    const {rows:[row]}=await pool.query(EXACT_ARTIFACT_SQL,[route.libraryId,route.version]);
    if(row?.release_action==='withdrawn')throw problem(410,WITHDRAWN_MESSAGE);
    const artifact=route.kind==='preview'?row?.manifest?.preview:row?.manifest?.artifacts?.[route.kind];
    if (!artifact || requestPath!==artifact.path+(route.checksum?`.${route.checksum}`:'')) throw problem(404,'Artifact not found');
    const original = await (await storage()).read(artifact.sha256,artifact.size);
    const data = route.checksum ? Buffer.from(createHash(route.checksum).update(original).digest('hex') + '\n') : original;
    res.writeHead(200,{'Content-Type':route.checksum?'text/plain; charset=utf-8':route.kind==='preview'?'image/png':route.kind==='pom'?'application/xml; charset=utf-8':'application/java-archive','Content-Length':data.length,'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'});
    return res.end(req.method === 'HEAD' ? undefined : data);
  }
  async function handler(req,res) {
    try {
      if (localUser && !loopback(req.socket.remoteAddress)) throw problem(403,'Local developer identity is loopback-only');
      const url=new URL(req.url,origin);
      const route=url.pathname;
      if (!uploadsEnabled && (route.startsWith(`${BASE}/auth/`) || route===`${BASE}/logout` || route.startsWith(`${BASE}/submissions`) || (req.method==='POST' && route===`${BASE}/libraries`))) throw problem(503,'Uploads and authentication are not available in this staging service');
      if (req.method==='GET' && route===`${BASE}/session`) { const actor=await session(req); return json(res,200,{user:actor?.user??null,...(actor?{csrfToken:actor.csrfToken}:{}),mode,capabilities:{uploads:uploadsEnabled}}); }
      if (req.method==='GET' && route===`${BASE}/auth/start`) return await oauthStart(req,res);
      if (req.method==='GET' && route===`${BASE}/auth/callback`) return await oauthCallback(req,res,url);
      if (['GET','HEAD'].includes(req.method) && route===`${BASE}/catalog`) return json(res,200,await catalog(url.searchParams),req.method==='HEAD');
      if (['GET','HEAD'].includes(req.method) && (route.startsWith(`${BASE}/maven/`) || route.startsWith(`${BASE}/previews/`))) return await serveArtifact(req,res,route);
      const libraryMatch=route.match(/^\/api\/hub\/libraries\/(ui[1-9a-z][0-9a-z]*)$/);
      if (['GET','HEAD'].includes(req.method) && libraryMatch) {
        canonicalHubQuery(url,`libraries/${libraryMatch[1]}`);
        const version=url.searchParams.get('version');
        const {rows:[row]}=await pool.query(`SELECT r.manifest,${RELEASE_ACTION_SQL} AS release_action,u.github_id AS contributor_id,u.login AS contributor_login FROM hub_releases r JOIN hub_submissions s ON s.id=r.submission_id JOIN hub_users u ON u.github_id=s.owner_id WHERE r.library_id=$1 AND ($2::text IS NULL OR r.version=$2) AND ($2::text IS NOT NULL OR ${RELEASE_AVAILABLE_SQL}) ORDER BY string_to_array(r.version,'.')::int[] DESC LIMIT 1`,[libraryMatch[1],version]);
        if(row?.release_action==='withdrawn')throw problem(410,WITHDRAWN_MESSAGE);
        if (!row) throw problem(404,'Library release not found'); return json(res,200,attributedRelease(row),req.method==='HEAD');
      }
      const submissionMatch=route.match(/^\/api\/hub\/submissions\/([a-f0-9-]{36})$/);
      if (req.method==='GET' && submissionMatch) { const actor=await session(req); if (!actor) throw problem(401,'Sign in to GitHub first'); return json(res,200,await getSubmission(actor.user,submissionMatch[1])); }
      if (req.method==='POST' && [`${BASE}/logout`,`${BASE}/libraries`,`${BASE}/submissions`].includes(route)) {
        const actor=await mutation(req);
        if (route===`${BASE}/logout`) { await pool.query('DELETE FROM hub_sessions WHERE token_hash=$1',[actor.hash]); setCookie(res,COOKIE,'',0); return json(res,200,{user:null,mode}); }
        const input=await body(req);
        return json(res,route.endsWith('/libraries')?201:202,route.endsWith('/libraries')?await reserveLibrary(actor.user,input):await submit(actor.user,input));
      }
      throw problem(404,'Hub endpoint not found');
    } catch (error) { if (!res.headersSent) json(res,error.status??503,{error:safeError(error)},req.method==='HEAD'); else res.destroy(); }
  }
  return {handler,migrate,workOnce,publishOnce,drain,startWorkers,stop,reserveLibrary,submit,getSubmission,catalog};
}
