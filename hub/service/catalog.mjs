import {createHash} from 'node:crypto';
export const CATALOG_PAGE_SIZE=20;
export const CATALOG_PAGE_BYTES=2*1024*1024;
const idPattern=/^ui[1-9a-z][0-9a-z]{0,11}$/;
const versionPattern=/^(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})$/;
const exactVersion=/^\d{1,9}\.\d{1,9}\.\d{1,9}(?:-[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*)?$/;
const invalid=()=>{throw Object.assign(new Error('Invalid hub query'),{status:400});};
const scopeFor=(q,history)=>createHash('sha256').update(JSON.stringify([q,history])).digest('hex');
function encodeCursor(scope,id,version) {return Buffer.from(JSON.stringify([1,scope,id,version])).toString('base64url');}
export function catalogQuery(params=new URLSearchParams()) {
  if(params.toString().length>2048)invalid();
  const seen=new Set();
  for(const [key,value]of params){if(!['q','history','cursor'].includes(key)||seen.has(key)||/[\p{Cc}\p{Cf}\p{Cs}]/u.test(value))invalid();seen.add(key);}
  const raw=params.get('q')??'';
  if(Buffer.byteLength(raw)>200)invalid();
  const q=raw.trim().toLowerCase();if(Buffer.byteLength(q)>200)invalid();
  const history=params.has('history');if(history&&params.get('history')!=='1')invalid();
  const scope=scopeFor(q,history);let after=null;
  if(params.has('cursor')) {
    const cursor=params.get('cursor');
    if(!/^[A-Za-z0-9_-]{1,512}$/.test(cursor))invalid();
    try {after=JSON.parse(Buffer.from(cursor,'base64url').toString('utf8'));}catch {invalid();}
    if(!Array.isArray(after)||after.length!==4||after[0]!==1||after[1]!==scope||typeof after[2]!=='string'||typeof after[3]!=='string'||!idPattern.test(after[2])||!versionPattern.test(after[3])||encodeCursor(...after.slice(1))!==cursor)invalid();
  }
  const canonical=new URLSearchParams();if(q)canonical.set('q',q);if(history)canonical.set('history','1');if(after)canonical.set('cursor',encodeCursor(...after.slice(1)));
  return {q,history,scope,after,query:canonical.toString()};
}
// Shared by the service and all three website adapters. OAuth retains its own
// contract; catalog and exact-release requests have one canonical grammar.
export function canonicalHubQuery(url,path) {
  if(path==='catalog'){const query=catalogQuery(url.searchParams).query;return query?`?${query}`:'';}
  if(/^libraries\/ui[1-9a-z][0-9a-z]*$/.test(path)) {
    const entries=[...url.searchParams];
    if(entries.length>1||entries.length&& (entries[0][0]!=='version'||entries[0][1].length>128||!exactVersion.test(entries[0][1])))invalid();
    return entries.length?`?${new URLSearchParams(entries)}`:'';
  }
  if(url.search)invalid();return '';
}
export async function catalogPage(pool,params,attribute) {
  const {q,history,scope,after}=catalogQuery(params);
  // Published versions follow the numeric exact-version policy. Rank before
  // searching so an old matching description cannot appear as a latest release.
  const {rows}=await pool.query(`WITH cursor_key AS (SELECT $2::text AS id,$3::int[] AS numbers), versions AS (
    SELECT r.*,string_to_array(r.version,'.')::int[] AS numbers
    FROM hub_releases r
  ), selected AS (
    ${history?'SELECT * FROM versions':`SELECT DISTINCT ON (library_id COLLATE "C") * FROM versions ORDER BY library_id COLLATE "C",numbers DESC`}
  )
  SELECT r.library_id,r.version,r.manifest,u.github_id AS contributor_id,u.login AS contributor_login
  FROM selected r CROSS JOIN cursor_key k JOIN hub_submissions s ON s.id=r.submission_id JOIN hub_users u ON u.github_id=s.owner_id
  WHERE ($1::text='' OR strpos(lower(r.manifest->>'title'),$1)>0 OR strpos(lower(r.manifest->>'description'),$1)>0
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(r.manifest->'components') c WHERE strpos(lower(c->>'className'),$1)>0 OR strpos(lower(c->>'description'),$1)>0))
    AND (k.id IS NULL OR ${history?'(r.library_id COLLATE "C",r.numbers)>(k.id COLLATE "C",k.numbers)':'r.library_id COLLATE "C">k.id COLLATE "C"'})
  ORDER BY r.library_id COLLATE "C",r.numbers LIMIT $4`,[q,after?.[2]??null,after?.[3].split('.').map(Number)??null,CATALOG_PAGE_SIZE+1]);
  const page=[];let bytes=1024; // Reserve space for mode, capabilities and cursor.
  for(const row of rows.slice(0,CATALOG_PAGE_SIZE)) {
    const release=attribute(row),size=Buffer.byteLength(JSON.stringify(release))+1;
    if(bytes+size>CATALOG_PAGE_BYTES)break;
    bytes+=size;page.push(release);
  }
  if(rows.length&&!page.length)throw Object.assign(new Error('Library metadata exceeds the catalog page limit'),{status:503});
  const last=rows[page.length-1];
  return {libraries:page,nextCursor:rows.length>page.length?encodeCursor(scope,last.library_id,last.version):null};
}
