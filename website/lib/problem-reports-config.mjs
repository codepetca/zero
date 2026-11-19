import {createPrivateKey} from 'node:crypto';

const positiveId = value => /^[1-9]\d{0,15}$/.test(value || '') && Number.isSafeInteger(Number(value));

/** Dedicated secrets only: never borrow student OAuth or ZeroHub credentials. */
export function problemReportsConfig(env = process.env) {
  if (env.ZERO_REPORTS_ENABLED !== 'true' ||
      !['production', 'development'].includes(env.ZERO_REPORTS_ENVIRONMENT) ||
      (env.VERCEL_ENV && env.VERCEL_ENV !== 'production') ||
      (env.CONTEXT && env.CONTEXT !== 'production') ||
      (env.NODE_ENV === 'production' && env.ZERO_REPORTS_ENVIRONMENT !== 'production')) return null;
  if (!positiveId(env.ZERO_REPORTS_GITHUB_APP_ID) || !positiveId(env.ZERO_REPORTS_GITHUB_INSTALLATION_ID) ||
      !positiveId(env.ZERO_REPORTS_REPOSITORY_ID) ||
      !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(env.ZERO_REPORTS_REPOSITORY || '')) return null;
  try {
    const database = new URL(env.ZERO_REPORTS_DATABASE_URL);
    // pg connection-string TLS options can override Pool.ssl. Accept an explicit
    // bare DSN only; production always verifies the server certificate.
    if (!['postgres:', 'postgresql:'].includes(database.protocol) || !database.hostname || !database.pathname.slice(1) ||
        database.search || database.hash) return null;
    if (env.ZERO_REPORTS_ENVIRONMENT === 'production' && ['localhost', '127.0.0.1', '[::1]'].includes(database.hostname)) return null;
    if (typeof env.ZERO_REPORTS_GITHUB_PRIVATE_KEY !== 'string' || env.ZERO_REPORTS_GITHUB_PRIVATE_KEY.length > 16384) return null;
    const key = createPrivateKey(env.ZERO_REPORTS_GITHUB_PRIVATE_KEY);
    if (key.asymmetricKeyType !== 'rsa') return null;
    return Object.freeze({databaseUrl:database.href, local:env.ZERO_REPORTS_ENVIRONMENT === 'development',
      appId:env.ZERO_REPORTS_GITHUB_APP_ID, installationId:Number(env.ZERO_REPORTS_GITHUB_INSTALLATION_ID),
      repository:env.ZERO_REPORTS_REPOSITORY, repositoryId:Number(env.ZERO_REPORTS_REPOSITORY_ID), key});
  } catch { return null; }
}
