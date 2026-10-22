export function checkGate({scope,selected,result}) {
  if(scope!=='success')throw new Error('CI scope job did not succeed.');
  if(!['true','false'].includes(selected))throw new Error('CI selection is missing or invalid.');
  if(selected==='true'&&result!=='success')throw new Error(`Selected CI job did not pass (${result}).`);
  if(selected==='false'&&!['success','skipped'].includes(result))throw new Error(`Unselected CI job failed (${result}).`);
}
if(process.env.ZERO_CI_GATE==='1')checkGate({scope:process.env.SCOPE_RESULT,selected:process.env.SELECTED,result:process.env.JOB_RESULT});
