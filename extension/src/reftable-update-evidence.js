'use strict';
// Read-only, fail-closed prerequisite for future ordinary reftable updates.
// A successful result is meaningful only while the caller also holds and
// verifies Git's prepared reftable transaction against cooperating writers.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const execute=promisify(execFile),fail=()=>new Error('Git update evidence could not be verified. Inspect Source Control; all commits are kept.');
async function assertNoRetiredUpdateEvidence(root,{timeout=15000}={}){
 if(typeof root!=='string'||!path.isAbsolute(root)||!Number.isSafeInteger(timeout)||timeout<1||timeout>30000||Object.keys(process.env).some(k=>/^GIT_(?:DIR|COMMON_DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|NAMESPACE|REPLACE_REF_BASE|GRAFT_FILE|CONFIG_COUNT|CONFIG_PARAMETERS)$/i.test(k)))throw fail();
 const dot=path.join(root,'.git');for(const p of [root,dot]){const s=await fs.lstat(p);if(!s.isDirectory()||s.isSymbolicLink()||await fs.realpath(p)!==p)throw fail();}
 const env={...Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^GIT_/i.test(k))),GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull,GIT_NO_REPLACE_OBJECTS:'1',GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0',GIT_OPTIONAL_LOCKS:'0'},git=async(args,allowAbsent=false)=>{try{const {stdout}=await execute('git',['-c',`core.hooksPath=${os.devNull}`,'-c','core.fsmonitor=false',...args],{cwd:root,env,timeout,maxBuffer:1024*1024,encoding:'utf8'});return stdout;}catch(error){if(allowAbsent&&error.code===1&&!error.killed)return '';throw fail();}};
 if((await git(['rev-parse','--show-ref-format'])).trim()!=='reftable')throw fail();
 const checkConfiguration=async()=>{const overrides=await git(['config','--name-only','--get-regexp','^(fsck\\.|fetch\\.fsck|receive\\.fsck|transfer\\.fsck|extensions\\.partialclone$|remote\\..*\\.promisor$|remote\\..*\\.partialclonefilter$)'],true);if(overrides.trim())throw fail();
 for(const name of ['objects/info/alternates','objects/info/http-alternates','shallow']){try{await fs.lstat(path.join(dot,name));throw fail();}catch(e){if(e.code!=='ENOENT')throw e;}}
 for(const dir of [path.join(dot,'objects'),path.join(dot,'objects','info'),path.join(dot,'objects','pack')]){const info=await fs.lstat(dir);if(!info.isDirectory()||info.isSymbolicLink()||await fs.realpath(dir)!==dir)throw fail();}
 const pack=path.join(dot,'objects','pack');for(const name of await fs.readdir(pack))if(name.endsWith('.promisor'))throw fail();};
 await checkConfiguration();
 await git(['fsck','--connectivity-only','--no-reflogs']);
 if((await git(['for-each-ref','--format=%(refname)','refs/zero/retired-finish/'])).trim())throw fail();
 if((await git(['for-each-ref','--format=%(refname)','refs/zero/pending-finish'])).trim())throw fail();
 await checkConfiguration();
}
module.exports={assertNoRetiredUpdateEvidence};
