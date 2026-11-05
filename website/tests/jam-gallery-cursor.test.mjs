import test from 'node:test';
import assert from 'node:assert/strict';
import {createJamGalleryCursor,readJamGalleryCursor} from '../lib/jam-gallery-cursor.mjs';
import {seal} from '../lib/hub-github-auth.mjs';

const config={key:Buffer.alloc(32,7)},other={key:Buffer.alloc(32,8)};
const record={id:'jam-123',offset:8,revision:'a'.repeat(40),validUntil:null,now:1_800_000_000_000};
test('opaque authenticated cursors are event-bound and expire',()=>{
  const cursor=createJamGalleryCursor(record,config);
  assert.equal(typeof cursor,'string');assert.doesNotMatch(Buffer.from(cursor,'base64url').toString('utf8'),/jam-123|aaaaaaaa/);
  assert.deepEqual(readJamGalleryCursor(cursor,record.id,record.now,config),{offset:8,revision:record.revision,validUntil:null,notBefore:record.now});
  assert.equal(readJamGalleryCursor(cursor,'jam-124',record.now,config),null);
  assert.equal(readJamGalleryCursor(cursor,record.id,record.now,other),null);
  assert.equal(readJamGalleryCursor(cursor,record.id,record.now-1,config),null);
  assert.equal(readJamGalleryCursor(cursor,record.id,record.now+30*60*1000+1,config),null);
  const bytes=Buffer.from(cursor,'base64url');bytes[bytes.length-1]^=1;
  assert.equal(readJamGalleryCursor(bytes.toString('base64url'),record.id,record.now,config),null);
  const timed=createJamGalleryCursor({...record,validUntil:record.now+1000},config);
  assert.ok(readJamGalleryCursor(timed,record.id,record.now+999,config));
  assert.equal(readJamGalleryCursor(timed,record.id,record.now+1000,config),null);
});
test('invalid cursor payloads, offsets, clocks and configuration fail closed',()=>{
  for(const patch of [{id:'../bad'},{offset:0},{offset:9},{offset:208},{revision:'bad'},{now:-1}])
    assert.equal(createJamGalleryCursor({...record,...patch},config),null);
  assert.equal(createJamGalleryCursor(record,{}),null);
  const payload={v:1,id:record.id,offset:8,revision:record.revision,validUntil:null,issuedAt:record.now};
  for(const bad of [{...payload,extra:true},{...payload,offset:9},{...payload,v:2}])
    assert.equal(readJamGalleryCursor(seal(bad,'jam-gallery-page',config),record.id,record.now,config),null);
  assert.equal(readJamGalleryCursor('invalid',record.id,record.now,config),null);
});
