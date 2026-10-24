// Read-only maintainer gate. No fetching, publishing, credentials or upgrades.
import {readFileSync,lstatSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {lessonProjects} from './lesson-projects.mjs';
const require=createRequire(import.meta.url);
const {validateBundle}=require('../extension/src/lesson-projects.js');
const {assertTutorialTemplateReady,tutorialScaffoldSha256}=require('../extension/src/tutorial-template-readiness.js');
const root=fileURLToPath(new URL('../',import.meta.url));

export function checkTutorialTemplateDirectory(project,directory){
  // Full pristine template acceptance, deliberately separate from student Run.
  // Never execute project files. A Git checkout may retain only its .git state.
  if(!lstatSync(directory).isDirectory()||lstatSync(directory).isSymbolicLink())throw Error('Choose an ordinary template directory.');
  const actual=[];
  const directories=new Set(project.files.flatMap(file=>file.path.split('/').slice(0,-1).map((_,index)=>file.path.split('/').slice(0,index+1).join('/'))));
  function inventory(folder,prefix=''){
    for(const entry of readdirSync(folder,{withFileTypes:true})){
      if(!prefix&&entry.name==='.git')continue;
      const name=prefix+entry.name;
      if(entry.isSymbolicLink())throw Error('Template source must not be a symlink: '+name);
      if(entry.isDirectory()){
        if(!directories.has(name))throw Error('Template contains an unexpected directory: '+name);
        inventory(path.join(folder,entry.name),name+'/');
      }
      else if(entry.isFile()){actual.push(name);if(actual.length>project.files.length)throw Error('Template contains unexpected files.');}
      else throw Error('Template source must be an ordinary file: '+name);
    }
  }
  inventory(directory);
  if(actual.sort().join('\n')!==project.files.map(file=>file.path).sort().join('\n'))throw Error('Template inventory differs from the current tutorial.');
  for(const file of project.files){
    let current=directory;
    for(const part of file.path.split('/')){
      current=path.join(current,part);
      const stat=lstatSync(current);
      if(stat.isSymbolicLink())throw Error('Template source must not be a symlink: '+file.path);
    }
    if(!lstatSync(current).isFile()||!readFileSync(current).equals(file.content))throw Error('Template source differs from the current tutorial: '+file.path);
    if(process.platform!=='win32'&&(lstatSync(current).mode&0o111)!==(file.mode&0o111))throw Error('Template executable mode differs: '+file.path);
  }
  return tutorialScaffoldSha256(project.files);
}
export function checkPublishedTutorialTemplates(projects=validateBundle(lessonProjects(root))){
  const failures=[];
  for(const project of projects){try{assertTutorialTemplateReady(project);}catch(error){failures.push(`${project.id}: ${error.message} Required scaffoldSha256: ${tutorialScaffoldSha256(project.files)}`);}}
  if(failures.length)throw Error(failures.join('\n')+'\nPrepare local drafts with node scripts/prepare-project-templates.mjs --tutorials. Publication and verified metadata updates require separate authorization.');
  return projects.length;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const args=process.argv.slice(2),projects=validateBundle(lessonProjects(root));
    if(!args.length)console.log(`Verified publication source evidence for ${checkPublishedTutorialTemplates(projects)} tutorial templates.`);
    else if(args.length===2){const project=projects.find(item=>item.id===args[0]);if(!project)throw Error('Choose greeting, study or game.');console.log(JSON.stringify({id:project.id,scaffoldSha256:checkTutorialTemplateDirectory(project,path.resolve(args[1]))}));}
    else throw Error('Usage: node scripts/check-tutorial-templates.mjs [greeting|study|game /pristine-template-directory]');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
