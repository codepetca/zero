import {appendFileSync, readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const groups=['source','native','browser','windows','website','sharing','lessons'];
const full=()=>Object.fromEntries(groups.map(name=>[name,true]));
const ui=new Set(['extension/src/start-page.js','extension/src/sidebar-style.js','extension/src/sidebar-script.js','extension/src/sidebar-icons.js','extension/src/ui-controls.js',
  'extension/test/start-page.test.js','extension/test/sidebar.test.js','extension/test/ui-controls.test.js']);
const sharedDesign=new Set(['design/tokens.json','design/adapters.mjs','design/prepare.mjs','extension/media/controls.css','extension/media/sidebar.css']);
const dev=new Set(['Zero Dev.command','scripts/zero-dev.test.mjs','.vscode/launch.json']);
const websiteConfig=new Set(['website/package.json','website/package-lock.json','website/tsconfig.json','website/next.config.ts']);

// Deliberately a small allowlist. Unknown/shared executable inputs retain every
// existing lane. Renames are read as a deletion plus addition, so the old scope
// cannot disappear when a file moves into a narrower category.
export function classify(files) {
  if(!Array.isArray(files)||!files.length)return full();
  const selected=Object.fromEntries(groups.map(name=>[name,false]));
  const add=(...names)=>names.forEach(name=>selected[name]=true);
  for(const file of files) {
    if(typeof file!=='string'||/[\\\x00-\x1f\x7f]/.test(file)||file.split('/').some(part=>!part||part==='.'||part==='..'))return full();
    if(file==='AGENTS.md'||file==='design.md'||/^\.ai\/.*\.md$/.test(file))continue;
    if(file==='README.md'||/^docs\/.*\.(md|png|jpe?g|svg|css)$/.test(file)){add('website');continue;}
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
export function scopeForEvent(event,cwd=process.cwd()) {
  try {
    if(!event.pull_request)return full(); // Manual invocations always run all lanes.
    const base=event.pull_request.base.sha, head=event.pull_request.head.sha;
    if(![base,head].every(value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value)))return full();
    const result=spawnSync('git',['diff','--name-only','--no-renames','-z',`${base}...${head}`],{cwd,encoding:'utf8',maxBuffer:8*1024*1024});
    if(result.status!==0||result.error)return full();
    return classify(result.stdout.split('\0').filter(Boolean));
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
