import type { NextConfig } from 'next';
import { resolve } from 'node:path';
// The reviewed discovery rules are shared with the packaged extension.
const repositoryRoot = resolve(process.cwd(), '..');
const config: NextConfig = {
  poweredByHeader: false, devIndicators: false, agentRules: false,
  turbopack: { root: repositoryRoot }, outputFileTracingRoot: repositoryRoot,
  outputFileTracingIncludes: {'/api/jams/template':['../jam-template/**/*'],'/api/jams/template/preview':['../jam-template/**/*']},
  async headers() {
    // Authenticated confirmations are top-level. The separate public panel route
    // supplies its accepted creator-origin frame policy dynamically.
    return ['/hub/jams/create','/hub/jams/:id','/hub/jams/:id/participate'].map(source => ({source,
      headers:[{key:'X-Frame-Options',value:'DENY'},
        {key:'Content-Security-Policy',value:"frame-ancestors 'none'"},
        {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'}]}));
  },
};
export default config;
