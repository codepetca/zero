"""Fixed trusted policy. Candidate Java is only loaded in separately invoked runtime stages."""
import base64, json, pathlib, subprocess, sys, zipfile, io, os
ROOT=pathlib.Path('/input'); TMP=pathlib.Path('/tmp/work'); TMP.mkdir()
FX='/opt/javafx'; MODULES='javafx.controls,javafx.swing'
d=json.loads((ROOT/'descriptor.json').read_text())
current=d.get('schema')==2
namespace=d['namespace'] if current else 'zero.'+d['libraryId']
names=d['classes'] if current else [namespace+'.'+c['className'] for c in d['components']]
source_root=ROOT/'src/main/java' if current else ROOT/'src'
groups=d['groups'] if current else {'behavior':['BehaviorCheck'],'first':['Main'],'second':['Main']}
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
    sources=sorted(source_root.rglob('*.java'))
    checks=sorted((ROOT/'src/test/java').rglob('*.java'))+sorted((ROOT/'examples/first').rglob('*.java'))+sorted((ROOT/'examples/second').rglob('*.java')) if current else [ROOT/'checks/BehaviorCheck.java',ROOT/'examples/first/Main.java',ROOT/'examples/second/Main.java']
    run(['java','--module-path',FX+':/policy/checker.jar','--module','zero.hub.checker/hub.policy.Boundary',namespace]+[str(s) for s in sources+checks])
    out=TMP/'classes';out.mkdir();javac(sources,out)
    entries={'META-INF/LICENSE':(ROOT/'LICENSE').read_bytes(),'META-INF/MANIFEST.MF':b'Manifest-Version: 1.0\r\n\r\n'}
    allowed={n.replace('.','/')+'.class' for n in names}
    found=set()
    for p in out.rglob('*'):
        if p.is_file():
            rel=p.relative_to(out).as_posix()
            top=rel.split('$')[0]+'.class' if '$' in rel else rel
            if not rel.startswith(namespace.replace('.','/')+'/') or not rel.endswith('.class') or top not in allowed: raise ValueError('Compiler emitted foreign/undeclared class '+rel)
            entries[rel]=p.read_bytes();found.add(p.stem)
    if not allowed.issubset(set(entries)): raise ValueError('Missing declared compiled class')
    if current:
        for p in sorted((ROOT/'src/main/resources').rglob('*')):
            if p.is_file():
                relative=p.relative_to(ROOT/'src/main/resources').as_posix()
                if relative in entries: raise ValueError('Resource cannot replace a compiled class')
                entries[relative]=p.read_bytes()
    jar=archive(entries)
    src={'META-INF/LICENSE':(ROOT/'LICENSE').read_bytes()}
    src.update({p.relative_to(source_root).as_posix():p.read_bytes() for p in sources})
    if current:
        src.update({p.relative_to(ROOT/'src/main/resources').as_posix():p.read_bytes() for p in sorted((ROOT/'src/main/resources').rglob('*')) if p.is_file()})
    components=[]
    if current:
        for name in names:
            proc=subprocess.run(['javap','-public','-classpath',str(out),name],check=True,capture_output=True,text=True,env={'PATH':'/opt/java/openjdk/bin:/usr/bin:/bin','HOME':'/tmp','LANG':'C.UTF-8'})
            api=[line.strip().rstrip(';') for line in proc.stdout.splitlines() if line.strip().startswith('public ') and not line.strip().endswith('{')]
            if len(api)>100 or any(len(signature)>1000 for signature in api): raise ValueError('Public API exceeds checked inventory bounds')
            components.append({'className':name,'description':'','usage':'','api':api[:100]})
        if len(json.dumps(components).encode())>16384: raise ValueError('Public API inventory exceeds checked metadata bounds')
    print(json.dumps({'jar':base64.b64encode(jar).decode(),'sources':base64.b64encode(archive(src)).decode(),**({'components':components} if current else {})}))
 else:
    cp='/input/library.jar'; args=['java','-Xmx256m','-XX:ActiveProcessorCount=1','-Djava.library.path=/opt/javafx/native','-Djavafx.cachedir=/opt/javafx/native','-Dprism.order=sw','--module-path',FX+':/policy/checker.jar','--add-modules',MODULES]
    if mode=='api':
        run(args+['-cp',cp,'--module','zero.hub.checker/hub.policy.TrustedRun','api']+([d['libraryKind']] if current else [])+names)
    else:
        source_dir=ROOT/('src/test/java' if mode=='behavior' else 'examples/'+mode) if current else None
        sources=sorted(source_dir.rglob('*.java')) if current else [ROOT/('checks/BehaviorCheck.java' if mode=='behavior' else 'examples/'+mode+'/Main.java')]
        out=TMP/'consumer';out.mkdir();javac(sources,out,'/input/library.jar')
        # No component source or build output on consumers' classpath: exact immutable JAR only.
        for main in groups[mode]:
            one=args+['-javaagent:/policy/checker.jar='+namespace+'|/input/library.jar','-cp',cp+':'+str(out),'--module','zero.hub.checker/hub.policy.TrustedRun',mode,main,namespace]
            run(['xvfb-run','--auto-servernum','--server-args=-screen 0 1024x768x24 -nolisten tcp']+one)
except Exception as failure:
    print(str(failure),file=sys.stderr);sys.exit(1)
