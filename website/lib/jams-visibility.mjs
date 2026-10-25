// Owner hold: ZeroJams is available only in local development until ready.
// The service activation flag cannot publish the unfinished product.
export function jamsPreviewAvailable(env = {NODE_ENV:process.env.NODE_ENV,VERCEL_ENV:process.env.VERCEL_ENV}) {
  return env.NODE_ENV === 'development' && env.VERCEL_ENV !== 'production';
}

export function hiddenJamsResponse(env) {
  return jamsPreviewAvailable(env) ? null : new Response('Not found', {status:404,
    headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex'}});
}
