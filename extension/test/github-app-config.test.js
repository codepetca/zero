'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {githubAppConfiguration,PERMISSIONS}=require('../src/github-app/config');
const configured={schema:1,status:'configured',owner:'codepetca',appId:123,clientId:'Iv1234567890',slug:'codepet-zero',websiteOrigin:'https://zero.codepet.ca'};
test('development App is explicitly unconfigured until owner activation',()=>assert.equal(githubAppConfiguration(),null));
test('the reviewed App identity and capability set have no workspace override or broad admin permission',()=>{
  const app=githubAppConfiguration(configured);assert.ok(Object.isFrozen(app));assert.ok(Object.isFrozen(app.permissions));
  assert.equal(app.clientId,configured.clientId);assert.equal(PERMISSIONS.repository_creation,'write');assert.equal(PERMISSIONS.administration,undefined);
  for(const patch of [{owner:'other'},{websiteOrigin:'http://127.0.0.1:1234'},{clientId:'bad'},{appId:0},{slug:'../evil'},{secret:'must-not-ship'},{status:'unconfigured'}])assert.throws(()=>githubAppConfiguration({...configured,...patch}));
});
