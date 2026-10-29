import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {buildReleasePair} from './build-release-pair.mjs';
import {sha256,storeIdentity} from './windows-msix.mjs';
const version='0.5.56',sourceRevision='a'.repeat(40),signIdentity='B'.repeat(40);
const measure=(filename,bytes)=>({filename,size:bytes.length,sha256:sha256(bytes)});
function fixture() {
 const base=mkdtempSync(join(tmpdir(),'zero-build-pair-')),root=join(base,'repo');mkdirSync(root);
 const packager=join(base,'makemsix');writeFileSync(packager,'tool');chmodSync(packager,0o700);
 const output=join(base,'receipt.json');
 const put=(name,obj)=>{const p=join(root,name);mkdirSync(join(p,'..'),{recursive:true});writeFileSync(p,typeof obj==='string'?obj:JSON.stringify(obj));};
 const release={schema:1,kitVersion:version,coreVersion:'0.3.0',publication:{status:'local',repository:'codepetca/zero',tag:`v${version}`},assets:{kit:{filename:'zero-bootstrap.zip',label:'kit'},extension:{filename:`zero-${version}.vsix`,label:'extension'}}};
 put('release/kit.json',release);put('extension/package.json',{version});put('framework/pom.xml','<artifactId>zero-core</artifactId>\n  <version>0.3.0</version>');
 const calls=[],kitBytes=Buffer.from('kit'),kit=measure('zero-bootstrap.zip',kitBytes), macBytes=Buffer.from('mac'),winBytes=Buffer.from('msix');
 let dirty=false,mutateMac=()=>{},mutateWin=()=>{};
 const run=(cmd,args)=>{
  calls.push([cmd,...args]);
  if(cmd==='git') return args[0]==='rev-parse'?sourceRevision:dirty?'changed':'';
  if(cmd==='npm' && args[1]==='package') {put('dist/zero-bootstrap.zip',kitBytes.toString());put('dist/release.json',{...release,assets:{kit}});}
  if(args[0]==='scripts/build-installers.mjs') {const a={...measure(`Zero-${version}-macos.dmg`,macBytes),platform:'macos',developerIdSigned:true,notarized:false,signing:{identitySha1:signIdentity}};const m={schema:1,kitVersion:version,sourceRevision,sourceDirty:false,kit,artifacts:[a]};mutateMac(m);put(`dist/installers/${a.filename}`,macBytes.toString());put('dist/installers/build-macos-signed.json',m);}
  if(args[0]==='scripts/build-windows-msix.mjs') {const a=measure(`Zero-${version}-msix-store-x64.msix`,winBytes);const w={schema:1,kind:'msix-store',kitVersion:version,packageVersion:'1.5.56.0',sourceRevision,sourceDirty:false,kit,identity:storeIdentity,architecture:'x64',unsigned:true,packager:{kind:'makemsix',roundTripPassed:true,sha256:sha256(Buffer.from('tool'))},artifact:a};mutateWin(w);put(`dist/msix/${a.filename}`,winBytes.toString());put('dist/msix/build-msix.json',w);}
  return '';
 };
 return {base,root,packager,output,version,sourceRevision,signIdentity,host:'darwin',run,calls,setDirty:()=>dirty=true,mutateMac:fn=>mutateMac=fn,mutateWin:fn=>mutateWin=fn};
}
test('builds in order and records local-only limitations',()=>{const f=fixture();try {const r=buildReleasePair(f);assert.equal(r.kitVersion,version);assert.match(r.limitations.join(' '),/not notarized/);assert.equal(JSON.parse(readFileSync(f.output)).sourceRevision,sourceRevision);const commands=f.calls.filter(c=>c[0]!=='git');assert.deepEqual(commands.map(c=>c[1]),['run','run','scripts/build-installers.mjs','scripts/build-windows-msix.mjs']);assert.throws(()=>buildReleasePair(f),/already exists/);}finally{rmSync(f.base,{recursive:true,force:true});}});
test('preflight rejects prior builds and dirty source before execution',()=>{for(const change of [f=>mkdirSync(join(f.root,'dist')),f=>f.setDirty(),f=>f.host='linux',f=>f.signIdentity='bad']){const f=fixture();try{change(f);assert.throws(()=>buildReleasePair(f));assert.equal(f.calls.filter(c=>c[0]!=='git').length,0);}finally{rmSync(f.base,{recursive:true,force:true});}}});
test('rejects mismatched generated receipts without sealing',()=>{for(const change of [f=>f.mutateMac(m=>m.sourceDirty=true),f=>f.mutateMac(m=>m.artifacts[0].notarized=true),f=>f.mutateWin(w=>w.kit.sha256='c'.repeat(64)),f=>f.mutateWin(w=>w.packageVersion='0.5.56.0')]){const f=fixture();try{change(f);assert.throws(()=>buildReleasePair(f));assert.throws(()=>readFileSync(f.output));}finally{rmSync(f.base,{recursive:true,force:true});}}});
