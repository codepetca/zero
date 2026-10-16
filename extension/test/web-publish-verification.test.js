'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {safePagesUrl,publicAddress,publicReadiness,boundedText}=require('../src/web-pages-verification');
function transport(onLookup,{status=200,body='version'}={}) {
  return (url,options,respond)=>{
    const request=new EventEmitter();
    assert.deepEqual(options.headers,{'Cache-Control':'no-cache'});
    queueMicrotask(()=>options.lookup(new URL(url).hostname,{all:true},(error,addresses)=>{
      onLookup(error,addresses);
      if(error)return request.emit('error',error);
      const response=new EventEmitter();response.statusCode=status;response.headers={};response.destroy=()=>{};
      respond(response);response.emit('data',Buffer.from(body));response.emit('end');
    }));
    return request;
  };
}
test('public marker transport binds the checked public DNS address to its unauthenticated TLS connection',async()=>{
  let calls=0;
  const response=await publicReadiness('https://student.github.io/game/zero-source-sha.txt',{lookup:(host,options,callback)=>{calls++;assert.equal(host,'student.github.io');assert.deepEqual(options,{all:true});callback(null,[{address:'185.199.108.153',family:4}]);},get:transport((error,addresses)=>{assert.equal(error,null);assert.deepEqual(addresses,[{address:'185.199.108.153',family:4}]);})});
  assert.equal(await boundedText(response),'version');assert.equal(calls,1);
});
test('mixed/private DNS answers and rebinding addresses fail without a public HTTP response',async()=>{
  for(const addresses of [[],[{address:'127.0.0.1',family:4}],[{address:'185.199.108.153',family:4},{address:'169.254.169.254',family:4}],[{address:'::ffff:127.0.0.1',family:6}]]) {
    await assert.rejects(publicReadiness('https://play.example.org/zero-source-sha.txt',{lookup:(_host,_options,callback)=>callback(null,addresses),get:transport(error=>assert.match(error.message,/public address/))}),/public address/);
  }
  for(const address of ['10.0.0.1','172.16.0.1','192.168.1.1','100.64.0.1','198.18.0.1','fe80::1','fc00::1','2001:db8::1'])assert.equal(publicAddress(address),false,address);
});
test('readiness rejects redirects and oversized streams, and no unsafe URL reaches transport',async()=>{
  for(const options of [{status:302},{status:404},{body:'x'.repeat(101)}])await assert.rejects(publicReadiness('https://play.example.org/version',{lookup:(_host,_options,callback)=>callback(null,[{address:'185.199.108.153',family:4}]),get:transport(()=>{},options)}));
  for(const url of ['http://play.example.org/','https://127.0.0.1/','https://user:secret@play.example.org/'])await assert.rejects(publicReadiness(url,{get:()=>assert.fail('Unsafe URL dispatched')}));
  assert.equal(await boundedText(new Response('x'.repeat(101))), '');
});
test('only actual Pages origins or the verified configured custom hostname are allowed',()=>{
  assert.equal(safePagesUrl('https://student.github.io/game/'),'https://student.github.io/game/');
  assert.equal(safePagesUrl('https://play.example.org/','play.example.org'),'https://play.example.org/');
  for(const [url,cname] of [['https://play.example.org/','other.example.org'],['https://127.0.0.1/','127.0.0.1'],['https://student.github.io.evil.example/game/',null],['https://student.github.io/game/?token=x',null],['https://game.local/','game.local']])assert.equal(safePagesUrl(url,cname),null);
});
