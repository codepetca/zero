import {appendFileSync, readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {validateInstallerManifest} from '../website/lib/installer.mjs';
import {validateMacUpdateFeed} from './mac-update-feed.mjs';

export const groups=['source','native','browser','windows','website','sharing','lessons'];
const full=()=>Object.fromEntries(groups.map(name=>[name,true]));
const ui=new Set(['extension/src/start-page.js','extension/src/sidebar-style.js','extension/src/sidebar-script.js','extension/src/sidebar-icons.js','extension/src/ui-controls.js',
  'extension/test/start-page.test.js','extension/test/sidebar.test.js','extension/test/ui-controls.test.js']);
const sharedDesign=new Set(['design/tokens.json','design/adapters.mjs','design/prepare.mjs','extension/media/controls.css','extension/media/sidebar.css']);
const dev=new Set(['Zero Dev.command','scripts/zero-dev.test.mjs','.vscode/launch.json']);
const websiteConfig=new Set(['website/package.json','website/package-lock.json','website/tsconfig.json','website/next.config.ts']);
const scopeTools=new Set(['scripts/ci-scope.mjs','scripts/ci-scope.test.mjs']);
const publicationMetadata=new Set(['release/kit.json','release/published-kit.json','release/installer.json',
  'release/published-installer.json','release/mac-appcast.xml','release/mac-update-feed.json']);

// Deliberately a small allowlist. Unknown/shared executable inputs retain every
// existing lane. Renames are read as a deletion plus addition, so the old scope
// cannot disappear when a file moves into a narrower category.
export function classify(files, {kitPublicationPromotion = false} = {}) {
  if(!Array.isArray(files)||!files.length)return full();
  const selected=Object.fromEntries(groups.map(name=>[name,false]));
  const add=(...names)=>names.forEach(name=>selected[name]=true);
  for(const file of files) {
    if(typeof file!=='string'||/[\\\x00-\x1f\x7f]/.test(file)||file.split('/').some(part=>!part||part==='.'||part==='..'))return full();
    if(file==='AGENTS.md'||file==='design.md'||/^\.ai\/.*\.md$/.test(file))continue;
    if(file==='README.md'||/^docs\/.*\.(md|png|jpe?g|svg|css)$/.test(file)){add('website');continue;}
    // Only scopeForEvent can establish this from both committed manifests.
    // Source release guards and website validation still run; no immutable kit
    // is rebuilt. Any other changed shared/runtime input retains full coverage.
    if(kitPublicationPromotion&&publicationMetadata.has(file)){add('source','website');continue;}
    // A verified publication promotion may carry its classifier correction;
    // selection/gate contracts still run. Standalone CI edits, caller workflows,
    // gates and all other CI tooling retain the existing full matrix.
    if(kitPublicationPromotion&&scopeTools.has(file)){add('source','website');continue;}
    if(dev.has(file))continue; // Always-run Dev contracts cover these inputs.
    if(file==='scripts/zero-dev.mjs'||file.startsWith('scripts/dev/')){add('native');continue;}
    if(ui.has(file)||file.startsWith('design/playground/')){add('source');continue;}
    if(sharedDesign.has(file)){add('source','website');continue;}
    // Website libraries/scripts also feed release and lesson generation. Only
    // known site-only directories/configurations receive this narrow scope.
    if(websiteConfig.has(file)||/^website\/(app|components|styles|tests|public|content)\//.test(file)){add('website');continue;}
    return full();
  }
  return selected;
}
export function isKitPublicationPromotion(before, after) {
  const keys=(value,names)=>value&&typeof value==='object'&&!Array.isArray(value)&&
    isDeepStrictEqual(Object.keys(value).sort(),[...names].sort());
  if(!keys(before,['schema','kitVersion','coreVersion','publication','assets'])||
      !keys(after,['schema','kitVersion','coreVersion','publication','assets'])||before.schema!==1||
      !/^\d+\.\d+\.\d+$/.test(before.kitVersion)||
      !keys(before.publication,['status','repository','tag'])||!keys(after.publication,['status','repository','tag'])||
      before.publication.status!=='local'||after.publication.status!=='published'||
      before.publication.repository!=='codepetca/zero'||before.publication.tag!==`v${before.kitVersion}`||
      !keys(before.assets,['kit','starter','extension'])||!keys(after.assets,['kit','starter','extension']))return false;
  const filenames={kit:'zero-bootstrap.zip',starter:'zero-starter.zip',extension:`zero-${before.kitVersion}.vsix`};
  const stripped=structuredClone(after);
  stripped.publication.status='local';
  for(const [key,filename] of Object.entries(filenames)) {
    const old=before.assets[key],asset=after.assets[key];
    if(!keys(old,['filename','label'])||!keys(asset,['filename','label','size','sha256','url'])||
        old.filename!==filename||typeof old.label!=='string'||!old.label||
        !Number.isSafeInteger(asset.size)||asset.size<=0||typeof asset.sha256!=='string'||!/^[a-f0-9]{64}$/.test(asset.sha256)||
        asset.url!==`https://github.com/codepetca/zero/releases/download/${before.publication.tag}/${filename}`)return false;
    stripped.assets[key]={filename:asset.filename,label:asset.label};
  }
  return isDeepStrictEqual(before,stripped);
}
function committedKitPromotion(base,head,cwd,files,{installerOnly=false}={}) {
  const read=ref=>{
    const result=spawnSync('git',['show',`${ref}:release/kit.json`],{cwd,encoding:'utf8',maxBuffer:128*1024});
    if(result.status!==0||result.error)throw new Error('Unavailable kit manifest history');
    return JSON.parse(result.stdout);
  };
  try {
    const before=read(base), after=read(head);
    if(installerOnly) {
      // A native publication can follow an already published kit. Apply the
      // same strict kit validation and require it to be unchanged by this PR.
      if(!isDeepStrictEqual(before,after))return false;
      const local=structuredClone(after);
      local.publication.status='local';
      for(const asset of Object.values(local.assets)) {
        delete asset.size;delete asset.sha256;delete asset.url;
      }
      if(!isKitPublicationPromotion(local,after))return false;
    } else if(!isKitPublicationPromotion(before,after))return false;
    const ancillary=files.some(file=>publicationMetadata.has(file)&&file!=='release/kit.json');
    if(!ancillary)return !installerOnly;
    const get=(ref,file)=>{
      const result=spawnSync('git',['show',`${ref}:${file}`],{cwd,maxBuffer:128*1024});
      if(result.status!==0||result.error)throw new Error('Unavailable publication metadata');
      return result.stdout;
    };
    const json=(ref,file)=>JSON.parse(get(ref,file).toString('utf8'));
    const installer=json(head,'release/installer.json');
    // The reviewed local native receipt may be committed after the PR merge
    // base. Compare against the parent of its latest first-parent change.
    const history=spawnSync('git',['log','--first-parent','--format=%H',`${base}..${head}`,'--','release/installer.json'],{cwd,encoding:'utf8',maxBuffer:128*1024});
    const latest=history.stdout?.trim().split('\n')[0];
    if(history.status!==0||history.error||!/^[a-f0-9]{40}$/.test(latest||''))return false;
    const previous=json(`${latest}^`,'release/installer.json');
    const snapshot=json(head,'release/published-installer.json');
    const kitSnapshot=json(head,'release/published-kit.json');
    // The fallback may intentionally lag the published kit; native-only
    // promotion must leave it unchanged.
    if(installerOnly ? !isDeepStrictEqual(json(base,'release/published-kit.json'),kitSnapshot) : !isDeepStrictEqual(after,kitSnapshot))return false;
    if(!isDeepStrictEqual(installer,snapshot))return false;
    validateInstallerManifest(previous,before);
    validateInstallerManifest(installer,after);
    if(previous.publication.status!=='local'||installer.publication.status!=='published'||installer.kitVersion!==after.kitVersion)return false;
    const stripped=structuredClone(installer);stripped.publication.status='local';delete stripped.asset.url;
    if(!isDeepStrictEqual(previous,stripped))return false;
    validateMacUpdateFeed(json(head,'release/mac-update-feed.json'),json(head,'release/mac-updater.json'),installer,get(head,'release/mac-appcast.xml'));
    return true;
  } catch {return false;}
}
export function scopeForEvent(event,cwd=process.cwd()) {
  try {
    if(!event.pull_request)return full(); // Manual invocations always run all lanes.
    const base=event.pull_request.base.sha, head=event.pull_request.head.sha;
    if(![base,head].every(value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value)))return full();
    const result=spawnSync('git',['diff','--name-only','--no-renames','-z',`${base}...${head}`],{cwd,encoding:'utf8',maxBuffer:8*1024*1024});
    if(result.status!==0||result.error)return full();
    const files=result.stdout.split('\0').filter(Boolean);
    let kitPublicationPromotion=false;
    if(files.includes('release/kit.json')) {
      const ancestor=spawnSync('git',['merge-base',base,head],{cwd,encoding:'utf8',maxBuffer:1024});
      if(ancestor.status!==0||ancestor.error||!/^[a-f0-9]{40}$/.test(ancestor.stdout.trim()))return full();
      kitPublicationPromotion=committedKitPromotion(ancestor.stdout.trim(),head,cwd,files);
    } else if(files.includes('release/installer.json')) {
      const ancestor=spawnSync('git',['merge-base',base,head],{cwd,encoding:'utf8',maxBuffer:1024});
      if(ancestor.status!==0||ancestor.error||!/^[a-f0-9]{40}$/.test(ancestor.stdout.trim()))return full();
      kitPublicationPromotion=committedKitPromotion(ancestor.stdout.trim(),head,cwd,files,{installerOnly:true});
    }
    return classify(files,{kitPublicationPromotion});
  } catch {return full();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  let selected;
  try {selected=scopeForEvent(JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8')));}
  catch {selected=full();}
  const lines=groups.map(name=>`${name}=${selected[name]}`).join('\n')+'\n';
  console.log(lines);
  if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,lines);
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `### CI selection\n\n${groups.map(name=>`- ${name}: ${selected[name]?'run':'not affected'}`).join('\n')}\n\nUnknown inputs or unavailable diff history select all checks. Manual dispatch runs all checks.\n`);
}
