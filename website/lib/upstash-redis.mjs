export function upstashConfiguration(endpoint, token) {
  if (!endpoint || !token || token.length > 4096 || /\s/.test(token)) return null;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.upstash\.io$/.test(url.hostname) ||
        url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return {endpoint: url.origin, token};
  } catch { return null; }
}

export function upstashCommand(configuration, fetchImpl, limit = 4096) {
  return async function command(parts) {
    const response = await fetchImpl(configuration.endpoint, {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(1500),
      headers: {'Authorization': `Bearer ${configuration.token}`, 'Content-Type': 'application/json'},
      body: JSON.stringify(parts),
    });
    try {
      if (!response.ok || response.redirected) throw new Error();
      const reader = response.body?.getReader();
      if (!reader) throw new Error();
      const chunks = []; let length = 0;
      try {
        while (true) {
          const {done, value} = await reader.read(); if (done) break;
          length += value.length;
          if (length > limit) throw new Error();
          chunks.push(value);
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (data.error || !Object.hasOwn(data, 'result')) throw new Error();
      return data.result;
    } finally { await response.body?.cancel().catch(() => {}); }
  };
}
