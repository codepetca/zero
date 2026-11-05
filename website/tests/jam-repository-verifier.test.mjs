import test from 'node:test';
import assert from 'node:assert/strict';
import {createGitHubRepositoryVerifier} from '../../jams/github-source.mjs';

const actor={id:'123',login:'student'},repository={id:456,owner:{id:123,type:'User'},full_name:'student/project',private:false,visibility:'public'};
function fixture(override={}) {
  const calls=[];
  const verify=createGitHubRepositoryVerifier({token:'fixture-read-token',fetchImpl:async(url,options)=>{
    calls.push({url,options});return Response.json({...repository,...override});
  }});
  return {calls,verify};
}
test('current repository verification binds public numeric identity without reading commits or contents',async()=>{
  const f=fixture(),result=await f.verify({repositoryUrl:'https://github.com/student/project',actor});
  assert.deepEqual(result,{repository:{id:'456',ownerId:'123',fullName:'student/project'}});
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].url,'https://api.github.com/repos/student/project');
  assert.equal(f.calls[0].options.method,'GET');assert.equal(f.calls[0].options.redirect,'error');
  assert.equal(f.calls[0].options.cache,'no-store');assert.equal(f.calls[0].options.headers.Authorization,'Bearer fixture-read-token');
  await f.verify({repositoryId:'456',actor});assert.equal(f.calls[1].url,'https://api.github.com/repositories/456');
});
test('ownership, visibility, numeric ID and requested repository identity fail closed',async()=>{
  for(const override of [{private:true},{visibility:'private'},{owner:{id:999,type:'User'}},{owner:{id:123,type:'Organization'}},{id:0},{id:'456'},{full_name:'student/other'}]) {
    const f=fixture(override);await assert.rejects(f.verify({repositoryUrl:'https://github.com/student/project',actor}),{status:403});
  }
  await assert.rejects(fixture().verify({repositoryId:'999',actor}),{status:403});
});
test('invalid locators and missing credentials dispatch no repository traffic',async()=>{
  const f=fixture();
  for(const input of [{},{repositoryId:'0456'},{repositoryId:456},{repositoryId:'456',repositoryUrl:'https://github.com/student/project'},{repositoryUrl:'https://github.com/student/project?secret=x'}])await assert.rejects(f.verify({...input,actor}),{status:400});
  assert.equal(f.calls.length,0);
  await assert.rejects(createGitHubRepositoryVerifier({fetchImpl:()=>{throw Error('must not dispatch');}})({repositoryId:'456',actor}),{status:503});
});
test('unavailable and redirected GitHub responses expose safe bounded errors',async()=>{
  for(const status of [302,403,429,500]) {
    const verify=createGitHubRepositoryVerifier({token:'fixture-read-token',fetchImpl:async()=>Response.json({message:'private-provider-error'},{status})});
    await assert.rejects(verify({repositoryId:'456',actor}),error=>error.status===503&&!error.message.includes('private-provider'));
  }
  const verify=createGitHubRepositoryVerifier({token:'fixture-read-token',fetchImpl:async()=>Response.json({},{status:404})});
  await assert.rejects(verify({repositoryId:'456',actor}),{status:400});
});
