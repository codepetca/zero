import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {zipSync} from 'fflate';
import {starterMembers} from './kit.mjs';
import {extractProject,maven} from './verification-project.mjs';
const require=createRequire(import.meta.url);

export const root=fileURLToPath(new URL('../',import.meta.url));
export const games=['zero-pong','zero-collector','zero-platformer'];
function files(directory) {
 return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(directory,entry.name)):[path.join(directory,entry.name)]);
}
export function assertZeroOnly(source,filename='game source') {
 // Ignore comments and literals, so explanations and text do not change the rule.
 const code=source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,' ');
 if (/\bjavafx\b|\b(?:graphics|layout|canvas|fxNode)\s*\(/.test(code))throw new Error(filename+': game code must use Zero, without toolkit bridges.');
 for(const match of code.matchAll(/\bimport\s+(?:static\s+)?([\w.]+)(?:\.\*)?\s*;/g))if(!/^(?:zero|java)\./.test(match[1]))throw new Error(filename+': unsupported game import '+match[1]);
}
export function inspectGames() {
 for(const game of games)for(const filename of files(path.join(root,'student-template/examples',game)).filter(file=>file.endsWith('.java')))assertZeroOnly(fs.readFileSync(filename,'utf8'),filename);
 return games;
}
export async function verifyBasicGames(args=process.argv.slice(2)) {
 const known=args.every(arg=>['--export','--native','--prepare'].includes(arg)||arg.startsWith('--output=')||arg.startsWith('--cache='));
 if(!known||!args.some(arg=>['--export','--native','--prepare'].includes(arg)))throw new Error('Use --prepare, --native and/or --export, with optional --output=directory and --cache=directory.');
 inspectGames();
 const output=path.resolve(args.find(arg=>arg.startsWith('--output='))?.slice(9)||path.join(root,'.verification/basic-games'));
 const cacheRoot=path.resolve(args.find(arg=>arg.startsWith('--cache='))?.slice(8)||path.join(root,'.verification/web-export-checks/cache'));
 fs.mkdirSync(output,{recursive:true});
 const members=starterMembers(root);
 // A reference game is a standalone project, without the other teaching examples.
 for(const name of Object.keys(members))if(name.startsWith('zero-starter/examples/')||name.startsWith('zero-starter/lessons/')||/^zero-starter\/src\/main\/java\/[^/]+\.java$/.test(name))delete members[name];
 const receipts=[];
 for(const game of games) {
  const project=extractProject(zipSync(members),'zero-starter',output);
  const source=path.join(root,'student-template/examples',game);
  for(const name of fs.readdirSync(source).filter(name=>name.endsWith('.java')))fs.copyFileSync(path.join(source,name),path.join(project,'src/main/java',name));
  fs.copyFileSync(path.join(source,'README.md'),path.join(project,'GAME.md'));
  if(fs.existsSync(path.join(source,'resources')))fs.cpSync(path.join(source,'resources'),path.join(project,'src/main/resources'),{recursive:true});
  const receipt={name:game,project};
  if(args.includes('--native')) {
   const result=maven(project,['compile']);fs.writeFileSync(path.join(output,game+'-compile.log'),result.stdout+result.stderr);receipt.nativeCompile='passed';
   const checks=path.join(root,'framework/basic-game-checks',game+'.java');
   if(!fs.existsSync(checks))throw new Error('Missing required native behavior check: '+game);
   {
    fs.copyFileSync(checks,path.join(project,'src/main/java/GameCheck.java'));
    const tested=maven(project,['-Dapp.mainClass=GameCheck','compile','javafx:run']);
    fs.writeFileSync(path.join(output,game+'-native.log'),tested.stdout+tested.stderr);
    if(!tested.stdout.includes('ZERO_BASIC_GAME_OK'))throw new Error(game+' native behavior check did not finish.');
    fs.rmSync(path.join(project,'src/main/java/GameCheck.java'));receipt.nativeBehavior='passed';
   }
  }
  // Archive only the ordinary game, never a verification harness or compiled classes.
  const archive={};
  for(const filename of files(project).filter(file=>!file.includes(path.sep+'target'+path.sep)))archive[path.relative(project,filename).split(path.sep).join('/')]=[new Uint8Array(fs.readFileSync(filename)),{os:3,attrs:((path.basename(filename)==='mvnw'?0o100755:0o100644)<<16)>>>0}];
  const sourceZip=path.join(output,game+'-source.zip');fs.writeFileSync(sourceZip,zipSync(archive));receipt.sourceZip=sourceZip;
  if(args.includes('--export')) {
   const {exportForWeb}=require(path.join(project,'.zero-build/src/web-export'));
   Object.assign(receipt,await exportForWeb({projectRoot:project,cacheRoot,onProgress:message=>console.log(game+': '+message)}));
  }
  receipts.push(receipt);fs.writeFileSync(path.join(output,'builds.json'),JSON.stringify(receipts,null,2)+'\n');
 }
 console.log('Zero-only game source checks passed: '+games.join(', '));
 return receipts;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await verifyBasicGames();
