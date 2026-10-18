import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareLibraryBundle, checkLibrarySource } from '../library-checker.mjs';
import { validateLibraryBundle, expectedLibraryPom, MIT_BODY, LIBRARY_POLICY } from '../../hub/checker/policy.mjs';

export function fixture(){
  const descriptor={schema:1,kind:'library',slug:'flap-motion',version:'0.1.0',title:'Flap Motion',description:'Simple gravity and flap movement.',license:'MIT',libraryKind:'helper'};
  const request={schema:1,kind:'library',slug:'flap-motion',version:'0.1.0',repository:{id:'1417021749',ownerId:'7',owner:'student',name:'sky-hop',url:'https://github.com/student/sky-hop'},requester:{githubId:'7',login:'student'},commit:'a'.repeat(40),folder:'libraries/flap-motion',descriptor,policyRevision:'b'.repeat(40)};
  const values={
    'zero-library.json':JSON.stringify(descriptor),
    'LICENSE':'MIT License\n\nCopyright (c) 2026 Student\n\n'+MIT_BODY,
    'pom.xml':'<project><build><plugins><plugin><executions><execution><goals><goal>exec</goal></goals></execution></executions></plugin></plugins></build></project>',
    'src/main/java/zero/contrib/r1417021749/flap_motion/FlapMotion.java':'package zero.contrib.r1417021749.flap_motion; public final class FlapMotion { public double y; public void flap() { y -= 5; } }\n',
    'src/test/java/LibraryCheck.java':'import zero.contrib.r1417021749.flap_motion.FlapMotion; public class LibraryCheck { public static void main(String[] args) { FlapMotion f=new FlapMotion();f.flap();if(f.y!=-5)throw new AssertionError(); } }\n',
    'examples/first/FirstExample.java':'import zero.contrib.r1417021749.flap_motion.FlapMotion; public class FirstExample { public static void main(String[] args) { FlapMotion f=new FlapMotion();f.flap(); } }\n',
    'examples/second/SecondExample.java':'import zero.contrib.r1417021749.flap_motion.FlapMotion; public class SecondExample { public static void main(String[] args) { FlapMotion f=new FlapMotion();f.flap(); } }\n',
    'README.md':'Only for human readers; not checker input.'
  };
  return {request,sourceDigest:'c'.repeat(64),files:Object.entries(values).map(([path,value])=>({path,bytes:Buffer.from(value)}))};
}

test('current library bundle binds identity and uses fixed compiler inputs',()=>{
  const input=fixture(),{bundle}=prepareLibraryBundle(input);
  assert.equal(bundle.descriptor.namespace,'zero.contrib.r1417021749.flap_motion');
  assert.deepEqual(bundle.descriptor.groups,{behavior:['LibraryCheck'],first:['FirstExample'],second:['SecondExample']});
  assert.equal(Object.hasOwn(bundle.files,'pom.xml'),false);
  validateLibraryBundle(bundle);
  const pom=expectedLibraryPom(bundle).toString();
  assert.match(pom,/<groupId>ca.codepet.zero.contrib.r1417021749<\/groupId><artifactId>flap-motion<\/artifactId><version>0.1.0<\/version>/);
  assert.equal(pom.includes('<plugin>'),false);
});

test('rejects descriptor drift, foreign namespace, forged main and foreign resources',async()=>{
  for(const mutate of [
    x=>{x.request.descriptor.title='Changed';},
    x=>{x.files.find(f=>f.path.endsWith('FlapMotion.java')).path='src/main/java/other/FlapMotion.java';},
    x=>{x.files.find(f=>f.path.endsWith('FirstExample.java')).bytes=Buffer.from('public class FirstExample {}');},
    x=>{const license=x.files.find(f=>f.path==='LICENSE');license.bytes=Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),license.bytes]);},
    x=>{x.files.push({path:'src/main/resources/other/secret.txt',bytes:Buffer.from('bad')});},
    x=>{x.files.push({path:'src/main/resources/zero/contrib/r1417021749/flap_motion/FlapMotion.class',bytes:Buffer.from('fake bytecode')});}
  ]){
    const input=fixture();mutate(input);
    const result=await checkLibrarySource(input);
    assert.equal(result.passed,false);assert.equal(result.checks.at(-1).id,'source');assert.equal(result.policy,LIBRARY_POLICY);
  }
});
