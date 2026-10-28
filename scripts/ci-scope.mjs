import {appendFileSync, readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';

export const groups=['source','native','browser','windows','website','sharing','lessons'];
const full=()=>Object.fromEntries(groups.map(name=>[name,true]));
const ui=new Set(['extension/src/start-page.js','extension/src/sidebar-style.js','extension/src/sidebar-script.js','extension/src/sidebar-icons.js','extension/src/ui-controls.js',
  'extension/test/start-page.test.js','extension/test/sidebar.test.js','extension/test/ui-controls.test.js']);
const sharedDesign=new Set(['design/tokens.json','design/adapters.mjs','design/prepare.mjs','extension/media/controls.css','extension/media/sidebar.css']);
const dev=new Set(['Zero Dev.command','scripts/zero-dev.test.mjs','.vscode/launch.json']);
const websiteConfig=new Set(['website/package.json','website/package-lock.json','website/tsconfig.json','website/next.config.ts']);
const scopeTools=new Set(['scripts/ci-scope.mjs','scripts/ci-scope.test.mjs']);

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
    if(file==='release/kit.json'&&kitPublicationPromotion){add('source','website');continue;}
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
function committedKitPromotion(base,head,cwd) {
  const read=ref=>{
    const result=spawnSync('git',['show',`${ref}:release/kit.json`],{cwd,encoding:'utf8',maxBuffer:128*1024});
    if(result.status!==0||result.error)throw new Error('Unavailable kit manifest history');
    return JSON.parse(result.stdout);
  };
  try {return isKitPublicationPromotion(read(base),read(head));} catch {return false;}
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
      kitPublicationPromotion=committedKitPromotion(ancestor.stdout.trim(),head,cwd);
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
