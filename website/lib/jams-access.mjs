import {hubConfig,readSession} from './hub-github-auth.mjs';
import {jamDeploymentPolicy} from './jams-pilot-policy.mjs';

const headers={'Cache-Control':'no-store','X-Robots-Tag':'noindex','X-Content-Type-Options':'nosniff'};
export const jamNotFound=()=>new Response('Not found',{status:404,headers:{...headers,'Content-Type':'text/plain; charset=utf-8'}});
export function authorizeJamRequest(request,{env=process.env,pilot,now=Date.now()}={}) {
  const policy=jamDeploymentPolicy(env,pilot);
  if(!policy)return jamNotFound();
  if(policy.mode==='local')return null;
  // The only canonical pilot host is a reviewed branch URL, not request headers.
  if(new URL(request.url).origin!==policy.origin)return jamNotFound();
  const config=hubConfig(env);
  if(!config)return Response.json({error:'The invited pilot is not configured yet.'},{status:503,headers});
  const session=readSession(request,config,now);
  if(!session)return Response.json({error:'Sign in with GitHub on the official pilot page to continue.'},{status:401,headers});
  if(!policy.inviteIds.includes(session.id))return Response.json({error:'This GitHub account is not invited to the pilot.'},{status:403,headers});
  return null;
}
