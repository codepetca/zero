import {main} from '../triage/runner.mjs';

try {
  console.log(JSON.stringify(await main(process.argv.slice(2))));
} catch(error) {
  // Provider output and diagnostic strings never become model instructions.
  const reason=typeof error.code==='string'&&/^[A-Z_]{2,80}$/.test(error.code)?error.code:'TRIAGE_UNAVAILABLE';
  console.log(JSON.stringify({status:'deferred',reason}));
  process.exitCode=1;
}
