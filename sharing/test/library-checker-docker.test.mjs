import test from 'node:test';
import assert from 'node:assert/strict';
import { checkLibrarySource } from '../library-checker.mjs';
import { fixture } from './library-checker.test.mjs';

const enabled=process.env.ZERO_DOCKER_TEST==='1';
test('current helper builds deterministic Maven artifacts and each independent consumer runs',{skip:!enabled},async()=>{
  const input=fixture(),first=await checkLibrarySource(input),second=await checkLibrarySource(input);
  assert.equal(first.passed,true,JSON.stringify(first.checks));
  assert.equal(second.passed,true,JSON.stringify(second.checks));
  assert.deepEqual(first.artifacts,second.artifacts);
  assert.deepEqual(first.components.map(x=>x.className),['zero.contrib.r1417021749.flap_motion.FlapMotion']);
  assert.equal(first.components[0].api.some(signature=>signature.endsWith('{')),false);
  assert.equal(first.sourceDigest,input.sourceDigest);
  assert.match(first.artifacts.pom.toString(),/ca\.codepet\.zero\.contrib\.r1417021749/);
  assert.equal(first.artifacts.pom.toString().includes('<plugin>'),false);
  assert.deepEqual(first.checks.map(x=>x.id),['bundle','fixed-build','api','behavior','first','second']);
  assert.deepEqual(first.platforms,[first.image.platform]);
});

test('failing assertion and forged success without JAR use cannot publish artifacts',{skip:!enabled},async()=>{
  for(const [code,expected] of [
    ['import zero.contrib.r1417021749.flap_motion.FlapMotion; public class LibraryCheck { public static void main(String[] args) { FlapMotion f=new FlapMotion();f.flap();if(f.y!=-6)throw new AssertionError("bad movement"); } }','behavior'],
    ['public class LibraryCheck { public static void main(String[] args) { System.out.println("PASSED=true"); } }','behavior']
  ]){
    const input=fixture();input.files.find(x=>x.path==='src/test/java/LibraryCheck.java').bytes=Buffer.from(code);
    const result=await checkLibrarySource(input);
    assert.equal(result.passed,false);assert.equal(result.checks.at(-1).id,expected);assert.equal(result.artifacts,undefined);
  }
});

test('current widget requires Node view, while helpers have no view requirement',{skip:!enabled},async()=>{
  const input=fixture();input.request.descriptor.libraryKind='widget';
  input.files.find(x=>x.path==='zero-library.json').bytes=Buffer.from(JSON.stringify(input.request.descriptor));
  const source=input.files.find(x=>x.path.endsWith('FlapMotion.java'));
  let result=await checkLibrarySource(input);
  assert.equal(result.passed,false);assert.equal(result.checks.at(-1).id,'api');
  source.bytes=Buffer.from('package zero.contrib.r1417021749.flap_motion; import javafx.scene.Node; public final class FlapMotion { public double y; public void flap() { y -= 5; } public Node view() { return null; } }');
  result=await checkLibrarySource(input);
  assert.equal(result.passed,true,JSON.stringify(result.checks));
});

test('namespaced resources are included in the checked binary and source artifacts',{skip:!enabled},async()=>{
  const input=fixture();
  const path='src/main/resources/zero/contrib/r1417021749/flap_motion/setting.txt';
  input.files.push({path,bytes:Buffer.from('flap=5\n')});
  const result=await checkLibrarySource(input);
  assert.equal(result.passed,true,JSON.stringify(result.checks));
  assert.ok(result.artifacts.jar.includes(Buffer.from('zero/contrib/r1417021749/flap_motion/setting.txt')));
  assert.ok(result.artifacts.sources.includes(Buffer.from('zero/contrib/r1417021749/flap_motion/setting.txt')));
  assert.ok(result.artifacts.jar.includes(Buffer.from('flap=5\n')));
});
