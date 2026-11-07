'use strict';
// Conservative naming checks only. They do not establish Windows filesystem
// identity, confinement, durability or permission guarantees.
function safePath(name) {
  return typeof name==='string'&&!!name&&!name.startsWith('/')&&!/[\\\x00-\x1f\x7f]/.test(name)&&!name.split('/').some(part=>!part||part==='.'||part==='..'||part.toLowerCase()==='.git');
}
function portableWindowsPath(name) {
  return safePath(name)&&!name.split('/').some(part=>
    /[<>:"|?*]/.test(part)||/[ .]$/.test(part)||
    /^(?:con|prn|aux|nul|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])$/i.test(part.split('.')[0].replace(/ +$/,'')));
}
const potentialWindowsShortName=name=>name.split('/').some(part=>/~[0-9]+(?:\.|$)/i.test(part));
const fold=name=>name.normalize('NFC').toLowerCase();
const overlaps=(a,b)=>{a=fold(a);b=fold(b);return a===b||a.startsWith(b+'/')||b.startsWith(a+'/');};
// Compare affected paths to all known files, including every directory prefix.
// A spelling collision on any prefix is ambiguous on case-folding filesystems.
function windowsPathsCollide(affected,known) {
  const prefixes=new Map(),targets=new Set(affected.map(fold));
  for(const name of affected) {
    let prefix='';for(const part of name.split('/')) {prefix=prefix?prefix+'/'+part:part;const key=fold(prefix),previous=prefixes.get(key);if(previous!==undefined&&previous!==prefix)return true;prefixes.set(key,prefix);}
  }
  for(const name of known) {
    let prefix='';const parts=name.split('/');for(let i=0;i<parts.length;i++) {prefix=prefix?prefix+'/'+parts[i]:parts[i];const key=fold(prefix),previous=prefixes.get(key);if(previous!==undefined&&previous!==prefix)return true;if(i<parts.length-1&&targets.has(key))return true;}
    if(prefixes.has(fold(name))&&!targets.has(fold(name)))return true;
  }
  return false;
}
module.exports={safePath,portableWindowsPath,potentialWindowsShortName,overlaps,windowsPathsCollide};
