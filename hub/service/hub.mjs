import {createHash, randomBytes, randomUUID, timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {POLICY, sha256, validateArtifacts, createStorage} from './artifacts.mjs';
import {scaffoldBundle} from './scaffold.mjs';
import {validReport} from './report.mjs';

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


export function createHub({pool,storageRoot,checker,origin,localIdentity,oauth}) {
  const publicOrigin = new URL(origin);
  if (publicOrigin.origin !== origin || !['http:','https:'].includes(publicOrigin.protocol) || publicOrigin.username || publicOrigin.password) throw new Error('Configure an exact HTTP(S) hub origin');
  if (!pool?.query || !pool?.connect || !storageRoot || !checker?.validateBundle || !checker?.sourceDigest || !checker?.checkSubmission || !checker?.expectedPom || typeof checker?.expectedPolicyDigest !== 'function') throw new Error('Hub database, storage and trusted checker configuration required');
  if (localIdentity && (!loopback(publicOrigin.hostname) || process.env.NODE_ENV === 'production')) throw new Error('Local identity is allowed only on an explicit loopback development origin');
  if (oauth && (!oauth.clientId || !oauth.clientSecret || publicOrigin.protocol !== 'https:')) throw new Error('OAuth requires credentials and an HTTPS origin');
  if (localIdentity && oauth) throw new Error('Choose either local identity or GitHub OAuth');
  const mode = localIdentity ? 'local' : 'production';
  const localUser = localIdentity ? identity(localIdentity) : null;
  const secure = publicOrigin.protocol === 'https:';
  let storagePromise;
  const storage = () => storagePromise ??= createStorage(storageRoot);
  let timer;
  let running = false;
  let active;

  async function transaction(action) {
    const client = await pool.connect();
    try { await client.query('BEGIN'); const result = await action(client); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async function migrate() {
    const sql = await readFile(new URL('../sql/001-hub.sql',import.meta.url),'utf8');
    await transaction(async client => { await client.query('SELECT pg_advisory_xact_lock(92104419)'); await client.query(sql); });
    await storage();
  }
  async function rememberUser(client,user) {
    const actor = identity(user);
    await client.query('INSERT INTO hub_users(github_id,login) VALUES($1,$2) ON CONFLICT(github_id) DO UPDATE SET login=$2,updated_at=now()',[actor.id,actor.login]);
    return actor;
  }
  async function reserveLibrary(user,input) {
    if (!object(input,['className','title']) || !/^[A-Z][A-Za-z0-9]{0,63}$/.test(input.className) || ['Application','Node','Main','BehaviorCheck','Label','String','Platform','Scene','StackPane','Stage','Exception','CountDownLatch','AtomicReference','Throwable','AssertionError'].includes(input.className) || typeof input.title !== 'string' || input.title.length < 1 || input.title.length > 120 || /[\x00-\x1f\x7f<>]/.test(input.title)) throw problem(400,'Provide a readable title and Java class name');
    return transaction(async client => {
      const actor = await rememberUser(client,user);
      const {rows:[number]} = await client.query("SELECT nextval('hub_library_number')::text AS n");
      const libraryId = 'ui' + BigInt(number.n).toString(36);
      await client.query('INSERT INTO hub_libraries(id,owner_id) VALUES($1,$2)',[libraryId,actor.id]);
      const bundle = scaffoldBundle({libraryId,...input,login:actor.login});
      checker.validateBundle(bundle);
      return {libraryId,namespace:`zero.${libraryId}`,coordinate:{groupId:GROUP,artifactId:libraryId,version:bundle.descriptor.version},bundle};
    });
  }
  async function submit(user,bundle) {
    const actor = identity(user);
    if (Buffer.byteLength(JSON.stringify(bundle)) > MAX_BODY) throw problem(413,'Submission exceeds 1 MiB');
    try { checker.validateBundle(bundle); } catch (error) { throw problem(400,validationError(error)); }
    // Snapshot before awaiting DB operations: callers cannot mutate checked input.
    const snapshot = JSON.parse(JSON.stringify(bundle));
    const digest = checker.sourceDigest(snapshot);
    return transaction(async client => {
      const {rows:[library]} = await client.query('SELECT owner_id FROM hub_libraries WHERE id=$1 FOR UPDATE',[snapshot.descriptor.libraryId]);
      if (!library || library.owner_id !== actor.id) throw problem(403,'This library belongs to another GitHub identity');
      await rememberUser(client,actor);
      const {rows:[existing]} = await client.query("SELECT id,status,source_digest FROM hub_submissions WHERE library_id=$1 AND version=$2 ORDER BY (status <> 'failed') DESC, created_at DESC LIMIT 1",[snapshot.descriptor.libraryId,snapshot.descriptor.version]);
      if (existing?.source_digest === digest) return {id:existing.id,status:existing.status};
      if (existing && existing.status !== 'failed') throw problem(409,'This library version already has immutable source');
      const id = randomUUID();
      await client.query('INSERT INTO hub_submissions(id,library_id,owner_id,version,bundle,source_digest,status) VALUES($1,$2,$3,$4,$5,$6,\'queued\')',[id,snapshot.descriptor.libraryId,actor.id,snapshot.descriptor.version,snapshot,digest]);
      return {id,status:'queued'};
    });
  }
  async function getSubmission(user,id) {
    const actor = identity(user);
    if (!/^[a-f0-9-]{36}$/.test(id)) throw problem(404,'Submission not found');
    const {rows:[row]} = await pool.query('SELECT s.id,s.status,s.owner_id,s.error,r.report,l.manifest,u.github_id AS contributor_id,u.login AS contributor_login FROM hub_submissions s JOIN hub_users u ON u.github_id=s.owner_id LEFT JOIN hub_results r ON r.submission_id=s.id LEFT JOIN hub_releases l ON l.submission_id=s.id WHERE s.id=$1',[id]);
    if (!row || row.owner_id !== actor.id) throw problem(404,'Submission not found');
    return {id:row.id,status:row.status,...(row.report ? {report:row.report}:{}),...(row.manifest ? {release:attributedRelease(row)}:{}),...(row.error ? {error:row.error}:{})};
  }
  async function catalog() {
    const {rows}=await pool.query('SELECT r.manifest,u.github_id AS contributor_id,u.login AS contributor_login FROM hub_releases r JOIN hub_submissions s ON s.id=r.submission_id JOIN hub_users u ON u.github_id=s.owner_id ORDER BY r.created_at DESC,r.library_id,r.version');
    return {mode,libraries:rows.map(attributedRelease)};
  }
  async function workOnce() {
    const job = await transaction(async client => {
      await client.query("UPDATE hub_submissions SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'queued' END,lease_token=NULL,lease_until=NULL,error='Checker interrupted; retry is bounded' WHERE status='checking' AND lease_until<now()");
      const {rows:[row]} = await client.query("SELECT * FROM hub_submissions WHERE status='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1");
      if (!row) return null;
      row.lease_token = randomUUID();
      await client.query("UPDATE hub_submissions SET status='checking',attempts=attempts+1,lease_token=$2,lease_until=now()+interval '10 minutes',error=NULL WHERE id=$1",[row.id,row.lease_token]);
      return row;
    });
    if (!job) return false;
    try {
      checker.validateBundle(job.bundle);
      if (checker.sourceDigest(job.bundle) !== job.source_digest) throw new Error('Immutable source digest mismatch');
      const result = await checker.checkSubmission(job.bundle);
      if (!validReport(result,job.source_digest,checker.expectedPolicyDigest())) throw new Error('Checker verdict does not match trusted policy/source');
      const artifacts = result.passed ? result.artifacts : null;
      const hashes = result.passed ? validateArtifacts(job.bundle,artifacts,checker.expectedPom) : null;
      const report = {passed:result.passed,policy:POLICY,policyDigest:result.policyDigest,sourceDigest:job.source_digest,checks:result.checks,platforms:result.platforms};
      await transaction(async client => {
        const {rows:[current]} = await client.query('SELECT status,lease_token,source_digest FROM hub_submissions WHERE id=$1 FOR UPDATE',[job.id]);
        if (current?.status !== 'checking' || current.lease_token !== job.lease_token || current.source_digest !== job.source_digest) return;
        await client.query('INSERT INTO hub_results(submission_id,source_digest,policy,passed,report,jar,sources,pom,artifact_hashes,policy_digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[job.id,job.source_digest,POLICY,result.passed,report,artifacts?.jar,artifacts?.sources,artifacts?.pom,hashes,result.policyDigest]);
        await client.query("UPDATE hub_submissions SET status=$2,lease_token=NULL,lease_until=NULL WHERE id=$1",[job.id,result.passed?'checked':'failed']);
      });
    } catch {
      await pool.query("UPDATE hub_submissions SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'queued' END,lease_token=NULL,lease_until=NULL,error='The trusted checker could not complete; bounded infrastructure retry' WHERE id=$1 AND status='checking' AND lease_token=$2",[job.id,job.lease_token]);
    }
    return true;
  }
  async function publishOnce() {
    return transaction(async client => {
      const {rows:[row]} = await client.query("SELECT s.*,l.owner_id AS reserved_owner,r.source_digest AS result_digest,r.policy,r.policy_digest,r.passed,r.report,r.jar,r.sources,r.pom,r.artifact_hashes FROM hub_submissions s JOIN hub_libraries l ON l.id=s.library_id JOIN hub_results r ON r.submission_id=s.id WHERE s.status='checked' ORDER BY s.created_at FOR UPDATE OF s SKIP LOCKED LIMIT 1");
      if (!row) return false;
      let manifest;
      let artifacts;
      try {
        checker.validateBundle(row.bundle);
        if (row.owner_id !== row.reserved_owner || row.library_id !== row.bundle.descriptor.libraryId || row.version !== row.bundle.descriptor.version || checker.sourceDigest(row.bundle) !== row.source_digest || row.result_digest !== row.source_digest || row.policy !== POLICY || !row.passed || row.policy_digest !== row.report.policyDigest || !validReport(row.report,row.source_digest,checker.expectedPolicyDigest()) || !row.report.passed) throw new Error('Internal verdict authority mismatch');
        artifacts = {jar:row.jar,sources:row.sources,pom:row.pom};
        const hashes = validateArtifacts(row.bundle,artifacts,checker.expectedPom);
        for (const [kind,hash] of Object.entries(hashes)) {
          if (hash.sha256 !== row.artifact_hashes?.[kind]?.sha256 || hash.size !== row.artifact_hashes?.[kind]?.size)
            throw new Error('Artifact digest drift');
        }
        const {libraryId,version,title,description,category,components} = row.bundle.descriptor;
        const directory = `${BASE}/maven/ca/codepet/zero/library/${libraryId}/${version}`;
        manifest = {libraryId,version,title,description,category,components,namespace:`zero.${libraryId}`,coordinate:{groupId:GROUP,artifactId:libraryId,version},sourceDigest:row.source_digest,checks:row.report.checks,platforms:row.report.platforms,artifacts:Object.fromEntries(Object.entries(hashes).map(([kind,hash])=>[kind,{...hash,path:`${directory}/${libraryId}-${version}${kind==='sources'?'-sources.jar':kind==='jar'?'.jar':'.pom'}`} ])),preview:{sha256:sha256(Buffer.from(row.bundle.files['preview.png'],'base64')),size:Buffer.from(row.bundle.files['preview.png'],'base64').length,path:`${BASE}/previews/${libraryId}/${version}.png`},api:row.bundle.files['API.md'],changelog:row.bundle.files['CHANGELOG.md'],status:'automatically-checked'};
      } catch {
        await client.query("UPDATE hub_submissions SET status='failed',error='Publication integrity validation failed' WHERE id=$1",[row.id]);
        return true;
      }
      // Only immutable bytes cross into storage; this stage never runs Java/config.
      const bytes = await storage();
      for (const artifact of Object.values(artifacts)) await bytes.put(artifact);
      await bytes.put(Buffer.from(row.bundle.files['preview.png'],'base64'));
      await client.query('INSERT INTO hub_releases(library_id,version,submission_id,manifest) VALUES($1,$2,$3,$4)',[row.library_id,row.version,row.id,manifest]);
      await client.query("UPDATE hub_submissions SET status='published',error=NULL WHERE id=$1",[row.id]);
      return true;
    });
  }
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
    res.setHeader('Set-Cookie',`${name}=${value}; Path=${BASE}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure?'; Secure':''}`);
  }
  async function openSession(res,user) {
    const sessionToken=token();
    await transaction(async client => {
      const actor=await rememberUser(client,user);
      await client.query('INSERT INTO hub_sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval \'8 hours\')',[sha256(sessionToken),actor.id,token()]);
    });
    setCookie(res,COOKIE,sessionToken,8*3600);
  }
  async function session(req) {
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
  function json(res,status,value) { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}); res.end(JSON.stringify(value)); }
  async function oauthStart(req,res) {
    if (localUser) {
      await openSession(res,localUser); res.writeHead(302,{Location:'/hub/prepare','Cache-Control':'no-store'}); return res.end();
    }
    if (!oauth) throw problem(503,'GitHub authentication is not configured');
    const state=token(); const binding=token();
    await pool.query('INSERT INTO hub_oauth_states(state_hash,binding_hash,expires_at) VALUES($1,$2,now()+interval \'10 minutes\')',[sha256(state),sha256(binding)]);
    setCookie(res,STATE_COOKIE,binding,600);
    const target=new URL('https://github.com/login/oauth/authorize');
    target.searchParams.set('client_id',oauth.clientId); target.searchParams.set('redirect_uri',`${origin}${BASE}/auth/callback`); target.searchParams.set('state',state); target.searchParams.set('scope','read:user');
    res.writeHead(302,{Location:target.href,'Cache-Control':'no-store'}); res.end();
  }
  async function oauthCallback(req,res,url) {
    if (!oauth || localUser) throw problem(503,'GitHub authentication is not configured');
    const state=url.searchParams.get('state'); const code=url.searchParams.get('code'); const binding=cookies(req).get(STATE_COOKIE);
    if (!/^[a-f0-9]{64}$/.test(state??'') || !/^[a-f0-9]{64}$/.test(binding??'') || !code || code.length>512 || url.searchParams.has('error')) throw problem(403,'GitHub sign-in state is invalid');
    const {rowCount}=await pool.query('DELETE FROM hub_oauth_states WHERE state_hash=$1 AND binding_hash=$2 AND expires_at>now()',[sha256(state),sha256(binding)]);
    if (rowCount!==1) throw problem(403,'GitHub sign-in state expired or was already used');
    const transport=oauth.fetch??fetch;
    const response=await transport('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({client_id:oauth.clientId,client_secret:oauth.clientSecret,code,redirect_uri:`${origin}${BASE}/auth/callback`}),redirect:'error',signal:AbortSignal.timeout(15000)});
    const credentials=await response.json();
    if (!response.ok || typeof credentials.access_token!=='string' || credentials.access_token.length>2048 || credentials.error || credentials.token_type?.toLowerCase()!=='bearer') throw problem(502,'GitHub sign-in failed');
    const profile=await transport('https://api.github.com/user',{headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${credentials.access_token}`,'User-Agent':'Zero-Hub','X-GitHub-Api-Version':'2022-11-28'},redirect:'error',signal:AbortSignal.timeout(15000)});
    const user=await profile.json();
    if (!profile.ok || !Number.isSafeInteger(user.id) || user.id<1) throw problem(502,'GitHub identity verification failed');
    await openSession(res,identity(user));
    res.writeHead(302,{Location:'/hub/prepare','Cache-Control':'no-store'}); res.end();
  }
  async function serveArtifact(req,res,requestPath) {
    const {rows}=await pool.query('SELECT manifest FROM hub_releases');
    for (const {manifest} of rows) {
      for (const [kind,artifact] of [...Object.entries(manifest.artifacts),['preview',manifest.preview]]) {
        const checksum = kind !== 'preview' && (requestPath === artifact.path + '.sha256' ? 'sha256' : requestPath === artifact.path + '.sha1' ? 'sha1' : null);
        if (artifact.path !== requestPath && !checksum) continue;
        const original = await (await storage()).read(artifact.sha256,artifact.size);
        const data = checksum ? Buffer.from(createHash(checksum).update(original).digest('hex') + '\n') : original;
        res.writeHead(200,{'Content-Type':checksum?'text/plain; charset=utf-8':kind==='preview'?'image/png':kind==='pom'?'application/xml; charset=utf-8':'application/java-archive','Content-Length':data.length,'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'});
        return res.end(req.method === 'HEAD' ? undefined : data);
      }
    }
    throw problem(404,'Artifact not found');
  }
  async function handler(req,res) {
    try {
      if (localUser && !loopback(req.socket.remoteAddress)) throw problem(403,'Local developer identity is loopback-only');
      const url=new URL(req.url,origin);
      const route=url.pathname;
      if (req.method==='GET' && route===`${BASE}/session`) { const actor=await session(req); return json(res,200,{user:actor?.user??null,...(actor?{csrfToken:actor.csrfToken}:{}),mode}); }
      if (req.method==='GET' && route===`${BASE}/auth/start`) return await oauthStart(req,res);
      if (req.method==='GET' && route===`${BASE}/auth/callback`) return await oauthCallback(req,res,url);
      if (req.method==='GET' && route===`${BASE}/catalog`) return json(res,200,await catalog());
      if (['GET','HEAD'].includes(req.method) && (route.startsWith(`${BASE}/maven/`) || route.startsWith(`${BASE}/previews/`))) return await serveArtifact(req,res,route);
      const libraryMatch=route.match(/^\/api\/hub\/libraries\/(ui[1-9a-z][0-9a-z]*)$/);
      if (req.method==='GET' && libraryMatch) {
        const version=url.searchParams.get('version');
        const {rows:[row]}=await pool.query('SELECT r.manifest,u.github_id AS contributor_id,u.login AS contributor_login FROM hub_releases r JOIN hub_submissions s ON s.id=r.submission_id JOIN hub_users u ON u.github_id=s.owner_id WHERE r.library_id=$1 AND ($2::text IS NULL OR r.version=$2) ORDER BY r.created_at DESC LIMIT 1',[libraryMatch[1],version]);
        if (!row) throw problem(404,'Library release not found'); return json(res,200,attributedRelease(row));
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
    } catch (error) { if (!res.headersSent) json(res,error.status??503,{error:safeError(error)}); else res.destroy(); }
  }
  return {handler,migrate,workOnce,publishOnce,drain,startWorkers,stop,reserveLibrary,submit,getSubmission,catalog};
}
