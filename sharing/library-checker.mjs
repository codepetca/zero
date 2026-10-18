import contracts from '../extension/src/sharing/contracts.js';
import { canonical } from './registry.mjs';
import { checkLibrarySubmission, expectedPolicyDigest, LIBRARY_POLICY, validateLibraryBundle } from '../hub/checker/runner.mjs';

const HEX64=/^[a-f0-9]{64}$/;
// Preserve a UTF-8 BOM so the fixed validator can reject it rather than
// silently changing the source bytes before compilation or source-JAR output.
const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
function sourceError(message){return Object.assign(new Error(message),{kind:'source-failure'});}
function text(bytes,path){try{return decoder.decode(bytes);}catch{throw sourceError(`Invalid UTF-8: ${path}`);}}
function javaIdentity(path,prefix){
  const relative=path.slice(prefix.length);
  if(!relative.endsWith('.java'))throw sourceError(`Expected Java source: ${path}`);
  const parts=relative.slice(0,-5).split('/');
  if(parts.some(part=>! /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(part)))throw sourceError(`Invalid Java source path: ${path}`);
  return parts.join('.');
}
const mainPattern=/\bpublic\s+static\s+void\s+main\s*\(\s*String\s*(?:\[\s*\]\s*\w+|\w+\s*\[\s*\])\s*\)/;
export function prepareLibraryBundle({request,files,sourceDigest}){
  const checked=contracts.validateRequest(request);
  if(checked.kind!=='library'||typeof sourceDigest!=='string'||!HEX64.test(sourceDigest)||!Array.isArray(files))throw sourceError('Expected a frozen library request and exact source digest');
  const identity=contracts.identity('library',checked.repository.id,checked.slug);
  const byPath=new Map(),selected={};let total=0;
  for(const file of files){
    if(!file||typeof file.path!=='string'||!Buffer.isBuffer(file.bytes)||byPath.has(file.path)||
      file.path.includes('\\')||file.path.split('/').some(part=>!part||part==='.'||part==='..'))throw sourceError('Invalid exact library source file');
    byPath.set(file.path,file.bytes);total+=file.bytes.length;
  }
  if(files.length>contracts.LIMITS.libraryFiles||total>contracts.LIMITS.librarySourceBytes)throw sourceError('Library source exceeds checked limits');
  const descriptorBytes=byPath.get('zero-library.json');
  if(!descriptorBytes)throw sourceError('Committed library descriptor missing');
  let descriptor;try{descriptor=contracts.validateDescriptor(JSON.parse(text(descriptorBytes,'zero-library.json')));}catch{throw sourceError('Committed library descriptor is invalid');}
  if(canonical(descriptor)!==canonical(checked.descriptor))throw sourceError('Committed library descriptor differs from the frozen request');
  const license=byPath.get('LICENSE');if(!license)throw sourceError('Library license missing');selected.LICENSE=text(license,'LICENSE');
  const groups={behavior:[],first:[],second:[]},classes=[];
  for(const [path,bytes] of byPath){
    if(path.startsWith('src/main/java/')&&path.endsWith('.java')){
      const name=javaIdentity(path,'src/main/java/');
      if(!name.startsWith(identity.namespace+'.'))throw sourceError(`Foreign library namespace: ${path}`);
      classes.push(name);selected[path]=text(bytes,path);
    }else if(path.startsWith('src/test/java/')&&path.endsWith('.java')||path.startsWith('examples/first/')&&path.endsWith('.java')||path.startsWith('examples/second/')&&path.endsWith('.java')){
      const group=path.startsWith('src/test/java/')?'behavior':path.startsWith('examples/first/')?'first':'second';
      const prefix=group==='behavior'?'src/test/java/':`examples/${group}/`;
      const name=javaIdentity(path,prefix),code=text(bytes,path);
      if(name===identity.namespace||name.startsWith(identity.namespace+'.'))throw sourceError(`Check shadows library namespace: ${path}`);
      if(mainPattern.test(code))groups[group].push(name);
      selected[path]=code;
    }else if(path.startsWith('src/main/resources/')){
      if(!path.startsWith('src/main/resources/'+identity.namespace.replaceAll('.','/')+'/'))throw sourceError(`Foreign library resource namespace: ${path}`);
      selected[path]=bytes.toString('base64');
    }else if(path.endsWith('.java'))throw sourceError(`Unsupported Java source path: ${path}`);
  }
  if(!classes.length||Object.values(groups).some(names=>!names.length))throw sourceError('Library source, behavior check and two examples with main methods are required');
  let preview;
  if(descriptor.preview){preview=byPath.get(descriptor.preview);if(!preview)throw sourceError('Committed library preview missing');selected['preview.png']=preview.toString('base64');}
  const bundle={descriptor:{schema:2,kind:'library',slug:checked.slug,version:checked.version,namespace:identity.namespace,coordinate:identity.coordinate,libraryKind:descriptor.libraryKind,classes:classes.sort(),groups:Object.fromEntries(Object.entries(groups).map(([key,names])=>[key,names.sort()]))},files:selected};
  validateLibraryBundle(bundle);
  return {bundle,preview};
}

export async function checkLibrarySource(input,options={}){
  let prepared;
  try{prepared=prepareLibraryBundle(input);}catch(error){
    if(error.kind!=='source-failure'&&!(error instanceof Error))throw error;
    return {passed:false,policy:LIBRARY_POLICY,policyDigest:expectedPolicyDigest(),sourceDigest:input?.sourceDigest??null,checks:[{id:'source',passed:false,detail:'Library source did not meet the fixed admission format'}],platforms:[],components:[],image:{id:null,platform:null}};
  }
  const result=await checkLibrarySubmission(prepared.bundle,options);
  result.sourceDigest=input.sourceDigest;
  if(result.passed&&prepared.preview)result.artifacts.preview=prepared.preview;
  return result;
}
