"""Fixed trusted policy. Candidate Java is only loaded in separately invoked runtime stages."""
import base64, json, pathlib, subprocess, sys, zipfile, io, os
ROOT=pathlib.Path('/input'); TMP=pathlib.Path('/tmp/work'); TMP.mkdir()
FX='/opt/javafx'; MODULES='javafx.controls,javafx.swing'
d=json.loads((ROOT/'descriptor.json').read_text())
namespace='zero.'+d['libraryId']
names=[namespace+'.'+c['className'] for c in d['components']]
def run(args):
    subprocess.run(args,check=True,stdout=sys.stderr,stderr=sys.stderr,env={'PATH':'/opt/java/openjdk/bin:/usr/bin:/bin','HOME':'/tmp','LANG':'C.UTF-8','DISPLAY':os.getenv('DISPLAY','')})
def javac(sources,out,cp=None):
    args=['javac','-proc:none','--release','17','--module-path',FX,'--add-modules',MODULES,'-encoding','UTF-8','-d',str(out)]
    if cp: args+=['-classpath',cp]
    run(args+[str(s) for s in sources])
def archive(entries):
    data=io.BytesIO()
    with zipfile.ZipFile(data,'w',compression=zipfile.ZIP_STORED) as z:
        for name,value in sorted(entries.items()):
            info=zipfile.ZipInfo(name,(2020,1,1,0,0,0));info.external_attr=0o100444<<16;info.create_system=3
            z.writestr(info,value)
    return data.getvalue()
mode=sys.argv[1]
try:
 if mode=='build':
    sources=sorted((ROOT/'src').rglob('*.java'))
    checks=[ROOT/'checks/BehaviorCheck.java',ROOT/'examples/first/Main.java',ROOT/'examples/second/Main.java']
    run(['java','-cp','/policy/classes','hub.policy.Boundary',namespace]+[str(s) for s in sources+checks])
    out=TMP/'classes';out.mkdir();javac(sources,out)
    entries={'META-INF/LICENSE':(ROOT/'LICENSE').read_bytes(),'META-INF/MANIFEST.MF':b'Manifest-Version: 1.0\r\n\r\n'}
    allowed={n.split('.')[-1] for n in names}
    found=set()
    for p in out.rglob('*'):
        if p.is_file():
            rel=p.relative_to(out).as_posix()
            if not rel.startswith(namespace.replace('.','/')+'/') or not rel.endswith('.class') or p.stem.split('$')[0] not in allowed: raise ValueError('Compiler emitted foreign/undeclared class '+rel)
            entries[rel]=p.read_bytes();found.add(p.stem)
    if not allowed.issubset(found): raise ValueError('Missing declared compiled class')
    jar=archive(entries)
    src={'META-INF/LICENSE':(ROOT/'LICENSE').read_bytes()}
    src.update({p.relative_to(ROOT/'src').as_posix():p.read_bytes() for p in sources})
    print(json.dumps({'jar':base64.b64encode(jar).decode(),'sources':base64.b64encode(archive(src)).decode()}))
 else:
    cp='/policy/classes:/input/library.jar'; args=['java','-Xmx256m','-XX:ActiveProcessorCount=1','-Djava.library.path=/opt/javafx/native','-Djavafx.cachedir=/opt/javafx/native','-Dprism.order=sw','--module-path',FX,'--add-modules',MODULES]
    if mode=='api':
        run(args+['-cp',cp,'hub.policy.TrustedRun','api']+names)
    else:
        source=ROOT/('checks/BehaviorCheck.java' if mode=='behavior' else 'examples/'+mode+'/Main.java')
        out=TMP/'consumer';out.mkdir();javac([source],out,'/input/library.jar')
        # No component source or build output on consumers' classpath: exact immutable JAR only.
        args+=['-javaagent:/policy/tracker.jar='+namespace,'-cp',cp+':'+str(out),'hub.policy.TrustedRun',mode,'BehaviorCheck' if mode=='behavior' else 'Main',namespace]
        run(['xvfb-run','--auto-servernum','--server-args=-screen 0 1024x768x24 -nolisten tcp']+args)
except Exception as failure:
    print(str(failure),file=sys.stderr);sys.exit(1)
