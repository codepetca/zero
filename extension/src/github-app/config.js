'use strict';
const pinned = require('./config.json');
const PERMISSIONS = Object.freeze({metadata:'read',repository_creation:'write',contents:'write',workflows:'write',actions:'write',pages:'write',starring:'write'});
// Accept the staged Pages-setup grant before and after the App registration is
// updated. Existing installations still work for operations that do not need it.
const OPTIONAL_PERMISSIONS = Object.freeze({administration:'write'});
function githubAppConfiguration(value = pinned) {
  const keys=['schema','status','owner','appId','clientId','slug','websiteOrigin'];
  if (!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(key=>!keys.includes(key)) ||
      keys.some(key=>!Object.hasOwn(value,key)) || value.schema!==1 || value.owner!=='codepetca' || value.websiteOrigin!=='https://zero.codepet.ca') throw Error('Zero GitHub App configuration is invalid.');
  if(value.status==='unconfigured' && value.appId===null && value.clientId===null && value.slug===null)return null;
  if(value.status!=='configured' || !Number.isSafeInteger(value.appId) || value.appId<1 || typeof value.clientId!=='string' || !/^Iv[0-9A-Za-z_-]{8,126}$/.test(value.clientId) || typeof value.slug!=='string' || !/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/.test(value.slug))throw Error('Zero GitHub App configuration is invalid.');
  return Object.freeze({...value,permissions:PERMISSIONS,optionalPermissions:OPTIONAL_PERMISSIONS});
}
module.exports={githubAppConfiguration,PERMISSIONS,OPTIONAL_PERMISSIONS};
