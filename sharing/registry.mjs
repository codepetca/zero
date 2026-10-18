import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm, stat, open } from 'node:fs/promises';
import path from 'node:path';

export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  if (value === undefined) throw new Error('Undefined ledger field');
  return JSON.stringify(value);
}
export const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonical(value)).digest('hex');
export const initialState = () => ({schema: 1, sequence: 0, items: {}, requests: {}, releases: {}, availability: [], catalog: null, inbox:{page:1,offset:0},libraryInbox:{page:1,offset:0}});
export const revisionOf = state => digest(state);

async function reclaimDeadLock(lock) {
  // Reapers serialize separately and re-read ownership inside this guard. Two
  // stale observers must never remove a replacement lock created by a live writer.
  const guard = lock + '.reclaim';
  try { await mkdir(guard); } catch (error) { if (error.code === 'EEXIST') return; throw error; }
  try {
    try {
      const pid = Number(await readFile(path.join(lock,'owner'),'utf8'));
      if (!Number.isSafeInteger(pid) || pid < 1) return;
      try { process.kill(pid,0); }
      catch (error) { if (error.code === 'ESRCH') await rm(lock,{recursive:true,force:true}); }
    } catch (error) {
      if (error.code === 'ENOENT' && Date.now()-(await stat(lock).catch(()=>({mtimeMs:Date.now()}))).mtimeMs > 30000) await rm(lock,{recursive:true,force:true});
    }
  } finally { await rm(guard,{recursive:true,force:true}); }
}

/** The same read/CAS adapter can commit one tree on a Git registry branch.
 * A false CAS result always re-reads and revalidates; no force-write retry. */
export class FileRegistry {
  constructor({file, adapter, maxRetries = 512, maxRequests = 50000} = {}) {
    if (!file && !adapter) throw new Error('Registry file or atomic adapter required');
    this.file = file && path.resolve(file);
    this.adapter = adapter;
    this.maxRetries = maxRetries;
    this.maxRequests = maxRequests;
  }
  async read() {
    if (this.adapter) return this.adapter.read();
    try {
      const state = JSON.parse(await readFile(this.file, 'utf8'));
      if (state.schema !== 1 || !Number.isSafeInteger(state.sequence)) throw new Error('Invalid registry schema');
      return {state, revision: revisionOf(state)};
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const state = initialState();
      return {state, revision: revisionOf(state)};
    }
  }
  async compareAndSwap(expected, next) {
    if (this.adapter) return this.adapter.compareAndSwap(expected, next);
    await mkdir(path.dirname(this.file), {recursive: true});
    const lock = this.file + '.lock';
    let acquired = false;
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        await mkdir(lock);
        acquired = true;
        await writeFile(path.join(lock, 'owner'), String(process.pid));
        break;
      } catch (error) {
        if (acquired) { await rm(lock, {recursive: true, force: true}); throw error; }
        if (error.code !== 'EEXIST') throw error;
        // Only reclaim a demonstrably dead process. A fresh owner-less lock may
        // still be between mkdir and write; its age prevents that race.
        await reclaimDeadLock(lock);
        await new Promise(resolve => setTimeout(resolve, 5 + Math.random() * 10));
      }
    }
    if (!acquired) throw new Error('Registry busy; retry reconciliation');
    const temporary = this.file + '.' + randomUUID() + '.tmp';
    try {
      if ((await this.read()).revision !== expected) return false;
      const handle = await open(temporary, 'wx', 0o600);
      try { await handle.writeFile(canonical(next) + '\n'); await handle.sync(); } finally { await handle.close(); }
      await rename(temporary, this.file);
      const directory = await open(path.dirname(this.file), 'r');
      try { await directory.sync(); } finally { await directory.close(); }
      return true;
    } finally {
      await rm(temporary, {force: true});
      await rm(lock, {recursive: true, force: true});
    }
  }
  async update(change) {
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      const {state, revision} = await this.read();
      const next = structuredClone(state);
      // change must be pure: CAS retries may call it again.
      const value = change(next);
      if (value && typeof value.then === 'function') throw new Error('Registry mutation must be synchronous');
      if (canonical(next) === canonical(state)) return {value, state, revision};
      if (Object.keys(next.requests).length > this.maxRequests) throw new Error('Registry capacity reached; requests remain in GitHub inbox');
      next.sequence = state.sequence + 1;
      if (await this.compareAndSwap(revision, next)) return this.adapter ? {value,...await this.read()} : {value, state: next, revision: revisionOf(next)};
    }
    throw new Error('Registry changed repeatedly; retry reconciliation');
  }
}

export function releaseKey(identity, version) { return `${identity.kind}/${identity.id}/${version}`; }

export function appendAttempt(record, attempt) {
  // Operational summaries are bounded; requests and immutable releases are not
  // dropped when a runner retries. They remain the authoritative recovery inputs.
  record.attempts.push({...attempt, number: (record.attemptCount || 0) + 1});
  record.attemptCount = (record.attemptCount || 0) + 1;
  record.attempts = record.attempts.slice(-32);
}
