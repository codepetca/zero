'use strict';
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const exec=promisify(execFile);
// Read only the two inert checkout settings from normal effective config.
// Callers isolate executable/global settings during Git operations and pass
// these validated values explicitly to both source and materialized checkouts.
async function conversionSettings(root) {
  const env={...Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/i.test(key))),GIT_TERMINAL_PROMPT:'0'};
  const get=async key=>{
    try {return (await exec('git',['config','--get',key],{cwd:root,env,encoding:'utf8',timeout:10000,maxBuffer:4096})).stdout.trim().toLowerCase();}
    catch(error){if(error.code===1)return '';throw new Error('Could not safely read Git line-ending settings. Check them in native Source Control.');}
  };
  let autocrlf=await get('core.autocrlf');const eol=(await get('core.eol'))||'native';
  if(['true','yes','on','1'].includes(autocrlf))autocrlf='true';
  else if(['','false','no','off','0'].includes(autocrlf))autocrlf='false';
  else if(autocrlf!=='input')throw new Error('This project has an unsupported Git line-ending setting. Check core.autocrlf in native Source Control.');
  if(!['native','lf','crlf'].includes(eol))throw new Error('This project has an unsupported Git line-ending setting. Check core.eol in native Source Control.');
  return {autocrlf,eol};
}
module.exports={conversionSettings};
