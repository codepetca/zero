'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {portableWindowsPath,potentialWindowsShortName,windowsPathsCollide}=require('../src/windows-path-policy');
test('Windows path policy refuses device names, streams, unsafe suffixes and short aliases',()=>{
 for(const name of ['CON','con.txt','dir/COM¹.log','LPT9.txt','NUL .txt','x:stream','a?.txt','name.','name ','dir/.git/x','../x'])assert.equal(portableWindowsPath(name),false,name);
 for(const name of ['x~1','dir/Longna~12.txt'])assert.equal(potentialWindowsShortName(name),true,name);
 for(const name of ['src/Main.java','console.txt','COM10.txt','name~letter'])assert.equal(portableWindowsPath(name)&&!potentialWindowsShortName(name),true,name);
});
test('Windows path policy detects affected-path and ancestor collisions without conflating siblings',()=>{
 for(const [affected,known] of [[['A.txt'],['a.txt']],[['Foo/a'],['foo/b']],[['x/é'],['x/e\u0301']],[['a'],['a/b']],[['a/b'],['a']],[['A/x','a/y'],[]]])assert.equal(windowsPathsCollide(affected,known),true,JSON.stringify([affected,known]));
 assert.equal(windowsPathsCollide(['dir/a'],['dir/a','dir/b']),false);
});
