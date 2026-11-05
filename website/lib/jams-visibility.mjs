// The production pilot requires a separate explicit server-side admission flag.
// The write flag alone cannot expose routes or disable visibility enforcement.
export function jamsPreviewAvailable(env = process.env) {
  return env.NODE_ENV === 'development' && env.VERCEL_ENV !== 'production' && env.VERCEL_ENV !== 'preview' ||
    env.NODE_ENV === 'production' && env.VERCEL === '1' && env.VERCEL_ENV === 'production' && env.ZERO_JAMS_PILOT_ENABLED === '1';
}

// The hosted pilot is shared by direct invitation, not promoted in Hub navigation.
export function jamsNavigationAvailable(env=process.env) {
  return env.NODE_ENV==='development'&&env.VERCEL_ENV!=='production'&&env.VERCEL_ENV!=='preview';
}

export function hiddenJamsResponse(env) {
  return jamsPreviewAvailable(env) ? null : new Response('Not found', {status:404,
    headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex'}});
}
