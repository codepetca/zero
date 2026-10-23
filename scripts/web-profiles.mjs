import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {adaptSources}=require('../extension/src/web-export/adapters');
const root=fileURLToPath(new URL('../',import.meta.url));
export function verifyWebProfiles() {
  const directory=path.join(root,'framework/src/main/java/zero');
  const names=fs.readdirSync(directory,{recursive:true,withFileTypes:true}).filter(entry=>entry.isFile()&&entry.name.endsWith('.java')).map(entry=>path.relative(directory,path.join(entry.parentPath,entry.name)).split(path.sep).join('/')).sort();
  assert.deepEqual(names,['Actor.java','App.java','Collisions.java','Color.java','GameApp.java','ImageRegion.java','Music.java','Sound.java','SpriteAnimation.java','ui/Button.java','ui/Column.java','ui/Element.java','ui/Label.java'],'A Zero helper was added or removed. Add its browser adapter and real compile/browser coverage before releasing.');
  const sources=Object.fromEntries(names.map(name=>['zero/'+name,fs.readFileSync(path.join(directory,name),'utf8')]));
  const declarations = Object.values(sources).reduce((total, source) => total + [...source.matchAll(/^    (?:@Override )?(?:public|protected) /gm)].length, 0);
  assert.equal(declarations, 142, 'The supported Zero API declaration inventory changed. Extend browser fixture coverage before updating the profile.');
  sources['Main.java']=fs.readFileSync(path.join(root,'framework/web-checks/Main.java'),'utf8');
  adaptSources({sources,resourcePaths:['tiles.png']});
  return names;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log('Reviewed browser profiles: '+verifyWebProfiles().join(', '));
