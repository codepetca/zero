'use strict';
const fs = require('node:fs');
const path = require('node:path');
const DEFAULTS = Object.freeze({schema:1, catalogUrl:'https://zero.codepet.ca/api/sharing/catalog/web', artifactOrigin:'', policyRevision:''});
function validateKitConfiguration(input) {
  if (!input || input.schema !== 1 || Object.keys(input).some(key=>!Object.hasOwn(DEFAULTS,key)) || Object.keys(DEFAULTS).some(key=>!Object.hasOwn(input,key))) throw new Error('Invalid bundled sharing configuration.');
  const url = new URL(input.catalogUrl);
  if (url.protocol!=='https:' || url.username || url.password || url.hash || url.search || url.href!==input.catalogUrl) throw new Error('Use an exact HTTPS catalog URL.');
  if (!input.artifactOrigin && !input.policyRevision) return {...input};
  const origin = new URL(input.artifactOrigin);
  if (origin.origin!==input.artifactOrigin || origin.protocol!=='https:' || !/^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/.test(origin.hostname) || !/^[a-f0-9]{40}$/.test(input.policyRevision)) throw new Error('Sharing requires the configured public Blob origin and exact reviewed policy revision.');
  return {...input};
}
function readKitConfiguration(extensionPath) {
  const filename=path.join(extensionPath,'media/sharing-config.json');
  let bytes;
  try {bytes=fs.readFileSync(filename);} catch(error) {if(error.code==='ENOENT')return {...DEFAULTS};throw error;}
  if(bytes.length>4096)throw new Error('Bundled sharing configuration exceeds limits.');
  return validateKitConfiguration(JSON.parse(bytes.toString('utf8')));
}
module.exports={DEFAULTS,validateKitConfiguration,readKitConfiguration};
