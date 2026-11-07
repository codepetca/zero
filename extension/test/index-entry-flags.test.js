'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseIndexFlags}=require('../src/index-entry-flags');
const row=(name,flags)=>`${name}\0  ctime: 1:2\n  mtime: 3:4\n  dev: 1\tino: 2\n  uid: 3\tgid: 4\n  size: 5\tflags: ${flags}\n`;
test('reads exact per-path Git index flags',()=>assert.deepEqual([...parseIndexFlags(Buffer.from(row('a','0')+row('folder/b','20004000')))], [['a','0'],['folder/b','20004000']]));
test('rejects duplicate, unsafe, truncated and malformed index records',()=>{
  for(const raw of [row('a','0')+row('a','0'),row('../a','0'),row('bad\nname','0'),row('a','0').slice(0,-1),row('a','xyz')])assert.throws(()=>parseIndexFlags(Buffer.from(raw)));
});
