import preparedPilot from '../../jams/pilot.json' with {type:'json'};

const id=/^[1-9][0-9]{0,19}$/;
export const PILOT_PROJECT_ID='prj_b8dDCbuiF8uzVcXYMLghpWTAr4aA';
export const PILOT_BRANCH='codex/zerojams-controlled-pilot';
export const PILOT_REGISTRY_BRANCH='zero-jams-pilot-registry';
export function jamDeploymentPolicy(env=process.env,pilot=preparedPilot) {
  // Production is an unconditional hold, including accidentally copied settings.
  if(env.VERCEL_ENV==='production')return null;
  if(env.NODE_ENV==='development'&&!env.VERCEL&&env.VERCEL_ENV!=='preview')
    return {mode:'local',origin:'https://zero.codepet.ca',registryBranch:'zero-jams-registry'};
  if(env.NODE_ENV!=='production'||env.VERCEL!=='1'||env.VERCEL_ENV!=='preview'||env.ZERO_JAMS_PILOT_ENABLED!=='1')return null;
  if(!pilot||pilot.schema!==1||pilot.status!=='enabled'||pilot.projectId!==PILOT_PROJECT_ID||pilot.branch!==PILOT_BRANCH||pilot.registryBranch!==PILOT_REGISTRY_BRANCH||
    env.VERCEL_PROJECT_ID!==PILOT_PROJECT_ID||env.VERCEL_GIT_COMMIT_REF!==PILOT_BRANCH)return null;
  let url;try{url=new URL(pilot.origin);}catch{return null;}
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.origin!==pilot.origin||!url.hostname.endsWith('.vercel.app')||
    url.hostname!==env.VERCEL_BRANCH_URL||env.ZERO_HUB_ORIGIN!==url.origin)return null;
  const validIds=value=>Array.isArray(value)&&value.length>0&&value.length<=5&&value.every(v=>typeof v==='string'&&id.test(v))&&new Set(value).size===value.length;
  if(!validIds(pilot.inviteIds)||!validIds(pilot.maintainerIds)||!id.test(pilot.creatorId)||!pilot.inviteIds.includes(pilot.creatorId)||
    pilot.maintainerIds.some(v=>!pilot.inviteIds.includes(v)||v===pilot.creatorId))return null;
  // Limits are operator-reviewed constants, never an environment/request override.
  const limits={events:2,participants:5,operations:200,safetyOperations:7,proposals:10,entryHistory:5};
  if(JSON.stringify(pilot.limits)!==JSON.stringify(limits))return null;
  return {mode:'pilot',origin:url.origin,registryBranch:PILOT_REGISTRY_BRANCH,inviteIds:[...pilot.inviteIds],maintainerIds:[...pilot.maintainerIds],limits};
}
export const jamOfficialOrigin=(env=process.env)=>jamDeploymentPolicy(env)?.origin||'https://zero.codepet.ca';
