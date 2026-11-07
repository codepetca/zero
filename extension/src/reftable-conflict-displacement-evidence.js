'use strict';
// Read-only, non-authorizing inspection of proposed helper journal records.
// Records are assertions, not proof of filesystem state or permission to retry.
const fail=()=>new Error('Displacement evidence is incomplete or invalid. Keep all copies and inspect both locations.');
const limit=256*1024,uint64=18446744073709551615n;
function object(value,keys){return Boolean(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('\0')===[...keys].sort().join('\0'));}
function decimal(value){if(typeof value!=='string'||!/^(?:0|[1-9][0-9]{0,19})$/.test(value))return false;try{return BigInt(value)<=uint64;}catch{return false;}}
function entry(value){return object(value,['dev','ino'])&&decimal(value.dev)&&decimal(value.ino);}
function leaf(value){return typeof value==='string'&&value.length>0&&Buffer.byteLength(value)<=255&&value!=='.'&&value!=='..'&&!/[\x00-\x1f\x7f/\\]/.test(value)&&!value.includes('\ufffd');}
function errorNumber(value){return Number.isSafeInteger(value)&&value>=0&&value<=4095;}
function reported(result,exit,expected){
 if(!object(result,result?.status==='refused'?['version','status','reason','errno']:result?.status==='moved-unverified'?['version','status','errno']:['version','status','matched','movedDev','movedIno','movedMode','movedSize','sourcePresent','sourceErrno','sourceDirSyncErrno','retentionDirSyncErrno'])||result.version!==1)return null;
 if(result.status==='refused'){if(exit!==2||!['invalid-request','source-directory','retention-directory','directory-identity','cross-device','source-open','source-identity','exclusive-move'].includes(result.reason)||!errorNumber(result.errno))return null;return 'refused';}
 if(result.status==='moved-unverified'){if(exit!==3||!errorNumber(result.errno)||result.errno===0)return null;return 'uncertain';}
 if(result.status!=='moved'||![0,3].includes(exit)||typeof result.matched!=='boolean'||!decimal(result.movedDev)||!decimal(result.movedIno)||!decimal(result.movedSize)||!Number.isSafeInteger(result.movedMode)||result.movedMode<0||result.movedMode>65535||typeof result.sourcePresent!=='boolean'||![result.sourceErrno,result.sourceDirSyncErrno,result.retentionDirSyncErrno].every(errorNumber))return null;
 const same=result.movedDev===expected.dev&&result.movedIno===expected.ino,clean=result.matched&&same&&(result.movedMode&0o170000)===0o100000&&!result.sourcePresent&&result.sourceErrno===2&&result.sourceDirSyncErrno===0&&result.retentionDirSyncErrno===0;
 if(exit===0&&!clean)return null;return clean&&exit===0?'reported-ok':'uncertain';
}
function inspectDisplacementEvidence(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length===0||bytes.length>limit)throw fail();let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw fail();}if(!text.endsWith('\n')||text.includes('\0'))throw fail();const lines=text.slice(0,-1).split('\n');if(lines.length<1||lines.length>5||lines.some(x=>!x||Buffer.byteLength(x)>16384))throw fail();let rows;try{rows=lines.map(x=>JSON.parse(x));}catch{throw fail();}
 const start=rows[0],keys=['version','event','evidenceHash','sourceDirectory','retentionDirectory','sourceFile','preparedFile','sourceLeaf','retainedLeaf','preparedLeaf'];if(!object(start,keys)||start.version!==1||start.event!=='start'||!/^[0-9a-f]{64}$/.test(start.evidenceHash||'')||![start.sourceDirectory,start.retentionDirectory,start.sourceFile,start.preparedFile].every(entry)||![start.sourceLeaf,start.retainedLeaf,start.preparedLeaf].every(leaf)||start.retainedLeaf===start.preparedLeaf)throw fail();
 let state='reported-prepared',next='displace-intent';for(let i=1;i<rows.length;i++){const row=rows[i];if(!row||row.event!==next)throw fail();if(next.endsWith('-intent')){if(!object(row,['event']))throw fail();state=next==='displace-intent'?'displacement-outcome-unknown':'installation-outcome-unknown';next=next==='displace-intent'?'displace-result':'install-result';continue;}if(!object(row,['event','exit','response'])||!Number.isInteger(row.exit))throw fail();const phase=next==='displace-result'?'displacement':'installation',verdict=reported(row.response,row.exit,phase==='displacement'?start.sourceFile:start.preparedFile);if(!verdict||verdict==='reported-ok'&&start.sourceDirectory.dev!==start.retentionDirectory.dev)throw fail();state=verdict==='reported-ok'?`reported-${phase==='displacement'?'displaced':'installed'}`:verdict==='refused'?`reported-${phase}-refused`:`${phase}-outcome-unknown`;next=phase==='displacement'&&verdict==='reported-ok'?'install-intent':null;}
 return Object.freeze({state,recordCount:rows.length,evidenceHash:start.evidenceHash,authorizesMutation:false,safeToRetry:false});
}
module.exports={inspectDisplacementEvidence};
