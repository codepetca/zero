// Private operator archive, never a runtime service or candidate execution path.
import {constants} from 'node:fs';
import {open,lstat,link,unlink} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {verifyRole} from './db-role.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=()=>{throw new Error('ZeroHub private backup operation failed');};
// Technical archive ceilings, not contribution/library product quotas. Each
// cursor fetch and decoded record holds at most one bounded row in memory.
export const ARCHIVE_LIMITS=Object.freeze({bytes:4*1024**3,recordBytes:128*1024**2,records:1_000_000,milliseconds:15*60_000});
const tables=[
  ['hub_users',['github_id','login','updated_at'],['text','text','time'],['github_id']],
  ['hub_libraries',['id','owner_id','created_at'],['text','text','time'],['id']],
  ['hub_submissions',['id','library_id','owner_id','version','bundle','source_digest','status','attempts','lease_token','lease_until','error','created_at'],['text','text','text','text','json','text','text','int','text','time','text','time'],['id']],
  ['hub_results',['submission_id','source_digest','policy','policy_digest','passed','report','jar','sources','pom','artifact_hashes','created_at'],['text','text','text','text','bool','json','bytes','bytes','bytes','json','time'],['submission_id']],
  ['hub_releases',['library_id','version','submission_id','manifest','created_at'],['text','text','text','json','time'],['library_id','version']],
  ['hub_objects',['digest','size','bytes','created_at'],['text','int','bytes','time'],['digest']]
];
const allTables=[...tables.map(t=>t[0]),'hub_sessions','hub_oauth_states'];
const fixedNames=allTables.map(n=>`'${n}'`).join(',');
// Fingerprint includes exact trusted columns, constraints, indexes, triggers,
// owner, functions and sequence configuration, excluding role ACLs/logins.
export const SCHEMA_SQL=`SELECT kind,name,definition FROM (
 SELECT 'column' kind,c.relname||'.'||a.attnum name,json_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid))::text definition
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
 WHERE n.nspname='public' AND c.relname IN (${fixedNames}) AND a.attnum>0 AND NOT a.attisdropped
 UNION ALL SELECT 'constraint',c.relname||'.'||k.conname,pg_get_constraintdef(k.oid) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN (${fixedNames})
 UNION ALL SELECT 'index',c.relname||'.'||i.relname,pg_get_indexdef(i.oid) FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN (${fixedNames})
 UNION ALL SELECT 'trigger',c.relname||'.'||t.tgname,json_build_array(pg_get_triggerdef(t.oid),t.tgenabled)::text FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN (${fixedNames}) AND NOT t.tgisinternal
 UNION ALL SELECT 'relation',c.relname,json_build_array(c.relkind,r.rolname,c.relrowsecurity,c.relforcerowsecurity)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner WHERE n.nspname='public' AND (c.relname IN (${fixedNames}) OR c.relname='hub_library_number')
 UNION ALL SELECT 'function',p.proname,json_build_array(pg_get_functiondef(p.oid),r.rolname)::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname='public' AND p.proname IN ('hub_preserve_record','hub_preserve_submission','hub_runtime_transition')
 UNION ALL SELECT 'sequence','hub_library_number',json_build_array(s.seqtypid::regtype::text,s.seqstart::text,s.seqincrement::text,s.seqmax::text,s.seqmin::text,s.seqcache::text,s.seqcycle)::text FROM pg_sequence s WHERE s.seqrelid='public.hub_library_number'::regclass
) schema ORDER BY kind COLLATE "C",name COLLATE "C",definition COLLATE "C"`;
export const SCHEMA_FINGERPRINTS=Object.freeze({
  17:'63180d0721790c1edc862932bcad88f1aa05f233d4b08484287952e1c2cf03f0',
  // PostgreSQL18 additionally catalogs named NOT NULL constraints. Both hashes
  // come from the same trusted000–003 migrations on pinned database fixtures.
  18:'af4cd92b0bddfcd4e7b3cd0e36fe88409cc97d45376888b3847c6c7f328d42e3'
});
async function schema(client) {
  const {rows:[version]}=await client.query("SELECT current_setting('server_version_num')::int/10000 AS major");
  const expected=SCHEMA_FINGERPRINTS[version?.major];if(!expected)fail();
  const {rows}=await client.query(SCHEMA_SQL);
  if(hash(JSON.stringify(rows))!==expected)fail();return expected;
}
const archiveHeader=fingerprint=>['zero-hub-private-backup',1,'000-003',fingerprint,'auth-excluded'];
function budget(limits) {
  // Callers may lower ceilings for tests/operations, never expand them.
  const use={...ARCHIVE_LIMITS};
  for(const key of Object.keys(use))if(limits?.[key]!==undefined) {
    if(!Number.isSafeInteger(limits[key])||limits[key]<1||limits[key]>use[key])fail();
    use[key]=limits[key];
  }
  const started=Date.now();let bytes=0,records=0;
  return {limits:use,tick(size=0){bytes+=size;records++;if(bytes>use.bytes||size>use.recordBytes||records>use.records||Date.now()-started>use.milliseconds)fail();},check(){if(Date.now()-started>use.milliseconds)fail();}};
}
async function privateParent(file) {
  if(typeof file!=='string'||!path.isAbsolute(file)||path.normalize(file)!==file)fail();
  // Reject symlinks in every parent component, including the final directory.
  let current=path.parse(file).root;
  for(const part of path.dirname(file).slice(current.length).split(path.sep).filter(Boolean)) {
    current=path.join(current,part);const stat=await lstat(current);
    if(!stat.isDirectory()||stat.isSymbolicLink())fail();
  }
  const stat=await lstat(path.dirname(file));
  if((stat.mode&0o777)!==0o700||stat.uid!==process.getuid())fail();
}
async function inputFile(file) {
  await privateParent(file);
  const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try {const stat=await handle.stat();if(!stat.isFile()||(stat.mode&0o777)!==0o600||stat.uid!==process.getuid()||stat.nlink!==1)fail();return handle;}
  catch(error){await handle.close();throw error;}
}
async function* lines(handle,bounds) {
  // Fixed-size reads; no readline stream can buffer an unbounded attacker line.
  const chunk=Buffer.alloc(64*1024);let pending=[],size=0;
  while(true) {
    bounds.check();const {bytesRead}=await handle.read(chunk,0,chunk.length,null);if(!bytesRead)break;
    let start=0;
    for(let i=0;i<bytesRead;i++)if(chunk[i]===10) {
      const piece=Buffer.from(chunk.subarray(start,i));size+=piece.length;pending.push(piece);
      if(size+1>bounds.limits.recordBytes)fail();
      const line=Buffer.concat(pending,size);bounds.tick(size+1);yield line;pending=[];size=0;start=i+1;
    }
    if(start<bytesRead){const piece=Buffer.from(chunk.subarray(start,bytesRead));size+=piece.length;if(size+1>bounds.limits.recordBytes)fail();pending.push(piece);}
  }
  if(size)fail(); // Every record, especially the commit trailer, ends in LF.
}
function decode(line) {
  const text=line.toString('utf8');if(!Buffer.from(text).equals(line))fail();
  const record=JSON.parse(text);if(JSON.stringify(record)!==text)fail();return record;
}
function values(table,row,exporting=false) {
  if(!Array.isArray(row)||row.length!==table[1].length)fail();
  return row.map((value,i)=>{
    if(value===null)return null;
    const type=table[2][i];
    if(type==='bytes') {
      if(exporting){if(!Buffer.isBuffer(value))fail();return ['bytes',value.toString('base64'),hash(value)];}
      if(!Array.isArray(value)||value.length!==3||value[0]!=='bytes'||typeof value[1]!=='string'||!/^[a-f0-9]{64}$/.test(value[2]))fail();
      const bytes=Buffer.from(value[1],'base64');if(bytes.toString('base64')!==value[1]||hash(bytes)!==value[2])fail();return bytes;
    }
    if(type==='int'){if(!Number.isInteger(value)||value< -2147483648||value>2147483647)fail();}
    else if(type==='bool'){if(typeof value!=='boolean')fail();}
    else if(typeof value!=='string')fail();
    // JSON is transmitted as PostgreSQL text, avoiding JS number coercion and
    // never using its object keys as database identifiers or JS assignments.
    if(type==='json')JSON.parse(value);
    return value;
  });
}
function sequence(value) {
  if(!Array.isArray(value)||value.length!==2||typeof value[0]!=='string'||!/^[1-9][0-9]{0,18}$/.test(value[0])||BigInt(value[0])>9223372036854775807n||typeof value[1]!=='boolean')fail();
  return value;
}
function libraryNumber(id) {
  // Library IDs originate from this bigint sequence, encoded without rounding.
  if(typeof id!=='string'||!/^ui[1-9a-z][0-9a-z]{0,12}$/.test(id))fail();
  let value=0n;
  for(const digit of id.slice(2))value=value*36n+BigInt('0123456789abcdefghijklmnopqrstuvwxyz'.indexOf(digit));
  if(value>9223372036854775807n)fail();
  return value;
}
function safeSequence(state,maximum) {
  const last=BigInt(state[0]);
  if(state[1]?last<maximum:last<=maximum)fail();
}
async function begin(pool,readOnly,action) {
  const client=await pool.connect();
  try {
    await verifyRole(client,'hub_migration_owner');
    const {rows:[role]}=await client.query("SELECT rolcanlogin OR rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls AS elevated FROM pg_roles WHERE rolname='hub_migration_owner'");
    if(!role||role.elevated)fail();
    await client.query(readOnly?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');
    // Timestamp text must have one unambiguous format on both connections.
    await client.query("SET LOCAL DateStyle='ISO, YMD'");
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    await client.query("SET LOCAL lock_timeout='3s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout='30s'");
    await client.query('SELECT pg_advisory_xact_lock(92104419)');
    const result=await action(client);await client.query('COMMIT');return result;
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
  finally{client.release();}
}
export async function exportBackup({pool,file,limits}) {
  let handle,temporary;
  try {
    await privateParent(file);
    try{await lstat(file);fail();}catch(error){if(error.code!=='ENOENT')throw error;}
    temporary=path.join(path.dirname(file),`.zero-backup-${randomUUID()}.partial`);
    handle=await open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
    await handle.chmod(0o600);
    const bounds=budget(limits),digest=createHash('sha256'),counts=tables.map(()=>0);let maximumLibrary=0n;
    const write=async(record,hashed=true)=>{const line=Buffer.from(JSON.stringify(record)+'\n');bounds.tick(line.length);if(hashed)digest.update(line);await handle.writeFile(line);};
    const result=await begin(pool,true,async client=>{
      // Stabilize the schema against concurrent migrations; MVCC stabilizes data.
      await client.query(`LOCK TABLE ${allTables.map(n=>'public.'+n).join(',')} IN ACCESS SHARE MODE`);
      const fingerprint=await schema(client);await write(archiveHeader(fingerprint));
      for(let index=0;index<tables.length;index++) {
        const table=tables[index],expressions=table[1].map((c,i)=>['json','time','text'].includes(table[2][i])?`${c}::text`:c);
        // Bound the projected wire record before a large field reaches Node.
        // JSON quoting is measured by PostgreSQL; binary base64/hash overhead
        // and row punctuation are conservatively included in the estimate.
        const measured=table[1].map((c,i)=>table[2][i]==='bytes'?`COALESCE(((octet_length(${c})::bigint+2)/3)*4+90,4)`:`COALESCE(octet_length(to_json(${expressions[i]})::text)::bigint,4)`);
        const estimate=`(${measured.join('+')}+128)`;
        const columns=expressions.map(expr=>`CASE WHEN ${estimate}<=$1 THEN ${expr} ELSE NULL END`).join(',');
        const ordering=table[3].map(c=>`${c}::text COLLATE "C"`).join(',');
        await client.query(`DECLARE hub_backup_cursor NO SCROLL CURSOR FOR SELECT ${estimate} AS wire_bound,${columns} FROM public.${table[0]} ORDER BY ${ordering}`,[bounds.limits.recordBytes]);
        while(true){bounds.check();const {rows}=await client.query({text:'FETCH FORWARD 1 FROM hub_backup_cursor',rowMode:'array'});if(!rows.length)break;if(BigInt(rows[0][0])>BigInt(bounds.limits.recordBytes))fail();const row=values(table,rows[0].slice(1),true);if(table[0]==='hub_libraries'){const number=libraryNumber(row[0]);if(number>maximumLibrary)maximumLibrary=number;}await write(['row',index,row]);counts[index]++;}
        await client.query('CLOSE hub_backup_cursor');
      }
      // Sequences are outside MVCC. A late read can conservatively skip newly
      // allocated numbers but cannot reuse a number present in this snapshot.
      const {rows:[state]}=await client.query('SELECT last_value::text,is_called FROM public.hub_library_number');
      const stateValue=sequence([state.last_value,state.is_called]);safeSequence(stateValue,maximumLibrary);
      digest.update(JSON.stringify(['end',counts,stateValue])+'\n');
      const sha256=digest.digest('hex');
      await write(['end',counts,stateValue,sha256],false);
      return {counts,sha256};
    });
    await handle.sync();await handle.close();handle=null;
    // link is atomic and exclusive; rename would overwrite an existing archive.
    await link(temporary,file);await unlink(temporary);temporary=null;
    const directory=await open(path.dirname(file),constants.O_RDONLY);try{await directory.sync();}finally{await directory.close();}
    return result;
  }catch{fail();}finally{await handle?.close().catch(()=>{});if(temporary)await unlink(temporary).catch(()=>{});}
}
export async function restoreBackup({pool,file,enabled=false,limits}) {
  let handle;
  try {
    if(enabled!==true)fail();handle=await inputFile(file);
    const bounds=budget(limits),digest=createHash('sha256'),counts=tables.map(()=>0);
    if((await handle.stat()).size>bounds.limits.bytes)fail();
    return await begin(pool,false,async client=>{
      // Block every runtime read/write and schema mutation for the complete
      // empty-target check and import. Lock acquisition failure aborts closed.
      await client.query(`LOCK TABLE ${allTables.map(n=>'public.'+n).join(',')} IN ACCESS EXCLUSIVE MODE`);
      const fingerprint=await schema(client);
      for(const table of allTables){const {rows:[row]}=await client.query(`SELECT EXISTS(SELECT 1 FROM public.${table}) AS occupied`);if(row.occupied)fail();}
      const {rows:[prelock]}=await client.query('SELECT last_value::text,is_called FROM public.hub_library_number');
      if(prelock.last_value!=='1'||prelock.is_called!==false)fail();
      // This fixed, unchanged setting acquires the sequence DDL lock before
      // observing its state; even a standalone concurrent nextval is blocked.
      await client.query('ALTER SEQUENCE public.hub_library_number NO CYCLE');
      const {rows:[initial]}=await client.query('SELECT last_value::text,is_called FROM public.hub_library_number');
      if(initial.last_value!=='1'||initial.is_called!==false)fail();
      // RESTART replaces sequence storage transactionally. Subsequent setval
      // touches that replacement, so rollback restores even exact is_called.
      await client.query('ALTER SEQUENCE public.hub_library_number RESTART WITH 1');
      const {rows:[locked]}=await client.query('SELECT last_value::text,is_called FROM public.hub_library_number');
      if(locked.last_value!=='1'||locked.is_called!==false)fail();
      let first=true,ended=false,lastTable=0,lastKey=null,state,sha256,maximumLibrary=0n;
      for await(const line of lines(handle,bounds)) {
        bounds.check();const record=decode(line);
        if(first){first=false;if(JSON.stringify(record)!==JSON.stringify(archiveHeader(fingerprint)))fail();digest.update(line).update('\n');continue;}
        if(ended)fail();
        if(Array.isArray(record)&&record[0]==='end') {
          if(record.length!==4||JSON.stringify(record[1])!==JSON.stringify(counts))fail();
          state=sequence(record[2]);safeSequence(state,maximumLibrary);
          digest.update(JSON.stringify(['end',counts,state])+'\n');sha256=digest.digest('hex');if(record[3]!==sha256)fail();ended=true;continue;
        }
        if(!Array.isArray(record)||record.length!==3||record[0]!=='row'||!Number.isInteger(record[1])||record[1]<lastTable||record[1]>=tables.length)fail();
        const index=record[1],table=tables[index],row=values(table,record[2]);
        const key=table[3].map(c=>row[table[1].indexOf(c)]);
        if(key.some(v=>typeof v!=='string'))fail();
        if(index===lastTable&&lastKey){let compare=0;for(let k=0;k<key.length&&!compare;k++)compare=Buffer.compare(Buffer.from(key[k]),Buffer.from(lastKey[k]));if(compare<=0)fail();}
        lastTable=index;lastKey=key;
        if(table[0]==='hub_libraries'){const number=libraryNumber(row[0]);if(number>maximumLibrary)maximumLibrary=number;}
        if(table[0]==='hub_objects'&&(hash(row[2])!==row[0]||row[2].length!==row[1]))fail();
        await client.query(`INSERT INTO public.${table[0]} (${table[1].join(',')}) VALUES (${row.map((_,i)=>'$'+(i+1)).join(',')})`,row);
        counts[index]++;digest.update(line).update('\n');
      }
      if(first||!ended)fail();
      // Only fixed SQL and ordinary validated parameters come from the archive.
      await client.query("SELECT setval('public.hub_library_number'::regclass,$1::bigint,$2::boolean)",state);
      bounds.check();return {counts,sha256};
    });
  }catch{fail();}finally{await handle?.close().catch(()=>{});}
}
