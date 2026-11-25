import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareLibraryBundle, checkLibrarySource } from '../library-checker.mjs';
import { trustedCoreSources } from '../../hub/checker/core-policy.mjs';
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

export function coreWidgetFixture() {
  const input=fixture(), {record}=trustedCoreSources();
  const namespace='zero.contrib.r1417021749.flap_motion';
  const descriptor={
    ...input.request.descriptor,schema:2,libraryKind:'widget',
    coreRequirement:{minVersion:'0.3.0',maxExclusive:'0.4.0'},
    coreInput:{version:record.coordinate.version,sourceSha256:record.sourceSha256}
  };
  input.request.descriptor=descriptor;
  input.files.find(file=>file.path==='zero-library.json').bytes=Buffer.from(JSON.stringify(descriptor));
  const packagePath=namespace.replaceAll('.','/');
  input.files.find(file=>file.path.endsWith('FlapMotion.java')).bytes=Buffer.from(`
package ${namespace};
public final class FlapMotion implements FlapView {
  private final zero.ui.Label label = new zero.ui.Label("Ready");
  public zero.ui.Element view() { return label; }
}
`);
  input.files.push({
    path:`src/main/java/${packagePath}/FlapView.java`,
    bytes:Buffer.from(`package ${namespace}; public interface FlapView { zero.ui.Element view(); }`)
  });
  for (const file of input.files.filter(file=>file.path.startsWith('src/test/') || file.path.startsWith('examples/'))) {
    const name=file.path.split('/').at(-1).slice(0,-5);
    file.bytes=Buffer.from(`
import ${namespace}.FlapMotion;
public class ${name} {
  public static void main(String[] args) {
    assert javafx.application.Platform.isFxApplicationThread();
    var view = new FlapMotion().view();
    assert view instanceof zero.ui.Label;
    assert view.fxNode() instanceof javafx.scene.control.Label;
  }
}
`);
  }
  return input;
}

test('core-dependent adapter preserves exact core input and accepts public companion interfaces',()=>{
  const input=coreWidgetFixture(), {bundle}=prepareLibraryBundle(input);
  assert.deepEqual(bundle.descriptor.coreInput,input.request.descriptor.coreInput);
  assert.deepEqual(bundle.descriptor.coreRequirement,input.request.descriptor.coreRequirement);
  assert.equal(bundle.descriptor.classes.length,2);
  assert.ok(Object.keys(bundle.files).every(name=>!name.startsWith('src/main/java/zero/ui/')));
});

test('rejects an unreviewed core or a check declaring types in the core namespace',()=>{
  const wrongCore=coreWidgetFixture();
  wrongCore.request.descriptor.coreInput.sourceSha256='f'.repeat(64);
  wrongCore.files.find(file=>file.path==='zero-library.json').bytes=Buffer.from(JSON.stringify(wrongCore.request.descriptor));
  assert.throws(()=>prepareLibraryBundle(wrongCore),/reviewed Zero core version and exact source/);
  const shadow=coreWidgetFixture(), check=shadow.files.find(file=>file.path==='src/test/java/LibraryCheck.java');
  check.path='src/test/java/zero/ui/LibraryCheck.java';
  check.bytes=Buffer.from('package zero.ui; '+check.bytes.toString());
  assert.throws(()=>prepareLibraryBundle(shadow),/reserved Zero namespace/);
});

test('reports extra terms in a current-format contribution license',()=>{
  const input=coreWidgetFixture(), license=input.files.find(file=>file.path==='LICENSE');
  license.bytes=Buffer.from(license.bytes.toString().replace(MIT_BODY,'Additional restrictions.\n\n'+MIT_BODY));
  assert.throws(()=>prepareLibraryBundle(input),/Full MIT license required/);
});

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
