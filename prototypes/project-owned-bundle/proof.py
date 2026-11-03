#!/usr/bin/env python3
"""Disposable, local-only bundle experiment. Does not implement Zero Add."""
import hashlib, json, os, shutil, subprocess, sys, tempfile, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FILES = ('fixture-1.0.0.jar', 'fixture-1.0.0-sources.jar', 'fixture-1.0.0.pom', 'LICENSE')
SOURCE = '''package proof.fixture;
public final class Score {
    private int value;
    public void add(int points) { value += points; }
    public int value() { return value; }
    public String label() { return "Score: " + value; }
}
'''
LICENSE = '''MIT License

Copyright (c) 2026 Local Proof Authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
'''
POM = '''<project xmlns="http://maven.apache.org/POM/4.0.0"><modelVersion>4.0.0</modelVersion><groupId>proof.local</groupId><artifactId>fixture</artifactId><version>1.0.0</version><licenses><license><name>MIT</name></license></licenses></project>\n'''
APP = '''import zero.App;
import zero.ui.Label;
import proof.fixture.Score;
public class Main extends App {
    public static String scoreLabel() { Score score = new Score(); score.add(7); score.add(4); return score.label(); }
    public void setup() { show(new Label(scoreLabel())); }
    public static void main(String[] args) { launch(args); }
}
'''
HARNESS = '''import proof.fixture.Score;
public class NativeCheck {
    public static void main(String[] args) throws Exception {
        if (!Main.scoreLabel().equals("Score: 11")) throw new AssertionError("wrong score");
        String actual = java.nio.file.Path.of(Score.class.getProtectionDomain().getCodeSource().getLocation().toURI()).toRealPath().toString();
        if (!actual.equals(java.nio.file.Path.of(args[0]).toRealPath().toString())) throw new AssertionError(actual);
        System.out.println("NATIVE_BUNDLE_RUN_OK " + Main.scoreLabel() + " " + actual);
    }
}
'''
DEPENDENCY = '''    <dependency>
      <groupId>proof.local</groupId>
      <artifactId>fixture</artifactId>
      <version>1.0.0</version>
    </dependency>
'''
def run(args, cwd=None, **kw):
    print('+', ' '.join(map(str, args)), flush=True)
    return subprocess.run(list(map(str,args)), cwd=cwd, check=True, text=True, **kw)
def digest(b): return hashlib.sha256(b).hexdigest()
def write(p, content):
    p.parent.mkdir(parents=True,exist_ok=True); p.write_text(content)
def verify(bundle, expected=None):
    # Fixed paths and expected shape are deliberate: this is not a generic archive parser.
    manifest=json.loads((bundle/'manifest.json').read_text())
    if expected is not None and manifest != expected: raise ValueError('accepted metadata mismatch')
    if manifest.get('coordinate')!='proof.local:fixture:1.0.0' or manifest.get('license')!='MIT' or set(manifest.get('files',{}))!=set(FILES): raise ValueError('invalid manifest')
    if bundle.is_symlink() or any((bundle/f).is_symlink() or not (bundle/f).is_file() for f in FILES): raise ValueError('missing or linked file')
    for f in FILES:
        data=(bundle/f).read_bytes(); record=manifest['files'][f]
        if len(data)!=record['size'] or digest(data)!=record['sha256']: raise ValueError('hash or size mismatch: '+f)
    if (bundle/'LICENSE').read_text()!=LICENSE: raise ValueError('license mismatch')
    with zipfile.ZipFile(bundle/FILES[1]) as archive:
        if archive.namelist()!=['proof/fixture/Score.java'] or archive.read('proof/fixture/Score.java').decode()!=SOURCE: raise ValueError('source archive mismatch')
    return manifest

