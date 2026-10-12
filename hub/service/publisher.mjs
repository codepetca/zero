import * as policy from '../checker/policy.mjs';
import {expectedPolicyDigest} from '../checker/image-policy.mjs';
import {runWorker} from './worker-runtime.mjs';
import {runMain} from './runtime.mjs';
// Publication imports validation only; no Docker runner or Java execution.
await runMain(()=>runWorker({kind:'publisher',checker:{...policy,expectedPolicyDigest}}));
