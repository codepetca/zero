import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {validatePublishedInstaller} from './installer.mjs';
import {readMacUpdaterConfig} from '../../scripts/mac-updater.mjs';
import {validateMacUpdateFeed,selectFeedInstaller} from '../../scripts/mac-update-feed.mjs';

async function optionalJSON(file) {
  try {return JSON.parse(await readFile(file,'utf8'));}
  catch(error) {if(error.code!=='ENOENT') throw error;return null;}
}
export async function loadUpdateFeed(root,kit,installer) {
  const snapshot=await optionalJSON(resolve(root,'release/published-installer.json'));
  const published=validatePublishedInstaller(snapshot,kit);
  const manifest=await optionalJSON(resolve(root,'release/mac-update-feed.json'));
  if(!manifest) return null;
  const bytes=await readFile(resolve(root,'release/mac-appcast.xml'));
  validateMacUpdateFeed(manifest,readMacUpdaterConfig(root),selectFeedInstaller(manifest,installer,published),bytes,{allowLocal:true});
  return manifest.publication.status==='published' ? bytes.toString('utf8') : null;
}
