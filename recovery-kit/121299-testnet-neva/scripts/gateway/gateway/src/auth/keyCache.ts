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

  // Joined against users so a suspended user's keys stop working immediately, not just
  // "revoked" keys — previously this only checked api_keys.status, so the dashboard's
  // "Suspend" button changed the users.status badge but left every one of that user's
  // keys fully functional against the RPC gateway (found during functional testing,
  // 2026-08-27: suspended a test user, its key kept returning 200s).
  const result = await pool.query(
    `SELECT k.id, k.user_id, k.rps_limit, k.daily_quota, k.status AS key_status, u.status AS user_status
     FROM api_keys k JOIN users u ON u.id = k.user_id
     WHERE k.key_hash = $1`,
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
    status: row.key_status === 'active' && row.user_status === 'active' ? 'active' : 'revoked',
  };

  await redis.set(cacheKey(hash), JSON.stringify(apiKeyConfig), 'EX', CACHE_TTL_SECONDS);
  return apiKeyConfig;
}
