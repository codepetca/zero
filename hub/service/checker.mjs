import * as checker from '../checker/runner.mjs';
import {runWorker} from './worker-runtime.mjs';
import {runMain} from './runtime.mjs';
await runMain(()=>runWorker({kind:'checker',checker}));
