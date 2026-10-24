import contracts from '../extension/src/sharing/contracts.js';
import pom from '../extension/src/project-pom.js';

const {parseXml,single,value,allNodes}=pom;
const MAX_LIBRARIES=128;
const invalid=()=>{throw new Error('Invalid adoption observation');};
const compare=(a,b)=>a.id.localeCompare(b.id)||a.version.localeCompare(b.version);

/** Ledger-only metadata: never added to the strict public release/catalog. */
export function validateAdoption(input) {
  if(!input||typeof input!=='object'||Array.isArray(input)||input.schema!==1||Object.keys(input).sort().join(',')!=='libraries,schema'||!Array.isArray(input.libraries)||input.libraries.length>MAX_LIBRARIES)invalid();
  let previous;
  const libraries=input.libraries.map(entry=>{
    if(!entry||typeof entry!=='object'||Array.isArray(entry)||Object.keys(entry).sort().join(',')!=='id,version')invalid();
    const match=/^lib-r([1-9][0-9]{0,19})-([a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/.exec(entry.id);
    if(!match||contracts.identity('library',match[1],match[2]).id!==entry.id)invalid();
    contracts.validateVersion(entry.version);
    if(previous&&compare(previous,entry)>=0)invalid();
    previous=entry;
    return {id:entry.id,version:entry.version};
  });
  return {schema:1,libraries};
}

/** Inspect only the already captured root POM. Unsupported data means unknown,
 * never a publication failure or a claimed observed zero. No Maven is executed. */
export function inspectAdoption(files) {
  try {
    const matches=files.filter(file=>file.path==='pom.xml');
    if(matches.length!==1)return undefined;
    const bytes=matches[0].data??matches[0].bytes;
    if(!bytes||bytes.length>2*1024*1024)return undefined;
    const input=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    const project=parseXml(input);
    if(allNodes(project).some(node=>['parent','profiles','modules'].includes(node.name)))return undefined;
    const properties=single(project,'properties',true),values=new Map();
    if(properties&&properties.children.length>128)return undefined;
    for(const node of properties?.children||[]){if(values.has(node.name))return undefined;values.set(node.name,value(node));}
    // Match the snapshot policy's bounded property graph; metric inspection must
    // never expand candidate text without byte, depth and total-work limits.
    const memo=new Map(),active=new Set();let work=0;
    function charge(size){work+=size;if(work>262144)invalid();}
    function property(key,depth){
      if(depth>32||!values.has(key)||active.has(key))invalid();
      if(memo.has(key)){const found=memo.get(key);if(depth+found.height>32)invalid();return found;}
      active.add(key);const result=expand(values.get(key),depth);active.delete(key);memo.set(key,result);return result;
    }
    function expand(text,depth=0){
      if(Buffer.byteLength(text)>4096)invalid();charge(text.length);
      const chunks=[];let size=0,offset=0,height=0;
      function append(chunk){size+=Buffer.byteLength(chunk);if(size>4096)invalid();charge(chunk.length);chunks.push(chunk);}
      for(const match of text.matchAll(/\$\{([^}]+)\}/g)){
        append(text.slice(offset,match.index));const found=property(match[1],depth+1);append(found.value);height=Math.max(height,found.height+1);offset=match.index+match[0].length;
      }
      if(depth+height>32)invalid();append(text.slice(offset));return {value:chunks.join(''),height};
    }
    for(const key of values.keys())property(key,0);
    const dependencies=single(project,'dependencies',true),libraries=new Map();
    for(const node of dependencies?.children||[]){
      if(node.name!=='dependency')return undefined;
      const group=expand(value(single(node,'groupId'))).value;
      const match=/^ca\.codepet\.zero\.contrib\.r([1-9][0-9]{0,19})$/.exec(group);
      if(!match){if(group.startsWith('ca.codepet.zero.contrib.'))return undefined;continue;}
      const artifact=expand(value(single(node,'artifactId'))).value;
      const version=expand(value(single(node,'version'))).value;
      const identity=contracts.identity('library',match[1],artifact);
      contracts.validateVersion(version);
      const entry={id:identity.id,version};libraries.set(`${entry.id}/${version}`,entry);
      if(libraries.size>MAX_LIBRARIES)return undefined;
    }
    return validateAdoption({schema:1,libraries:[...libraries.values()].sort(compare)});
  }catch{return undefined;}
}

const newer=(a,b)=>{const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i];return false;};

/** Pure projection of accepted observations. Coverage and counts describe shared
 * source declarations, not people, private work, downloads or runtime use. */
export function generateAdoption(state) {
  const status=new Map(state.availability.map(event=>[event.key,event.status]));
  const games=new Map(),acceptedLibraries=new Set(),counts=new Map();
  for(const [key,record]of Object.entries(state.releases)){
    const release=record.release;
    if(record.delivery!=='ready')continue;
    const available=(status.get(key)||release.status||'available')==='available';
    if(release.kind==='library'){
      // Withdrawal blocks new discovery, but does not erase an accepted pin
      // already declared by a shared consumer. Only visible library IDs get rows.
      acceptedLibraries.add(`${release.id}/${release.version}`);
      if(available&&!counts.has(release.id))counts.set(release.id,new Set());
    }else if(release.kind==='game'&&available){
      const previous=games.get(release.id);
      if(!previous||newer(release.version,previous.release.version))games.set(release.id,record);
    }
  }
  const coverage=new Map();
  for(const record of games.values()){
    const repository=record.release.repository.id;
    const observed=record.adoption===undefined?undefined:validateAdoption(record.adoption);
    coverage.set(repository,(coverage.get(repository)??true)&&observed!==undefined);
    for(const library of observed?.libraries||[]){
      const target=/^lib-r([1-9][0-9]*)-/.exec(library.id)[1];
      if(target!==repository&&counts.has(library.id)&&acceptedLibraries.has(`${library.id}/${library.version}`))counts.get(library.id).add(repository);
    }
  }
  return {schema:1,observedProjects:[...coverage.values()].filter(Boolean).length,totalProjects:coverage.size,libraries:[...counts].sort(([a],[b])=>a.localeCompare(b)).map(([id,repositories])=>({id,projects:repositories.size}))};
}
