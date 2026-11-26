import assert from 'node:assert/strict';
import {createCipheriv,createDecipheriv,createPrivateKey,createPublicKey,diffieHellman,generateKeyPairSync,hkdfSync,randomBytes} from 'node:crypto';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import net from 'node:net';

const repo = 'codepetca/zero';
const branch = 'codex/zero-089-windows-interactive-proof';
const workflow = 'windows-native.yml';
const invoke = promisify(execFile);
const gh = async args => (await invoke('gh', args, {timeout:18000,maxBuffer:256000})).stdout;
const runPattern = /^\d{5,20}$/;
const publicKeyPattern = /^[A-Za-z0-9_-]{59}$/;
const packetPattern = /^[A-Za-z0-9_-]{30,20000}$/;
const exportKey = key => key.export({type:'spki',format:'der'}).toString('base64url');
const keyPair = () => generateKeyPairSync('x25519');

function sessionKey(privateKey, other, run, direction) {
  assert.match(other,publicKeyPattern);
  assert.match(run,runPattern);
  const publicKey = createPublicKey({key:Buffer.from(other,'base64url'),type:'spki',format:'der'});
  assert.equal(publicKey.asymmetricKeyType,'x25519');
  const shared = diffieHellman({privateKey,publicKey});
  return hkdfSync('sha256',shared,Buffer.from(run),Buffer.from('zero-qa-rdp-v1-' + direction),32);
}

function seal(privateKey, other, run, direction, data) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm',sessionKey(privateKey,other,run,direction),iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data),'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),ciphertext]).toString('base64url');
}

function unseal(privateKey, other, run, direction, packet) {
  assert.match(packet,packetPattern);
  const bytes = Buffer.from(packet,'base64url');
  const cipher = createDecipheriv('aes-256-gcm',sessionKey(privateKey,other,run,direction),bytes.subarray(0,12));
  cipher.setAuthTag(bytes.subarray(12,28));
  return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]));
}

function runner() {
  assert.equal(process.env.GITHUB_ACTIONS,'true');
  assert.equal(process.env.RUNNER_ENVIRONMENT,'github-hosted');
  assert.equal(process.env.GITHUB_REPOSITORY,repo);
  assert.equal(process.env.GITHUB_ACTOR,'armorup');
  assert.equal(process.env.GITHUB_TRIGGERING_ACTOR,'armorup');
  assert.equal(process.env.GITHUB_REF,'refs/heads/' + branch);
  assert.match(process.env.GITHUB_RUN_ID,runPattern);
}

const read = async (directory,name) => JSON.parse((await readFile(join(directory,name + '.json'),'utf8')).replace(/^\uFEFF/,''));
const write = async (directory,name,data) => writeFile(join(directory,name + '.json'),JSON.stringify(data),{mode:0o600,flag:'wx'});

async function begin(directory) {
  runner();
  assert.equal(process.platform,'win32');
  const {publicKey,privateKey} = keyPair();
  const recipient = process.env.ZERO_DESKTOP_RECIPIENT;
  const run = process.env.GITHUB_RUN_ID;
  const nonce = randomBytes(32).toString('base64url');
  const rdp = await read(directory,'private-rdp');
  await rm(join(directory,'private-rdp.json'),{force:true});
  await write(directory,'private-channel',{recipient,nonce,key:privateKey.export({type:'pkcs8',format:'pem'})});
  await write(directory,'envelope',{key:exportKey(publicKey),data:seal(privateKey,recipient,run,'bootstrap',{rdp,nonce})});
}

async function reply(directory) {
  runner();
  const run = process.env.ZERO_DESKTOP_PARENT;
  const data = process.env.ZERO_DESKTOP_PACKET;
  assert.match(run,runPattern);
  assert.match(data,packetPattern);
  await mkdir(directory,{recursive:true});
  await write(directory,'envelope',{data});
}

async function download(run,name,directory) {
  await gh(['run','download',run,'--repo',repo,'--name',name,'--dir',directory]);
  return read(directory,'envelope');
}

