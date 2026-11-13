import {upstashCommand, upstashConfiguration} from './upstash-redis.mjs';

const compareAndSet = `
  if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
  if ARGV[2] == '' then return redis.call('DEL', KEYS[1]) end
  redis.call('SET', KEYS[1], ARGV[2], 'KEEPTTL')
  return 1
`;

export function hubGitHubGrantStore(env, fetchImpl = fetch) {
  // Use the production Marketplace integration, with a separate key prefix.
  if (env.VERCEL && env.VERCEL_ENV !== 'production') return null;
  const config = upstashConfiguration(env.KV_REST_API_URL, env.KV_REST_API_TOKEN);
  if (!config) return null;
  const command = upstashCommand(config, fetchImpl, 8192);
  const key = id => `zero:hub:github-grant:v1:${id}`;
  return {
    async create(id, encrypted, expiresAt) {
      return await command(['SET', key(id), encrypted, 'NX', 'PXAT', expiresAt]) === 'OK';
    },
    async read(id) {
      const value = await command(['GET', key(id)]);
      if (value !== null && typeof value !== 'string') throw new Error();
      return value;
    },
    async replace(id, expected, encrypted) {
      const result = await command(['EVAL', compareAndSet, 1, key(id), expected, encrypted ?? '']);
      if (result !== 0 && result !== 1) throw new Error();
      return result === 1;
    },
    async remove(id) {
      await command(['DEL', key(id)]);
    },
  };
}
