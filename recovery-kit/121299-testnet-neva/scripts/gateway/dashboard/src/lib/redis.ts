import Redis from 'ioredis';

declare global {
  // eslint-disable-next-line no-var
  var __redis: Redis | undefined;
}

export const redis =
  global.__redis ?? new Redis(process.env.REDIS_URL ?? 'redis://redis:6379');

if (!global.__redis) {
  global.__redis = redis;
}

export async function invalidateApiKeyCache(keyHash: string): Promise<void> {
  const cacheKey = `apikey:${keyHash}`;
  await redis.del(cacheKey);
  // Delayed double-delete: the gateway's lookupApiKey does a read-through cache fill
  // (SELECT from Postgres, then redis.set with a 60s TTL) on a cache miss. If a request
  // that started reading JUST before this revoke/update lands its redis.set AFTER our
  // del() above, it revives the stale (still-active) config for up to 60s. Deleting again
  // after a delay — well past any realistic in-flight read-then-write — closes that window.
  // Not awaited: this invalidation is best-effort cleanup, shouldn't block the caller.
  setTimeout(() => {
    redis.del(cacheKey).catch((err) => console.error('delayed cache invalidation failed', err));
  }, 3000);
}
