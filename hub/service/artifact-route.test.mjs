import test from 'node:test';
import assert from 'node:assert/strict';
import {artifactRoute} from './artifact-route.mjs';

const base='/api/hub/maven/ca/codepet/zero/library/ui7/0.12.3/';
test('public Maven and preview URLs bind their complete filename to one release',()=>{
  for(const [kind,suffix] of [['jar','.jar'],['sources','-sources.jar'],['pom','.pom']]) {
    for(const checksum of [null,'sha256','sha1']) {
      assert.deepEqual(artifactRoute(base+'ui7-0.12.3'+suffix+(checksum?'.'+checksum:'')),{libraryId:'ui7',version:'0.12.3',kind,checksum});
    }
  }
  assert.deepEqual(artifactRoute('/api/hub/previews/ui7/0.12.3.png'),{libraryId:'ui7',version:'0.12.3',kind:'preview',checksum:null});
});
test('foreign names, versions and paths cannot cause a release lookup',()=>{
  for(const url of [base+'ui8-0.12.3.jar',base+'ui7-0.12.4.jar',base+'ui7-0.12.3.zip',base+'ui7-0.12.3.jar.sha256.sha1',base+'../ui7-0.12.3.jar',base.replace('0.12.3','00.12.3')+'ui7-00.12.3.jar',base.replace('ui7/','ui0/')+'ui0-0.12.3.jar',base.replace('/ca/','/other/')+'ui7-0.12.3.jar','/api/hub/previews/ui7/0.12.3.png.sha256','/api/hub/previews/ui7/0.12.3.svg',base.replace('ui7/','ui'+'a'.repeat(13)+'/')+'ui7-0.12.3.jar']) assert.equal(artifactRoute(url),null,url);
});
