import { RateLimiterRedis } from 'rate-limiter-flexible';
import { redis } from '../redis';

const rpsLimiters = new Map<string, RateLimiterRedis>();

function getRpsLimiter(apiKeyId: string, rpsLimit: number): RateLimiterRedis {
  const cacheKey = `${apiKeyId}:${rpsLimit}`;
  let limiter = rpsLimiters.get(cacheKey);
  if (!limiter) {
    limiter = new RateLimiterRedis({
      storeClient: redis,
      keyPrefix: 'rl_rps',
      points: rpsLimit,
      duration: 1,
    });
    rpsLimiters.set(cacheKey, limiter);
  }
  return limiter;
}

export class RpsLimitExceededError extends Error {
  constructor(public msBeforeNext: number) {
    super('RPS limit exceeded');
  }
}

export class DailyQuotaExceededError extends Error {
  constructor() {
    super('Daily quota exceeded');
  }
}

export async function checkRpsLimit(apiKeyId: string, rpsLimit: number): Promise<void> {
  const limiter = getRpsLimiter(apiKeyId, rpsLimit);
  try {
    await limiter.consume(apiKeyId, 1);
  } catch (rejRes: any) {
    throw new RpsLimitExceededError(rejRes?.msBeforeNext ?? 1000);
  }
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

const SECONDS_26H = 26 * 60 * 60;

export async function checkDailyQuota(apiKeyId: string, dailyQuota: number): Promise<void> {
  if (dailyQuota === 0) return;

  const key = `quota:${apiKeyId}:${todayUtc()}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, SECONDS_26H);
  }
  if (count > dailyQuota) {
    throw new DailyQuotaExceededError();
  }
}
