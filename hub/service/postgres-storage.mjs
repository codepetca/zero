import {sha256} from './artifacts.mjs';
export const MAX_OBJECT_BYTES=16*1024*1024;
const valid=(digest,size)=>/^[a-f0-9]{64}$/.test(digest) && Number.isSafeInteger(size) && size>0 && size<=MAX_OBJECT_BYTES;

// Pool must have hub_api (reads) or hub_publisher (reads/inserts) authority.
// An immutable digest key cannot be replaced, including on a retry.
export function createPostgresStorage(pool) {
  if(typeof pool?.query!=='function') throw new Error('PostgreSQL storage requires a database pool');
  async function read(digest,size) {
    if(!valid(digest,size)) throw new Error('Invalid stored object bounds');
    // Filter length before returning bytea; never transfer an unbounded drifted row.
    const {rows:[row]}=await pool.query('SELECT bytes FROM hub_objects WHERE digest=$1 AND size=$2 AND octet_length(bytes)=$2',[digest,size]);
    if(!row || !Buffer.isBuffer(row.bytes) || row.bytes.length!==size || sha256(row.bytes)!==digest) throw new Error('Stored object missing or integrity drift');
    return row.bytes;
  }
  async function put(input) {
    if(!Buffer.isBuffer(input) || input.length<1 || input.length>MAX_OBJECT_BYTES) throw new Error('Invalid stored object bounds');
    const bytes=Buffer.from(input);
    const digest=sha256(bytes);
    await pool.query('INSERT INTO hub_objects(digest,size,bytes) VALUES($1,$2,$3) ON CONFLICT(digest) DO NOTHING',[digest,bytes.length,bytes]);
    await read(digest,bytes.length);
    return {sha256:digest,size:bytes.length};
  }
  return {read,put};
}
