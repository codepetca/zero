// The production pilot requires a separate explicit server-side admission flag.
// The write flag alone cannot expose routes or disable visibility enforcement.
export function jamsPreviewAvailable(env = process.env) {
  return env.NODE_ENV === 'development' && env.VERCEL_ENV !== 'production' && env.VERCEL_ENV !== 'preview' ||
    env.NODE_ENV === 'production' && env.VERCEL === '1' && env.VERCEL_ENV === 'production' && env.ZERO_JAMS_PILOT_ENABLED === '1';
}

// Directory promotion is a separate opt-in from the direct-link pilot.
export function jamsNavigationAvailable(env=process.env) {
  return jamsPreviewAvailable(env) &&
    (env.NODE_ENV==='development' || env.ZERO_JAMS_DISCOVERY_ENABLED==='1' && env.ZERO_JAMS_ENABLED==='1');
}

export function hiddenJamsResponse(env) {
  return jamsPreviewAvailable(env) ? null : new Response('Not found', {status:404,
    headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex'}});
}
