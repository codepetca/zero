import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {entitlementAdminResponse} from '../lib/zero-entitlements-admin.mjs';
import {hubConfig, newManagedSession} from '../lib/hub-github-auth.mjs';
import zeroApp from '../../extension/src/github-app/config.json' with {type:'json'};
const origin = 'http://localhost:3000';
const env = {NODE_ENV:'test',ZERO_WORKOS_ENABLED:'true',WORKOS_CLIENT_ID:'client_123',WORKOS_COOKIE_PASSWORD:'a'.repeat(32),WORKOS_COOKIE_NAME:'zero-workos-session',WORKOS_ISSUER:'https://api.workos.com/user_management/client_123',NEXT_PUBLIC_WORKOS_REDIRECT_URI:`${origin}/zero-account/callback`,ZERO_HUB_ORIGIN:origin,ZERO_HUB_GITHUB_CLIENT_ID:zeroApp.clientId,ZERO_HUB_GITHUB_CLIENT_SECRET:'x'.repeat(30),ZERO_HUB_GITHUB_SESSION_SECRET:randomBytes(32).toString('base64url')};
const config = hubConfig(env), time = Date.now();
const session = newManagedSession('ghu_'+'a'.repeat(24),{id:4050555,login:'owner'},7200,config,{userId:'user_1',sessionId:'s1',issuer:env.WORKOS_ISSUER},time).session;
const calls=[];
const store={list:async id=>{calls.push(['list',id]);return {grants:[{id:'a',capability:'pro_listings',secret:'DO_NOT_EXPOSE'}],audit:[],access:{listingLimit:1,jamHosting:false}};},grant:async x=>calls.push(['grant',x]),revoke:async x=>calls.push(['revoke',x])};
const options={env,now:()=>time,read:async()=>session,github:async()=>({id:4050555}),getStore:async()=>store};
const post=(body,headers={})=>new Request(`${origin}/api/admin/entitlements`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Hub-CSRF':session.csrf,...headers},body:typeof body==='string'?body:JSON.stringify(body)});
const body={action:'grant',targetId:'123',capability:'jam_hosting',expiresAt:null,reason:'Approved',operationId:'operation_123'};
const get=(query='')=>new Request(`${origin}/api/admin/entitlements${query}`);

test('requires configured managed session, owner and fresh matching GitHub identity',async()=>{
  assert.equal((await entitlementAdminResponse(get(),{...options,env:{...env,ZERO_WORKOS_ENABLED:''}})).status,503);
  assert.equal((await entitlementAdminResponse(get(),{...options,read:async()=>null})).status,401);
  assert.equal((await entitlementAdminResponse(get(),{...options,read:async()=>({...session,workos:undefined})})).status,401);
  assert.equal((await entitlementAdminResponse(get(),{...options,read:async()=>({...session,id:'123'})})).status,403);
  assert.equal((await entitlementAdminResponse(get(),{...options,github:async()=>({id:123})})).status,401);
  assert.equal((await entitlementAdminResponse(get(),{...options,github:async()=>{throw Error('secret token');}})).status,503);
});

test('reads are no-store and project only approved store fields',async()=>{
  const response=await entitlementAdminResponse(get('?accountId=123'),options);
  assert.equal(response.status,200); assert.equal(response.headers.get('cache-control'),'no-store');
  const text=await response.text();assert.doesNotMatch(text,/DO_NOT_EXPOSE|ghu_/); assert.match(text,/pro_listings/); assert.deepEqual(JSON.parse(text).access,{listingLimit:1,jamHosting:false,legacyListings:false,legacyJamHosting:false});
  const legacy=await entitlementAdminResponse(get('?accountId=123'),{...options,env:{...env,ZERO_HUB_LISTINGS_PRO_GITHUB_IDS:'123',ZERO_JAMS_PRO_GITHUB_IDS:'123'}});
  assert.deepEqual((await legacy.json()).access,{listingLimit:10,jamHosting:true,legacyListings:true,legacyJamHosting:true});
  const central=await entitlementAdminResponse(get('?accountId=123'),{...options,getStore:async()=>({...store,list:async()=>({grants:[],audit:[],access:{listingLimit:10,jamHosting:true}})})});
  assert.deepEqual((await central.json()).access,{listingLimit:10,jamHosting:true,legacyListings:false,legacyJamHosting:false});
  assert.equal((await entitlementAdminResponse(get('?accountId=123&accountId=456'),options)).status,400);
  assert.equal((await entitlementAdminResponse(get('?accountId=0123'),options)).status,400);
  assert.equal((await entitlementAdminResponse(get('?accountId=123'),{...options,getStore:async()=>null})).status,503);
});

test('writes require same origin and session CSRF, strict bounded JSON and allowed fields',async()=>{
  calls.length=0;
  assert.equal((await entitlementAdminResponse(post(body,{Origin:'https://evil.test'}),options)).status,403);
  assert.equal((await entitlementAdminResponse(post(body,{'X-Hub-CSRF':'x'.repeat(43)}),options)).status,403);
  assert.equal((await entitlementAdminResponse(post(body,{'Content-Type':'text/plain'}),options)).status,415);
  for (const bad of [{...body,actorId:'123'},{...body,capability:'admin'},{...body,reason:' '},{...body,expiresAt:'invalid'},{...body,targetId:'0'},{...body,reason:'x'.repeat(5000)}]) assert.equal((await entitlementAdminResponse(post(bad),options)).status,400);
  assert.equal(calls.length,0);
  assert.equal((await entitlementAdminResponse(post(body),options)).status,200);
  assert.equal(calls[0][1].actorId,'4050555');
  assert.equal((await entitlementAdminResponse(post({...body,expiresAt:'2020-01-01T00:00:00.000Z'}),options)).status,200, 'HTTP must allow retry after expiry');
  assert.equal((await entitlementAdminResponse(post({action:'revoke',grantId:'12345678-1234-1234-1234-123456789abc',reason:'Correction',operationId:'operation_456'}),options)).status,200);
});

test('store errors never reveal secrets or assert success',async()=>{
 const response=await entitlementAdminResponse(post(body),{...options,getStore:async()=>({grant:async()=>{throw Error('secret token');}})});
 assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/secret|token|ok/);
});

test('admin page denies framing', async()=>{
 const {readFile}=await import('node:fs/promises');
 const config=await readFile(new URL('../next.config.ts',import.meta.url),'utf8');
 assert.match(config, /'\/admin\/entitlements'/); assert.match(config,/X-Frame-Options[^\n]*DENY/); assert.match(config,/frame-ancestors 'none'/);
});
