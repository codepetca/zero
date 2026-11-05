import {seal,unseal} from './hub-github-auth.mjs';
import {ID,SHA,LIMITS} from '../../jams/schema.mjs';

const purpose='jam-gallery-page';
const lifetime=30*60*1000;
const validKey=config=>Buffer.isBuffer(config?.key)&&config.key.length===32;
const validEvent=id=>typeof id==='string'&&ID.test(id);
const validOffset=offset=>Number.isSafeInteger(offset)&&offset>0&&offset<=LIMITS.participants&&offset%8===0;
const validClock=now=>Number.isSafeInteger(now)&&now>=0;

// The cursor is routing data, never authority: service and HTTP must each
// recheck fresh registry/visibility authority before disclosing any page.
// Encryption keeps the pinned Git revision out of public response bodies.
export function createJamGalleryCursor({id,offset,revision,validUntil,now},config) {
  if(!validKey(config)||!validEvent(id)||!validOffset(offset)||typeof revision!=='string'||!SHA.test(revision)||!validClock(now)||
      !(validUntil===null||validClock(validUntil)&&validUntil>now))return null;
  return seal({v:1,id,offset,revision,validUntil,issuedAt:now},purpose,config);
}

export function readJamGalleryCursor(value,id,now,config) {
  if(!validKey(config)||!validEvent(id)||!validClock(now))return null;
  const payload=unseal(value,purpose,config);
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||
      Object.keys(payload).sort().join(',')!=='id,issuedAt,offset,revision,v,validUntil'||
      payload.v!==1||payload.id!==id||!validOffset(payload.offset)||
      typeof payload.revision!=='string'||!SHA.test(payload.revision)||
      !validClock(payload.issuedAt)||payload.issuedAt>now||now-payload.issuedAt>lifetime||
      !(payload.validUntil===null||validClock(payload.validUntil)&&payload.validUntil>now))return null;
  return {offset:payload.offset,revision:payload.revision,validUntil:payload.validUntil,notBefore:payload.issuedAt};
}
