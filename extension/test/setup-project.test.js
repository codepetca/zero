'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {setupProjectPath,isSetupProject,findSetupProject} = require('../src/setup-project');

test('installation test uses the launcher kit location or native home kit, not the current tutorial',async t=>{
  const home=await fs.mkdtemp(path.join(os.tmpdir(),'zero-setup-project-'));
  t.after(()=>fs.rm(home,{recursive:true,force:true}));
  const options={home,env:{ZERO_KIT_DIR:path.join(home,'Extracted Zero')}};
  const root=setupProjectPath(options);
  assert.equal(root,path.join(home,'Extracted Zero','starter'));
  assert.equal(setupProjectPath({home,env:{}}),path.join(home,'Zero','starter'));
  assert.equal(isSetupProject(path.join(home,'my-greeting'),options),false);
  await assert.rejects(findSetupProject(options),/installation test is unavailable/);
  for(const name of ['zero.json','pom.xml','mvnw','mvnw.cmd','.mvn/wrapper/maven-wrapper.properties']) {
    await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),'fixture');
  }
  assert.equal(await findSetupProject(options),root);
  assert.equal(isSetupProject(root,options),true);
  assert.throws(()=>setupProjectPath({home,env:{ZERO_KIT_DIR:'relative'}}),/absolute kit/);
});
