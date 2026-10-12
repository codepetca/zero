import http from 'node:http';
import path from 'node:path';
import pg from 'pg';
import * as checker from '../checker/runner.mjs';
import {createHub} from './hub.mjs';

const origin = process.env.ZERO_HUB_ORIGIN;
const storageRoot = process.env.ZERO_HUB_STORAGE;
const connectionString = process.env.ZERO_HUB_DATABASE_URL;
if (!origin || !storageRoot || !connectionString) throw new Error('Set ZERO_HUB_ORIGIN, ZERO_HUB_STORAGE and ZERO_HUB_DATABASE_URL');
const port = Number(process.env.ZERO_HUB_PORT ?? 8788);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('Invalid hub port');
const localIdentity = process.env.ZERO_HUB_LOCAL_IDENTITY === '1' ? {id:process.env.ZERO_HUB_LOCAL_GITHUB_ID,login:process.env.ZERO_HUB_LOCAL_GITHUB_LOGIN} : undefined;
if (process.env.ZERO_HUB_LOCAL_IDENTITY && process.env.ZERO_HUB_LOCAL_IDENTITY !== '1') throw new Error('Local identity requires an explicit 1');
const oauth = process.env.ZERO_HUB_GITHUB_CLIENT_ID || process.env.ZERO_HUB_GITHUB_CLIENT_SECRET ? {clientId:process.env.ZERO_HUB_GITHUB_CLIENT_ID,clientSecret:process.env.ZERO_HUB_GITHUB_CLIENT_SECRET} : undefined;
const pool = new pg.Pool({connectionString,max:5});
const hub = createHub({pool,storageRoot:path.resolve(storageRoot),checker,origin,localIdentity,oauth});
await hub.migrate();
const server = http.createServer(hub.handler);
server.requestTimeout = 30000;
server.headersTimeout = 15000;
await new Promise((resolve,reject)=>server.once('error',reject).listen(port,'127.0.0.1',resolve));
hub.startWorkers();
console.log(`Zero hub listening on http://127.0.0.1:${port}; ${localIdentity?'explicit local test identity':'GitHub authentication requires configured OAuth'}`);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  server.close();
  await hub.stop();
  await pool.end();
}
process.on('SIGINT',()=>close().finally(()=>process.exit(0)));
process.on('SIGTERM',()=>close().finally(()=>process.exit(0)));
