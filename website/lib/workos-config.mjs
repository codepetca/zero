export function workosRequested(env = process.env) {
  return env.ZERO_WORKOS_ENABLED === 'true';
}

export function workosConfigured(env = process.env) {
  if (!workosRequested(env) || !/^client_[A-Za-z0-9]+$/.test(env.WORKOS_CLIENT_ID || '') ||
      typeof env.WORKOS_COOKIE_PASSWORD !== 'string' || env.WORKOS_COOKIE_PASSWORD.length < 32 ||
      env.WORKOS_COOKIE_NAME !== 'zero-workos-session' || env.WORKOS_COOKIE_DOMAIN ||
      (env.WORKOS_API_HOSTNAME && env.WORKOS_API_HOSTNAME !== 'api.workos.com') ||
      (env.WORKOS_API_HTTPS && env.WORKOS_API_HTTPS !== 'true') ||
      (env.WORKOS_API_PORT && env.WORKOS_API_PORT !== '443') ||
      env.WORKOS_ISSUER !== `https://api.workos.com/user_management/${env.WORKOS_CLIENT_ID}`) return false;
  try {
    const url = new URL(env.NEXT_PUBLIC_WORKOS_REDIRECT_URI);
    const local = (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') && !env.VERCEL &&
      url.protocol === 'http:' && url.hostname === 'localhost' && !!url.port;
    return (url.origin === 'https://zero.codepet.ca' || local) && !url.username && !url.password &&
      url.pathname === '/zero-account/callback' && !url.search && !url.hash;
  } catch { return false; }
}

export function workosSessionIdentity(claims, userId, issuer, now = Date.now()) {
  if (!claims || typeof userId !== 'string' || !/^user_[A-Za-z0-9]{1,128}$/.test(userId) ||
      claims.sub !== userId || claims.iss !== issuer || typeof claims.sid !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(claims.sid) ||
      !Number.isSafeInteger(claims.exp) || claims.exp <= Math.floor(now / 1000)) return null;
  return {userId, sessionId:claims.sid, issuer};
}

export function githubAuthentication(data) {
  return data?.authenticationMethod === 'GitHubOAuth' && !data.impersonator &&
    /^user_[A-Za-z0-9]+$/.test(data.user?.id || '');
}