def main():
    with tempfile.TemporaryDirectory(prefix='zero-bundle-proof-') as tmp:
        base=Path(tmp); creator=base/'creator'; project=base/'student-original'; clone=base/'different path'/'fresh-clone'; bundle=project/'zero-libraries'/'fixture'/'1.0.0'; bundle.mkdir(parents=True)
        java=creator/'proof/fixture/Score.java'; write(java,SOURCE)
        classes=base/'classes'; classes.mkdir(); run(['javac','--release','17','-d',classes,java]); run(['jar','--create','--file',bundle/FILES[0],'-C',classes,'.'])
        run(['jar','--create','--file',bundle/FILES[1],'-C',creator,'proof/fixture/Score.java'])
        # jar CLI adds META-INF entries; build a source-only archive with fixed safe paths.
        with zipfile.ZipFile(bundle/FILES[1],'w',compression=zipfile.ZIP_DEFLATED) as z: z.writestr('proof/fixture/Score.java',SOURCE)
        write(bundle/FILES[2],POM); write(bundle/FILES[3],LICENSE)
        manifest={'coordinate':'proof.local:fixture:1.0.0','license':'MIT','files':{f:{'size':(bundle/f).stat().st_size,'sha256':digest((bundle/f).read_bytes())} for f in FILES}}
        write(bundle/'manifest.json',json.dumps(manifest,indent=2)+'\n'); verify(bundle)
        # All app, framework, wrapper and native POM inputs are committed before cloning.
        for name in ('mvnw','mvnw.cmd','pom.xml','zero.json'):
            shutil.copy2(ROOT/'student-template'/name,project/name)
        shutil.copytree(ROOT/'student-template/.mvn',project/'.mvn')
        shutil.copytree(ROOT/'framework/src/main/java/zero',project/'src/main/java/zero')
        pom=(project/'pom.xml').read_text()
        if pom.count('  </dependencies>')!=1: raise AssertionError('template dependency section changed')
        write(project/'pom.xml',pom.replace('  </dependencies>',DEPENDENCY+'  </dependencies>'))
        write(project/'src/main/java/Main.java',APP); write(project/'proof/NativeCheck.java',HARNESS)
        write(project/'proof/web_bridge.py', '''import hashlib, json, pathlib, sys, zipfile
web, bundle, expected_sha = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), sys.argv[3]
raw=(bundle/'fixture-1.0.0-sources.jar').read_bytes()
if hashlib.sha256(raw).hexdigest()!=expected_sha: raise ValueError("source JAR mismatch")
with zipfile.ZipFile(bundle/'fixture-1.0.0-sources.jar') as z:
    if z.namelist()!=['proof/fixture/Score.java']: raise ValueError("unexpected source entries")
    source=z.read('proof/fixture/Score.java')
path=web/'src/main/java/proof/fixture/Score.java'; path.parent.mkdir(parents=True); path.write_bytes(source)
dependency="""    <dependency>\n      <groupId>proof.local</groupId>\n      <artifactId>fixture</artifactId>\n      <version>1.0.0</version>\n    </dependency>\n"""
pom=web/'pom.xml'; text=pom.read_text()
if text.count(dependency)!=1: raise ValueError("unexpected native dependency")
pom.write_text(text.replace(dependency,''))
''')
        run(['git','init','-q',project]); run(['git','-C',project,'add','.']); run(['git','-C',project,'-c','user.name=Proof','-c','user.email=proof@example.invalid','commit','-qm','disposable proof']); run(['git','clone','-q','--no-local',project,clone]); shutil.rmtree(project); shutil.rmtree(creator)
        bundle=clone/'zero-libraries/fixture/1.0.0'; verify(bundle, manifest)
        # Fail closed before using any bundle: change each file and remove each file.
        for f in FILES:
            p=bundle/f; original=p.read_bytes(); p.write_bytes(original+b'!')
            try: verify(bundle, manifest); raise AssertionError('tamper accepted '+f)
            except ValueError: pass
            p.unlink()
            try: verify(bundle, manifest); raise AssertionError('missing accepted '+f)
            except ValueError: pass
            p.write_bytes(original)
        verify(bundle, manifest)
        # Rehashing tampered bytes and changing the project manifest must still
        # fail against the separately retained accepted fixture metadata.
        changed=bundle/FILES[0]; original=changed.read_bytes(); changed.write_bytes(original+b'!')
        altered=json.loads((bundle/'manifest.json').read_text()); altered['files'][FILES[0]]={'size':changed.stat().st_size,'sha256':digest(changed.read_bytes())}
        write(bundle/'manifest.json',json.dumps(altered))
        try: verify(bundle,manifest); raise AssertionError('rewritten manifest accepted')
        except ValueError: pass
        changed.write_bytes(original); write(bundle/'manifest.json',json.dumps(manifest,indent=2)+'\n')
        verify(bundle, manifest); print('TAMPER_MISSING_LICENSE_REJECTED',flush=True)
        # A private Maven cache is seeded with third-party tools and only the exact verified
        # library files. Offline mode forbids any HTTP access, including either library host.
        cache=base/'maven-cache'; run(['cp','-cR',Path.home()/'.m2/repository',cache]); dest=cache/'proof/local/fixture/1.0.0'; shutil.rmtree(dest,ignore_errors=True); dest.mkdir(parents=True)
        for f in FILES[:3]: shutil.copy2(bundle/f,dest/f)
        for f in FILES[:3]:
            if digest((dest/f).read_bytes())!=manifest['files'][f]['sha256']: raise AssertionError('seed mismatch')
        mvn=next((Path.home()/'.m2/wrapper/dists/apache-maven-3.9.11').glob('*/bin/mvn'))
        run([mvn,'-o','-B','-ntp',f'-Dmaven.repo.local={cache}','compile'],cwd=clone)
        fxjars=sorted(p for p in (cache/'org/openjfx').glob('javafx-*/21.0.12/*.jar') if not p.name.endswith(('-sources.jar','-javadoc.jar')))
        if not fxjars: raise AssertionError('JavaFX cache absent')
        cp=os.pathsep.join(map(str,[clone/'target/classes',dest/FILES[0],*fxjars]))
        harness=base/'harness'; harness.mkdir()
        run(['javac','--release','17','-cp',cp,'-d',harness,clone/'proof/NativeCheck.java'])
        run(['java','-cp',str(harness)+os.pathsep+cp,'NativeCheck',dest/FILES[0]],cwd=clone)
        print('CLONE_OFFLINE_NATIVE_PROOF_OK',flush=True)
        if '--web' in sys.argv:
            # Scratch derived solely from the clone: the adapter removes only the
            # native Maven pin and materializes the verified saved source entry.
            web=base/'web-project'
            shutil.copytree(clone,web,ignore=shutil.ignore_patterns('.git','target','zero-libraries'))
            verify(bundle,manifest)
            run([sys.executable,clone/'proof/web_bridge.py',web,bundle,manifest['files'][FILES[1]]['sha256']])
            with zipfile.ZipFile(bundle/FILES[1]) as z:
                src=z.read('proof/fixture/Score.java')
            if (web/'src/main/java/proof/fixture/Score.java').read_bytes()!=src: raise AssertionError('web source mismatch')
            for original in (clone/'src/main/java').rglob('*.java'):
                if original.read_bytes()!=(web/original.relative_to(clone)).read_bytes(): raise AssertionError('cloned app source changed')
            env=dict(os.environ); env.setdefault('NODE_PATH',str(Path.home()/'Repos/zero/node_modules'))
            run(['node',ROOT/'scripts/export-web.mjs',web,'--cache',Path.home()/'.cache/zero/web-export'],env=env)
            print('WEBFX_BUILD_OK',web,flush=True)
            if '--browser' in sys.argv:
                import http.server, threading
                site=web/'.zero/web-export/site'; served=base/'served'/'student'/'game'; served.parent.mkdir(parents=True)
                shutil.copytree(site,served)
                class Quiet(http.server.SimpleHTTPRequestHandler):
                    def __init__(self,*args,**kw): super().__init__(*args,directory=str(base/'served'),**kw)
                    def log_message(self,*args): pass
                server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Quiet)
                threading.Thread(target=server.serve_forever,daemon=True).start()
                cli=Path.home()/'.codex/skills/playwright/scripts/playwright_cli.sh'
                session='owned-bundle-'+base.name.rsplit('-',1)[-1]
                try:
                    run([cli,'-s='+session,'open',f'http://127.0.0.1:{server.server_port}/student/game/','--browser','chrome'],cwd=base)
                    import time
                    for _ in range(30):
                        snap=run([cli,'-s='+session,'snapshot'],cwd=base,stdout=subprocess.PIPE).stdout
                        if 'Score: 11' in snap: break
                        time.sleep(1)
                    else: raise AssertionError('Browser label absent: '+snap)
                    print('REAL_BROWSER_SCORE_OK',flush=True)
                    run([cli,'-s='+session,'console','error'],cwd=base)
                finally:
                    subprocess.run([str(cli),'-s='+session,'close'],cwd=base,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
                    server.shutdown(); server.server_close()


if __name__=='__main__': main()
