import {notFound} from 'next/navigation';
import {headers} from 'next/headers';
import type {ReactNode} from 'react';
import {jamDeploymentPolicy} from '@/lib/jams-pilot-policy.mjs';
import {authorizeJamRequest} from '@/lib/jams-access.mjs';
import {JamShell} from '@/components/JamShell';
import {HubAccount} from '@/components/HubGitHub';

export const dynamic = 'force-dynamic';
export default async function JamsLayout({children}:{children:ReactNode}) {
  const policy=jamDeploymentPolicy();
  if(!policy)notFound();
  if(policy.mode==='local')return children;
  const incoming=await headers();
  let request:Request;
  try{request=new Request(`https://${incoming.get('host')||''}/hub/jams`,{headers:incoming});}catch{notFound();}
  const blocked=authorizeJamRequest(request);
  if(!blocked)return children;
  if(blocked.status===404)notFound();
  return <JamShell><h1>Invited ZeroJams pilot</h1><p>{blocked.status===401?'Sign in with your invited GitHub account to continue.':blocked.status===403?'This GitHub account is not invited to the pilot.':'The invited pilot is not configured yet.'}</p><HubAccount/></JamShell>;
}
