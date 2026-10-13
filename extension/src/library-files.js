'use strict';
const path=require('node:path');
const {read,discoverLibraries}=require('./sharing/authoring');
const {validateDescriptor}=require('./sharing/contracts');
async function libraryLayout(root) {
 const text=await read(root,'zero-library.json',true);if(text===null)return null;
 if(Buffer.byteLength(text)>65536)throw new Error('Library metadata is too large.');
 const descriptor=validateDescriptor(JSON.parse(text));if(descriptor.kind!=='library')throw new Error('Use a library descriptor for this folder.');
 return {descriptor,sources:path.join(root,'src/main/java'),readme:path.join(root,'README.md'),examples:path.join(root,'examples'),checks:path.join(root,'src/test/java')};
}
async function libraryLayouts(root) {
 return (await discoverLibraries(root)).map(library=>({...library,sources:path.join(root,library.folder,'src/main/java'),readme:path.join(root,library.folder,'README.md'),examples:path.join(root,library.folder,'examples'),checks:path.join(root,library.folder,'src/test/java')}));
}
module.exports={libraryLayout,libraryLayouts};
