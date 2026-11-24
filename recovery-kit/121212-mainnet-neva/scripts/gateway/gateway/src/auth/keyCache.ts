import crypto from 'crypto';
import { pool } from '../db';
import { redis } from '../redis';

export interface ApiKeyConfig {
  apiKeyId: string;
  userId: string;
  rpsLimit: number;
  dailyQuota: number;
  status: 'active' | 'revoked';
}

const CACHE_TTL_SECONDS = 60;

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function cacheKey(hash: string): string {
  return `apikey:${hash}`;
}

export async function invalidateApiKey(hash: string): Promise<void> {
  await redis.del(cacheKey(hash));
}

export async function lookupApiKey(rawKey: string): Promise<ApiKeyConfig | null> {
  const hash = hashApiKey(rawKey);
  const cached = await redis.get(cacheKey(hash));
  if (cached !== null) {
    if (cached === 'null') return null;
    return JSON.parse(cached) as ApiKeyConfig;
  }

  const result = await pool.query(
    `SELECT id, user_id, rps_limit, daily_quota, status
     FROM api_keys WHERE key_hash = $1`,
    [hash]
  );

  if (result.rowCount === 0) {
    await redis.set(cacheKey(hash), 'null', 'EX', CACHE_TTL_SECONDS);
    return null;
  }

  const row = result.rows[0];
  const apiKeyConfig: ApiKeyConfig = {
    apiKeyId: row.id,
    userId: row.user_id,
    rpsLimit: row.rps_limit,
    dailyQuota: Number(row.daily_quota),
    status: row.status,
  };

  await redis.set(cacheKey(hash), JSON.stringify(apiKeyConfig), 'EX', CACHE_TTL_SECONDS);
  return apiKeyConfig;
}