async function host(directory) {
  runner();
  assert.equal(process.platform,'win32');
  const parent = process.env.GITHUB_RUN_ID;
  const name = 'zero-qa-desktop-reply-' + parent;
  const state = await read(directory,'private-channel');
  const privateKey = createPrivateKey(state.key);
  const received = join(directory,'received');
  try {
    const deadline = Date.now() + 7*60*1000;
    while (Date.now() < deadline) {
      const data = JSON.parse(await gh(['api','--method','GET','repos/' + repo + '/actions/artifacts',
        '-f','name=' + name,'-f','per_page=10']));
      for (const artifact of data.artifacts.filter(item => !item.expired && item.name === name &&
          item.workflow_run?.head_sha === process.env.GITHUB_SHA)) {
        let response;
        try {
          await rm(received,{recursive:true,force:true});
          const packet = await download(String(artifact.workflow_run.id),name,received);
          response = unseal(privateKey,state.recipient,parent,'tunnel',packet.data);
        } catch { continue; }
        if (response.nonce !== state.nonce) continue;
        assert.match(response.id,/^zeroqa-[a-f0-9]{10}(?:\.[a-z0-9]{2,12})?$/);
        assert.match(response.token,/^[A-Za-z0-9_.-]{30,10000}$/);
        const executable = join(directory,'devtunnel.exe');
        const processInfo = spawn(executable,['host',response.id,'--access-token','-'],{
          windowsHide:true,detached:true,stdio:['pipe','ignore','ignore'],
          env:Object.fromEntries(Object.entries(process.env).filter(([name]) => !/TOKEN|SECRET|ZERO_DESKTOP_/i.test(name))),
        });
        processInfo.stdin.on('error',() => {});
        processInfo.stdin.end(response.token + '\n');
        await new Promise((resolve,reject) => {
          processInfo.once('spawn',resolve);
          processInfo.once('error',reject);
        });
        await sleep(3000);
        assert.equal(processInfo.exitCode,null,'The Windows Dev Tunnels host exited during startup.');
        processInfo.unref();
        await write(directory,'host-process',{pid:processInfo.pid});
        console.log('The authorized private tunnel host was started.');
        return;
      }
      await sleep(4000);
    }
    throw Error('No private host configuration was received.');
  } finally {
    await rm(join(directory,'private-channel.json'),{force:true});
    await rm(received,{recursive:true,force:true});
  }
}

async function dispatch(mode,fields) {
  const args = ['workflow','run',workflow,'--repo',repo,'--ref',branch,'-f','version=0.5.89','-f','mode=' + mode];
  for (const [key,value] of Object.entries(fields)) args.push('-f',key + '=' + value);
  const output = (await gh(args)).trim();
  const run = output.match(/^https:\/\/github\.com\/codepetca\/zero\/actions\/runs\/(\d+)$/)?.[1];
  assert.match(run ?? '',runPattern);
  return run;
}

function connectable(port) {
  return new Promise(resolve => {
    const socket = net.connect(port,'127.0.0.1');
    socket.setTimeout(700);
    socket.once('connect',() => {socket.destroy();resolve(true);});
    socket.once('timeout',() => {socket.destroy();resolve(false);});
    socket.once('error',() => resolve(false));
  });
}

