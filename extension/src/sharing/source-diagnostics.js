'use strict';
// Public correction categories are defined by trusted code, never by candidate
// metadata or operational error text. No raw message/stack is returned.
const MESSAGES=Object.freeze({
  'descriptor-missing':'Include the saved sharing descriptor in the uploaded commit, then prepare another Share request.',
  'descriptor-invalid':'Fix the sharing descriptor with Edit sharing details, upload it, then prepare another Share request.',
  'descriptor-drift':'The uploaded sharing details differ from the request. Upload the intended details and prepare a fresh Share request.',
  'game-main':'Keep the main Java file, its package and main method consistent with zero.json and the Maven main-class setting.',
  'game-framework':'Include readable zero.SimpleApp and zero.GameApp source from the Zero starter.',
  'game-license':'Include the applicable readable license and Maven wrapper notices in your uploaded project.',
  'game-pins':'Use exact dependency/plugin releases, Java 17 and JavaFX 21.0.12. Remove floating versions or unsupported parent/profile/extension/BOM settings.',
  'game-pom':'Use a well-formed ordinary Zero POM. Keep properties finite and bounded; remove unsupported or cyclic expansions.',
  'game-wrapper':'Keep the pinned Maven wrapper supplied by Zero; use the supported starter wrapper files.',
  'game-ignore':'Keep private and generated files ignored. Remove rules that unignore these files.',
  'game-files':'Include the required Zero project files and use supported ordinary paths and source-size limits.',
  'version-conflict':'This version already contains different accepted source. Choose a new version, upload its metadata and prepare another Share request.',
  'source-check':'Check the supported sharing structure, run your project locally, upload corrections and prepare a fresh Share request.'
});
function validateSourceDiagnostic(input) {
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['code','file'].includes(key))||!Object.hasOwn(MESSAGES,input.code))throw new Error('Invalid public source diagnostic.');
  if(input.file!==undefined && (typeof input.file!=='string'||input.file.length>240||! /^(?:LICENSE|zero-(?:game|library)\.json|\.gitignore|\.mvn\/wrapper\/(?:LICENSE-APACHE-2\.0\.txt|NOTICE)|src\/main\/java\/[A-Za-z0-9_$/.-]+\.java|libraries\/[a-z][a-z0-9-]*\/(?:LICENSE|zero-library\.json))$/.test(input.file)||input.file.split('/').some(part=>['.','..'].includes(part))))throw new Error('Invalid public source diagnostic path.');
  return {code:input.code,...(input.file!==undefined?{file:input.file}:{})};
}
function diagnosticFromError(error) {
  const message=typeof error?.message==='string'?error.message:'';
  let code='source-check';
  if(/^Immutable version conflict; use a new version$/.test(message))code='version-conflict';
  else if(/^Committed sharing descriptor missing:/.test(message))code='descriptor-missing';
  else if(/^Committed sharing descriptor is invalid/.test(message))code='descriptor-invalid';
  else if(/^Committed descriptor differs/.test(message))code='descriptor-drift';
  else if(/license|wrapper notices/i.test(message))code='game-license';
  else if(/main class|main method|main package|zero\.json/i.test(message))code='game-main';
  else if(/framework source/.test(message))code='game-framework';
  else if(/exact release|JavaFX dependencies|must target Java|parent, profile|BOM imports/.test(message))code='game-pins';
  else if(/POM|property|properties|XML/.test(message))code='game-pom';
  else if(/wrapper differs/.test(message))code='game-wrapper';
  else if(/unignore/.test(message))code='game-ignore';
  else if(/game file|game source|archive path|game path|source exceeds|Duplicate\/case-colliding|Symlink/.test(message))code='game-files';
  const candidate=/(?:Required game file missing|Committed sharing descriptor missing|Include the applicable readable license file): ([^\r\n]+)$/.exec(message)?.[1];
  if(candidate) {
    if(/(?:LICENSE|NOTICE)$/.test(candidate)||/LICENSE-APACHE/.test(candidate))code='game-license';
    else if(/^src\/main\/java\/zero\/(?:SimpleApp|GameApp)\.java$/.test(candidate))code='game-framework';
    else if(/^src\/main\/java\//.test(candidate))code='game-main';
    try{return validateSourceDiagnostic({code,file:candidate});}catch{}
  }
  return {code};
}
function publicCorrection(record) {
  const attempt=Array.isArray(record?.attempts)?record.attempts.at(-1):null;
  if(record?.status!=='failed'||attempt?.kind!=='source-failure'||!attempt.sourceDiagnostic)return undefined;
  const diagnostic=validateSourceDiagnostic(attempt.sourceDiagnostic);
  return {...diagnostic,message:MESSAGES[diagnostic.code]};
}
module.exports={MESSAGES,validateSourceDiagnostic,diagnosticFromError,publicCorrection};
