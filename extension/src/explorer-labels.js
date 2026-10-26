'use strict';

// Display the same hierarchy as the student tree. These labels never resolve a
// destination or grant file access; callers still use canonical physical paths.
function authoringLocation({area,baseRelative='',libraryFolder,libraryTitle}={}) {
  const code=area?.endsWith('code'),assets=area?.endsWith('assets');
  if(!code&&!assets)return ['Other project files',...baseRelative.split('/').filter(Boolean)].join(' › ');
  const base=`${libraryFolder?libraryFolder+'/':''}src/main/${code?'java':'resources'}`;
  let suffix=baseRelative===base?'':baseRelative.startsWith(base+'/')?baseRelative.slice(base.length+1):'';
  // A local component's identity namespace is its virtual java/resources root.
  if(libraryFolder)suffix=suffix.split('/').slice(4).join('/');
  return [...(libraryFolder?['Libraries',libraryTitle||libraryFolder.split('/').at(-1)]:[]),code?'java':'resources',...suffix.split('/').filter(Boolean)].join(' › ');
}
module.exports={authoringLocation};
