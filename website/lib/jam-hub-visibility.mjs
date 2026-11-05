import {createProjectVisibilityReader} from '../../jams/project-visibility-reader.mjs';
import {projectVisibility} from '../../jams/project-visibility.mjs';
import {validateSettlements} from '../../jams/schema.mjs';
import {jamsPreviewAvailable} from './jams-visibility.mjs';
import {createHubRequestDeadline} from './hub-request-deadline.mjs';
import {readDefaultLocalJamAuthority} from './jams-default-authority.mjs';

const unavailable = () => {throw new Error('Project visibility is unavailable.');};
// Previews do not receive the production database credentials and cannot
// prove that a production-held project is safe to expose.
const hostedPreview=env=>env.VERCEL_ENV==='preview';

// Enforce this immediately before a public result or a side-effect dispatch,
// using the fresh decision that authorized it. A rollback can make a project
// held again without changing the Git registry revision.
export function assertJamVisibilityTime(visibility, now=Date.now, env=process.env) {
  if(hostedPreview(env))unavailable();
  // A null decision authorizes only the inactive mode it observed. A mode
  // transition before this boundary requires a fresh request and decision.
  if(visibility===null) {
    if(isJamHubVisibilityEnforced({env}))unavailable();
    return;
  }
  if(!visibility||!Number.isSafeInteger(visibility.observedAt)||visibility.observedAt<0||typeof now!=='function')unavailable();
  const time=now();
  if(!Number.isSafeInteger(time)||time<visibility.observedAt)unavailable();
}

// Production always enforces visibility, even when pilot pages or writes are
// disabled, so removing an activation flag cannot expose held projects.
export function isJamHubVisibilityEnforced({env=process.env}={}) {
  return hostedPreview(env) || jamsPreviewAvailable(env) || env.NODE_ENV==='production'&&(env.VERCEL_ENV==='production'||env.VERCEL_ENV===undefined);
}

/** Each request reads a fresh canonical registry head and samples the clock
 * after the complete snapshot. Only immutable validated bodies can be reused.
 * No decision, absent membership or previous successful response is cached.
 * This local composition deliberately adds no pilot/production activation or
 * credentials. An unavailable or uninitialized registry denies discovery.
 * An explicitly injected store is a trusted authority: its snapshot must be a
 * fresh, complete, immutable view of all events and settlements. Injection does
 * not configure, authenticate, or automatically select a database.
 */
export function createJamHubVisibilityReader(options={}) {
  if(!options||typeof options!=='object'||Array.isArray(options))unavailable();
  const {fetchImpl=fetch,clock=Date.now,totalTimeoutMs=15000}=options;
  const injected=Object.hasOwn(options,'store'),store=options.store;
  if(typeof fetchImpl!=='function'||typeof clock!=='function'||
      !Number.isSafeInteger(totalTimeoutMs)||totalTimeoutMs<1||totalTimeoutMs>15000||
      injected&&(!store||typeof store.snapshot!=='function'))unavailable();
  const reader=injected?store:createProjectVisibilityReader({fetchImpl,totalTimeoutMs});
  return async function readVisibility({env=process.env,signal}={}) {
    if(hostedPreview(env))unavailable();
    if(!isJamHubVisibilityEnforced({env}))return null;
    const deadline=createHubRequestDeadline({budgetMs:totalTimeoutMs,signal});
    try {
      const snapshot=await deadline.run(signal=>reader.snapshot({signal}));
      if(hostedPreview(env)||!isJamHubVisibilityEnforced({env}))unavailable();
      if(injected)validateSettlements(snapshot?.settlements);
      const visibility=await deadline.run(()=>projectVisibility(snapshot,clock()));
      if(hostedPreview(env)||!isJamHubVisibilityEnforced({env}))unavailable();
      deadline.check();
      return visibility;
    } catch {unavailable();}
    finally {deadline.dispose();}
  };
}

const readGitJamHubVisibility=createJamHubVisibilityReader();
export async function readJamHubVisibility(options={}) {
  const env=options.env??process.env;
  if(hostedPreview(env))unavailable();
  // An inactive hold needs no authority lookup. Callers must still check the
  // null decision immediately before publishing or dispatching an effect, so
  // an activation after this observation fails closed.
  if(!isJamHubVisibilityEnforced({env}))return null;
  const deadline=createHubRequestDeadline({budgetMs:15000,signal:options.signal});
  try{
    const local=await deadline.run(()=>readDefaultLocalJamAuthority({env}));
    return await deadline.run(signal=>local?local.visibilityReader({...options,env,signal}):readGitJamHubVisibility({...options,signal}));
  }catch{unavailable();}
  finally{deadline.dispose();}
}
