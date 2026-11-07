'use strict';
// Explicit source-development opt-in only. Verification is not an atomic
// executable identity binding and relies on the trusted installation boundary.
const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url');
async function verifiedAddedRemovalDevHelper(context){
 if(process.platform!=='darwin'||context?.extensionMode!==2||process.env.ZERO_DEV_EXPERIMENTAL_NATIVE_HELPER!=='1'||typeof context.extensionPath!=='string'||!path.isAbsolute(context.extensionPath))throw new Error('Untracked-file removal is unavailable here. Use Source Control; your files are kept.');
 try{const extension=await fs.realpath(context.extensionPath);if(extension!==context.extensionPath||path.basename(extension)!=='extension')throw Error();const root=path.dirname(extension),script=path.join(root,'scripts','stage-dev-native-helper.mjs');if(await fs.realpath(script)!==script)throw Error();const module=await import(pathToFileURL(script).href),manifest=module.verifyDevNativeHelper(root);if(!manifest||manifest.helperPath!==path.join(root,'.verification','zero-dev','native','no-replace-displace'))throw Error();return Object.freeze({helperPath:manifest.helperPath,helperSha256:manifest.sha256});}catch{throw new Error('The experimental Zero Dev helper is missing or unverified. Prepare it with the explicit native-helper opt-in, or use Source Control; your files are kept.');}
}
module.exports={verifiedAddedRemovalDevHelper};
