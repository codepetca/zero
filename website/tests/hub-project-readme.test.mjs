import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8,strToU8} from 'fflate';
import {scaffoldBundle} from '../../hub/service/scaffold.mjs';
import {developmentPaths} from '../../hub/development-files.mjs';
import {folderBundle,developmentPaths as clientPaths} from '../lib/hub-client.mjs';
import {projectResponse} from '../lib/hub-project.mjs';

test('downloaded instructions travel with the project and never enter a corrected upload',async()=>{
  const bundle=scaffoldBundle({libraryId:'ui9',className:'Meter',title:'Meter'});
  const response=await projectResponse(new Request('http://localhost:3189/api/hub/project',{
    method:'POST',headers:{Origin:'http://localhost:3189','Content-Type':'application/json'},body:JSON.stringify(bundle)
  }));
  assert.equal(response.status,200);
  const entries=unzipSync(new Uint8Array(await response.arrayBuffer()));
  assert.ok(entries['README.md']);
  const readme=strFromU8(entries['README.md']);
  assert.match(readme,/src\/zero\/ui9\/Meter\.java/);
  assert.match(readme,/https:\/\/zero\.codepet\.ca\/hub\/prepare/);
  assert.deepEqual([...developmentPaths].sort(),[...clientPaths].sort());
  entries['README.md']=strToU8(readme+'\nMy private local notes.\n');
  entries['API.md']=strToU8(bundle.files['API.md']+'\nUpdated usage.\n');
  const files=Object.entries(entries).map(([path,bytes])=>{
    const file=new File([bytes],path.split('/').at(-1));
    Object.defineProperty(file,'webkitRelativePath',{value:'project/'+path});return file;
  });
  const uploaded=await folderBundle(files);
  const corrected=structuredClone(bundle);corrected.files['API.md']+='\nUpdated usage.\n';
  assert.deepEqual(uploaded,corrected);
  assert.equal(Object.hasOwn(uploaded.files,'README.md'),false);
});
