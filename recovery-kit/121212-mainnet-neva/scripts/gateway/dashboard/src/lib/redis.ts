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
  await redis.del(`apikey:${keyHash}`);
}
