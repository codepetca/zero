import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSubmission } from '../runner.mjs';
import { fixture } from './fixture.mjs';
const enabled=process.env.ZERO_DOCKER_TEST==='1';
async function checked(bundle, options={}) {const result=await checkSubmission(bundle,options);console.log(JSON.stringify({...result,artifacts:result.artifacts?Object.fromEntries(Object.entries(result.artifacts).map(([k,v])=>[k,v.length])):undefined}));return result;}
test('actual fixed build and separate JavaFX checks use a reproducible JAR', {skip:!enabled},async()=>{
 const first=await checked(fixture()),second=await checked(fixture());assert.equal(first.passed,true);assert.equal(second.passed,true);
 assert.deepEqual(first.artifacts,second.artifacts);assert.equal(first.platforms.length,1);assert.match(first.platforms[0],/^linux-(arm64|amd64)$/);
});
test('compile failure, hidden foreign top-level class, wrong API and declared test failure fail closed',{skip:!enabled},async()=>{
 for(const [path,change,id] of [
 ['src/zero/ui1/Display.java',s=>s+' syntax error','fixed-build'],
 ['src/zero/ui1/Display.java',s=>s+' class Undeclared {}','fixed-build'],
 ['src/zero/ui1/Display.java',s=>s.replace('public Node view()', 'public Label view()'),'api'],
 ['checks/BehaviorCheck.java',s=>s.replace('value.setValue("Changed")','value.setValue("Wrong")'),'behavior']
 ]){const bundle=fixture();bundle.files[path]=change(bundle.files[path]);const result=await checked(bundle);assert.equal(result.passed,false);assert.equal(result.checks.at(-1).id,id);}
});
test('time/output bounds and premature process exit cannot be contributor verdicts',{skip:!enabled},async()=>{
 for(const statement of ['while (true) {}','System.exit(0);','Runtime.getRuntime().halt(0);','System.setSecurityManager(null);','while (true) System.out.println("PASS");']){
 const bundle=fixture();bundle.files['checks/BehaviorCheck.java']='import zero.ui1.Display; public class BehaviorCheck { public static void main(String[] args) { '+statement+' } }';
 const result=await checked(bundle,{runTimeoutMs:3000});assert.equal(result.passed,false);assert.equal(result.checks.at(-1).id,'behavior');
 }
});
test('consumer must actually load the built component; spoofed result markers do not pass',{skip:!enabled},async()=>{
 const bundle=fixture();bundle.files['checks/BehaviorCheck.java']='public class BehaviorCheck { public static void main(String[] args) { System.out.println("PASSED=true"); } }';
 const result=await checked(bundle);assert.equal(result.passed,false);assert.equal(result.checks.at(-1).id,'behavior');
});
test('offline, nonroot, read-only image, bounded mount and no secrets/socket in actual candidate runtime',{skip:!enabled},async()=>{
 const bundle=fixture();bundle.files['checks/BehaviorCheck.java']=`import java.nio.file.*; import java.net.*; import zero.ui1.Display; import javafx.application.Platform; public class BehaviorCheck { public static void main(String[] args) throws Exception {
  Platform.startup(() -> { Display display = new Display(); display.setValue("Safe"); });
  if (!System.getProperty("user.name").equals("?")) { /* numeric unmapped uid is allowed */ }
  String status=Files.readString(Path.of("/proc/self/status")); if(!status.contains("Uid:\\t10001")) throw new AssertionError("root");
  if(Files.exists(Path.of("/var/run/docker.sock")) || Files.exists(Path.of("/Users/stew")) || Files.exists(Path.of("/root/.aws/credentials"))) throw new AssertionError("Host mount");
  for(String key:System.getenv().keySet()) if(key.matches("(?i).*(TOKEN|SECRET|PASSWORD|CREDENTIAL).*")) throw new AssertionError("Secret env");
  try { Files.writeString(Path.of("/input/API.md"),"changed"); throw new AssertionError("Writable input"); } catch(java.io.IOException expected) {}
  try { Files.writeString(Path.of("/policy/owned"),"changed"); throw new AssertionError("Writable rootfs"); } catch(java.io.IOException expected) {}
  try(Socket s=new Socket()) { try { s.connect(new InetSocketAddress("1.1.1.1",443),500); throw new AssertionError("Internet"); } catch(java.io.IOException expected) {} }
  Platform.exit();
 } }`;
 const result=await checked(bundle);assert.equal(result.passed,true);
});
