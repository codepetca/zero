import type { NextConfig } from 'next';
import { resolve } from 'node:path';
// The reviewed discovery rules are shared with the packaged extension.
const repositoryRoot = resolve(process.cwd(), '..');
const config: NextConfig = {
  poweredByHeader: false, devIndicators: false, agentRules: false,
  turbopack: { root: repositoryRoot }, outputFileTracingRoot: repositoryRoot,
};
export default config;
