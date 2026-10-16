import {coreSources} from '../../scripts/prepare-starter.mjs';
import { readFileSync } from 'node:fs';
export function minimalGameFiles() {
  const files=['zero.json','pom.xml','mvnw','mvnw.cmd','.gitignore','LICENSE','.mvn/wrapper/maven-wrapper.properties','.mvn/wrapper/LICENSE-APACHE-2.0.txt','.mvn/wrapper/NOTICE','src/main/java/Main.java'].map(name=>({path:name,data:readFileSync(new URL('../../student-template/'+name,import.meta.url))}));
  for(const name of coreSources)files.push({path:`src/main/java/zero/${name}`,data:readFileSync(new URL(`../../framework/src/main/java/zero/${name}`,import.meta.url))});
  return files;
}
