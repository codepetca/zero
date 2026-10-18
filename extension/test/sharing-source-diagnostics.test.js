'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {diagnosticFromError,publicCorrection,validateSourceDiagnostic}=require('../src/sharing/source-diagnostics');
test('public source corrections distinguish supported failures without reflecting raw errors',()=>{
  for(const [message,code,file]of [['Required game file missing: LICENSE','game-license','LICENSE'],['Required game file missing: src/main/java/Main.java','game-main','src/main/java/Main.java'],['Pin every external game dependency and plugin to an exact release','game-pins'],['Game POM uses a cyclic property','game-pom'],['Committed descriptor differs from the frozen publication request','descriptor-drift'],['Include a square PNG screenshot using Edit sharing details','game-screenshot'],['The committed game screenshot is missing','game-screenshot']]) {
    const sourceDiagnostic=diagnosticFromError(new Error(message));assert.equal(sourceDiagnostic.code,code);assert.equal(sourceDiagnostic.file,file);
    const correction=publicCorrection({status:'failed',attempts:[{kind:'source-failure',message:'operator secret',diagnostics:[{message:'private stack'}],sourceDiagnostic}]});
    assert.doesNotMatch(JSON.stringify(correction),/operator secret|private stack/);assert.ok(correction.message.length>20);
  }
  assert.deepEqual(diagnosticFromError(new Error('Bearer private account token https://private.example')),{code:'source-check'});
  assert.equal(publicCorrection({status:'paused',attempts:[{kind:'infrastructure-failure',sourceDiagnostic:{code:'game-pom'}}]}),undefined);
  for(const code of ['library-build','library-api','library-behavior','library-example']){
    const correction=publicCorrection({status:'failed',attempts:[{kind:'source-failure',message:'candidate private stderr',sourceDiagnostic:{code}}]});
    assert.equal(correction.code,code);assert.doesNotMatch(correction.message,/candidate private stderr/);
  }
  for(const input of [{code:'operator-note'},{code:'game-pom',message:'private'},{code:'game-files',file:'../.env'},{code:'game-license',file:'.env'}])assert.throws(()=>validateSourceDiagnostic(input));
});
