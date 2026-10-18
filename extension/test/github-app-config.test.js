'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {githubAppConfiguration,PERMISSIONS}=require('../src/github-app/config');
const configured={schema:1,status:'configured',owner:'codepetca',appId:123,clientId:'Iv1234567890',slug:'codepet-zero',websiteOrigin:'https://zero.codepet.ca'};
test('packaged App pins the owner-approved public Codepet registration',()=>{
  const app=githubAppConfiguration();assert.equal(app.appId,5367740);assert.equal(app.clientId,'Iv23liWzC8OE2WN5f6qV');assert.equal(app.slug,'codepet-zero');assert.equal(app.owner,'codepetca');
  assert.equal(githubAppConfiguration({...configured,status:'unconfigured',appId:null,clientId:null,slug:null}),null);
});
test('the reviewed App identity and capability set have no workspace override or broad admin permission',()=>{
  const app=githubAppConfiguration(configured);assert.ok(Object.isFrozen(app));assert.ok(Object.isFrozen(app.permissions));
  assert.equal(app.clientId,configured.clientId);assert.equal(PERMISSIONS.repository_creation,'write');assert.equal(PERMISSIONS.administration,undefined);
  for(const patch of [{owner:'other'},{websiteOrigin:'http://127.0.0.1:1234'},{clientId:'bad'},{appId:0},{slug:'../evil'},{secret:'must-not-ship'},{status:'unconfigured'}])assert.throws(()=>githubAppConfiguration({...configured,...patch}));
});