async function local(directory,devtunnel,rdpClient) {
  assert.notEqual(process.env.GITHUB_ACTIONS,'true');
  const dt = async (...args) => (await invoke(devtunnel,args,{timeout:20000,maxBuffer:50000})).stdout;
  const login = JSON.parse(await dt('user','show','--json'));
  assert.ok(login.status && !/not logged in|signed out/i.test(String(login.status)),
    'The Mac is waiting for Microsoft Dev Tunnels activation.');
  assert.equal(await connectable(3389),false,'RDP local port already in use.');
  const {publicKey,privateKey} = keyPair();
  const remoteSha = (await gh(['api','repos/' + repo + '/branches/' + encodeURIComponent(branch),'--jq','.commit.sha'])).trim();
  assert.equal((await invoke('git',['rev-parse','HEAD'])).stdout.trim(),remoteSha);
  const run = await dispatch('desktop',{recipient:exportKey(publicKey)});
  console.log('Windows QA run: https://github.com/codepetca/zero/actions/runs/' + run);
  const deadline = Date.now() + 10*60*1000;
  let envelope;
  while (!envelope && Date.now() < deadline) {
    envelope = await download(run,'zero-qa-desktop-' + run,directory).catch(() => null);
    if (!envelope) {
      const remote = JSON.parse(await gh(['run','view',run,'--repo',repo,'--json','headSha,status']));
      assert.equal(remote.headSha,remoteSha);
      if (remote.status === 'completed') throw Error('The Windows desktop preflight ended early.');
      await sleep(4000);
    }
  }
  assert.ok(envelope,'The encrypted desktop bootstrap did not become available.');
  const {rdp,nonce} = unseal(privateKey,envelope.key,run,'bootstrap',envelope.data);
  console.log('The Windows runner prepared the scoped Remote Desktop session.');
  assert.equal(rdp.user,'runneradmin');
  assert.match(rdp.computer,/^[A-Za-z0-9-]{1,32}$/);
  assert.match(rdp.fingerprint,/^[a-fA-F0-9]{64}$/);
  assert.match(rdp.password,/^Za1![a-fA-F0-9]{64}$/);
  const id = 'zeroqa-' + randomBytes(5).toString('hex');
  let tunnel;
  let client;
  let creating;
  let cleaning;
  const cleanup = () => cleaning ??= (async () => {
    client?.kill();
    tunnel?.kill();
    if (!creating) return;
    const created = await creating.then(() => true,() => false);
    if (!created) return;
    try {
      await dt('delete',id,'--force');
      console.log('The temporary private tunnel was deleted.');
    } catch {
      console.error('Tunnel deletion could not be verified. Its one-hour expiration remains in effect.');
    }
  })();
  const interrupt = () => { void cleanup().finally(() => process.exit(130)); };
  process.once('SIGINT',interrupt);
  process.once('SIGTERM',interrupt);
  try {
    creating = dt('create',id,'--expiration','1h','--description','Disposable Zero Windows lesson QA','--json');
    const created = JSON.parse(await creating);
    const cluster = created.clusterId ?? created.tunnel?.clusterId;
    const reference = /^[a-z0-9]{2,12}$/.test(cluster ?? '') ? id + '.' + cluster : id;
    await write(directory,'cleanup-tunnel',{id:reference});
    await dt('port','create',reference,'--port-number','3389');
    const acl = await dt('access','list',reference,'--json');
    assert.doesNotMatch(acl,/"allowAnonymous"\s*:\s*true|"anonymous"/i,'The temporary tunnel unexpectedly allows anonymous access.');
    console.log('The private tunnel and its single desktop port are configured.');
    const output = await dt('token',reference,'--scope','host','--json');
    const tokenData = JSON.parse(output);
    const token = tokenData.accessToken ?? tokenData.token;
    assert.match(token,/^[A-Za-z0-9_.-]{30,10000}$/);
    const data = seal(privateKey,envelope.key,run,'tunnel',{id:reference,token,nonce});
    await dispatch('relay',{parent:run,packet:data});
    console.log('The one-tunnel host configuration was sent to the Windows VM.');
    const connectDeadline = Date.now()+150000;
    do {
      if (!tunnel || tunnel.exitCode !== null) {
        tunnel = spawn(devtunnel,['connect',reference],{stdio:'ignore'});
      }
      if (await connectable(3389)) break;
      await sleep(3500);
    } while (Date.now()<connectDeadline);
    assert.ok(await connectable(3389),'The private RDP forwarding was not ready.');
    const pin = rdp.fingerprint.match(/.{2}/g).join(':');
    const config = await mkdir(join(directory,'rdp-client'),{recursive:true});
    client = spawn(rdpClient,['/v:127.0.0.1:3389','/u:' + rdp.user,'/d:' + rdp.computer,
      '/cert:deny,fingerprint:sha256:' + pin,'/sec:nla','/from-stdin:force','-clipboard','/log-level:ERROR',
      '/size:1280x850','/admin'],{stdio:['pipe','ignore','pipe'],
      env:{...process.env,XDG_CONFIG_HOME:config}});
    client.stdin.on('error',() => {});
    const diagnostics = new Set();
    client.stderr.on('data',data => {
      for (const entry of data.toString('utf8').matchAll(/\b(?:ERRCONNECT|ERRINFO)_[A-Z_]{3,45}\b/g)) diagnostics.add(entry[0]);
    });
    client.stdin.end(rdp.password + '\n');
    await sleep(7000);
    if (client.exitCode !== null) {
      console.error('The private RDP client exited during startup.' + (diagnostics.size ? ' ' + [...diagnostics].join(', ') : ''));
      throw Error('Remote Desktop connection did not open.');
    }
    console.log('Private Windows Desktop is open on the Mac.');
    const result = await invoke('gh',['run','watch',run,'--repo',repo,'--interval','10','--exit-status'],{
      timeout:22*60*1000,maxBuffer:300000,
    });
    assert.ok(result.stdout);
    console.log('The hosted Windows exercise completed.');
  } finally {
    process.removeListener('SIGINT',interrupt);
    process.removeListener('SIGTERM',interrupt);
    await cleanup();
  }
}

async function main() {
  const [action,directory,...extra] = process.argv.slice(2);
  if (action === 'begin') return begin(directory);
  if (action === 'reply') return reply(directory);
  if (action === 'host') return host(directory);
  if (action === 'local') return local(directory,...extra);
  throw Error('Unknown desktop setup phase.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(error => {
    // Do not log subprocess errors. They may contain a scoped token or capsule.
    console.error(error.code === 'ERR_ASSERTION' && !error.generatedMessage ? error.message : 'The private QA desktop setup ended.');
    process.exitCode = 1;
  });
}
export {keyPair,exportKey,seal,unseal};
