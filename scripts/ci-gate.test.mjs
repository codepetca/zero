import test from 'node:test';
import assert from 'node:assert/strict';
import {checkGate} from './ci-gate.mjs';
import {readFileSync} from 'node:fs';

test('required aggregate fails selected missing, failed, cancelled or skipped work',()=>{
  checkGate({scope:'success',selected:'true',result:'success'});
  checkGate({scope:'success',selected:'false',result:'skipped'});
  for(const result of ['failure','cancelled','skipped',undefined])assert.throws(()=>checkGate({scope:'success',selected:'true',result}));
  for(const scope of ['failure','skipped',undefined])assert.throws(()=>checkGate({scope,selected:'false',result:'skipped'}));
  for(const selected of ['',undefined,'maybe'])assert.throws(()=>checkGate({scope:'success',selected,result:'success'}));
});
test('all caller workflows use PR-only cancellation, distinct event groups and an always-running final gate',()=>{
  for(const name of ['release-review','web-export','windows-native']){
    const text=readFileSync(new URL(`../.github/workflows/${name}.yml`,import.meta.url),'utf8');
    assert.match(text,/group: \$\{\{ github.workflow \}\}-\$\{\{ github.event_name \}\}-\$\{\{ github.event.pull_request.number \|\| github.run_id \}\}/,name);
    assert.match(text,/cancel-in-progress: \$\{\{ github.event_name == 'pull_request' \}\}/,name);
    assert.match(text,/uses: \.\/\.github\/workflows\/ci-scope.yml/,name);
    assert.match(text,/if: \$\{\{ always\(\) \}\}/,name);
    assert.match(text,/ZERO_CI_GATE: '1'/,name);
    assert.match(text,/SCOPE_RESULT: \$\{\{ needs.scope.result \}\}/,name);
  }
});
