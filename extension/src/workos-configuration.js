'use strict';

const {readFileSync} = require('node:fs');
const path = require('node:path');

const configurationPath = path.join(__dirname, 'workos-distribution.json');

function isWorkOSClientId(value) {
  return typeof value === 'string' && /^client_[A-Za-z0-9]{1,128}$/.test(value);
}

function validateWorkOSDistribution(configuration) {
  if (!configuration || typeof configuration !== 'object'
      || Object.keys(configuration).sort().join(',') !== 'mode,productionClientId') {
    throw new Error('WorkOS distribution settings must contain only mode and productionClientId.');
  }
  if (configuration.mode === 'optional' && configuration.productionClientId === null) return configuration;
  if (configuration.mode === 'required' && isWorkOSClientId(configuration.productionClientId)) return configuration;
  throw new Error('Set workos-distribution.json to optional with a null productionClientId, or required with a valid production client ID.');
}

function readWorkOSDistribution() {
  try { return JSON.parse(readFileSync(configurationPath, 'utf8')); }
  catch { throw new Error('Could not read extension/src/workos-distribution.json.'); }
}

function resolveWorkOSFirstUseConfiguration({development, env = process.env, readDistribution = readWorkOSDistribution} = {}) {
  if (development) {
    // Only a source extension host may opt in to staging via its environment.
    const clientId = env.ZERO_WORKOS_CLIENT_ID;
    return {required: Boolean(clientId), clientId};
  }
  try {
    const {mode, productionClientId} = validateWorkOSDistribution(readDistribution());
    return {required: mode === 'required', clientId: productionClientId};
  } catch {
    // Missing or damaged installed policy must not restore ungated use.
    return {required: true, clientId: null};
  }
}

if (require.main === module) validateWorkOSDistribution(readWorkOSDistribution());

module.exports = {isWorkOSClientId, readWorkOSDistribution, resolveWorkOSFirstUseConfiguration, validateWorkOSDistribution};
