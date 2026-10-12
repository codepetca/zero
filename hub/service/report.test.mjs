import test from 'node:test';
import assert from 'node:assert/strict';
import {REQUIRED_GATES,validReport} from './report.mjs';

const sourceDigest='a'.repeat(64);
const policyDigest='b'.repeat(64);
function report() {
  return {passed:true,policy:'zero-widgets-v1',policyDigest,sourceDigest,checks:REQUIRED_GATES.map(id=>({id,passed:true,detail:'Trusted completed gate'})),platforms:['linux-arm64']};
}
test('passed verdict requires every mandatory gate exactly once and true',()=>{
  assert.equal(validReport(report(),sourceDigest,policyDigest),true);
  for(const mutate of [value=>value.checks.pop(),value=>value.checks.push({...value.checks[0]}),value=>value.checks[5]={...value.checks[0]},value=>value.checks[2].passed=false,value=>value.checks.push({id:'forged-receipt',passed:true,detail:'Client assertion'})]) {
    const value=report();mutate(value);assert.equal(validReport(value,sourceDigest,policyDigest),false);
  }
});
test('source and current implementation digest are independent authority requirements',()=>{
  assert.equal(validReport(report(),'c'.repeat(64),policyDigest),false);
  assert.equal(validReport(report(),sourceDigest,'c'.repeat(64)),false);
  const missing=report();delete missing.policyDigest;assert.equal(validReport(missing,sourceDigest,policyDigest),false);
  assert.equal(validReport(report(),sourceDigest,undefined),false);
});
test('failed checks retain bounded useful partial reports',()=>{
  const failed=report();failed.passed=false;failed.checks=failed.checks.slice(0,2);failed.checks[1].passed=false;failed.checks[1].detail='Compile error at declared source';
  assert.equal(validReport(failed,sourceDigest,policyDigest),true);
  failed.checks.push({...failed.checks[0]});assert.equal(validReport(failed,sourceDigest,policyDigest),false);
});
