import {transaction} from './database.mjs';
import {configurationError,verifyRole} from './db-role.mjs';

// Fixed SQL fragments use the caller's fixed release alias `r`. Public queries
// read only the four granted columns, never private operator reasons or actors.
export const RELEASE_ACTION_SQL="(SELECT e.action FROM hub_release_events e WHERE e.library_id=r.library_id AND e.version=r.version ORDER BY e.revision DESC LIMIT 1)";
export const RELEASE_AVAILABLE_SQL=`COALESCE(${RELEASE_ACTION_SQL},'restored') <> 'withdrawn'`;
export const EXACT_ARTIFACT_SQL=`SELECT r.manifest,${RELEASE_ACTION_SQL} AS release_action FROM hub_releases r WHERE r.library_id=$1 AND r.version=$2 LIMIT 1`;
export const WITHDRAWN_MESSAGE='This library version has been withdrawn. Choose an available version from ZeroHub.';

export function releaseEventInput(input) {
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!=='action,libraryId,reason,version'
    ||typeof input.libraryId!=='string'||!/^ui[1-9a-z][0-9a-z]{0,11}$/.test(input.libraryId)
    ||typeof input.version!=='string'||!/^(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})$/.test(input.version)
    ||!['withdrawn','restored'].includes(input.action)||typeof input.reason!=='string'
    ||!input.reason.trim()||Buffer.byteLength(input.reason)>8000||/[\p{Cc}\p{Cf}\p{Cs}]/u.test(input.reason))
    throw configurationError('Provide an exact library, numeric version, withdrawn/restored action and bounded private reason');
  return {...input};
}

export async function recordReleaseEvent(pool,input,{enabled=false}={}) {
  if(enabled!==true)throw configurationError('Explicitly enable release availability mutations');
  const event=releaseEventInput(input);
  return transaction(pool,async client=>{
    await verifyRole(client,'hub_migration_owner');
    // Serializes all availability changes for this exact immutable release.
    const {rows:[release]}=await client.query('SELECT library_id FROM hub_releases WHERE library_id=$1 AND version=$2 FOR UPDATE',[event.libraryId,event.version]);
    if(!release)throw configurationError('Exact library release was not found');
    const {rows:[previous]}=await client.query('SELECT revision,action FROM hub_release_events WHERE library_id=$1 AND version=$2 ORDER BY revision DESC LIMIT 1',[event.libraryId,event.version]);
    if(previous?.action===event.action)return {libraryId:event.libraryId,version:event.version,action:event.action,revision:previous.revision,appended:0};
    if(previous?.revision===2147483647)throw configurationError('Release event revision limit reached');
    const revision=(previous?.revision??0)+1;
    // Actor is the authenticated database session, never caller-supplied data.
    await client.query('INSERT INTO hub_release_events(library_id,version,revision,action,reason) VALUES($1,$2,$3,$4,$5)',[event.libraryId,event.version,revision,event.action,event.reason]);
    return {libraryId:event.libraryId,version:event.version,action:event.action,revision,appended:1};
  });
}
