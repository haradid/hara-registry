import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './apiKey';
import { config } from '../config';
import {
  checkRpsLimit,
  checkDailyQuota,
  RpsLimitExceededError,
  DailyQuotaExceededError,
} from '../rateLimit/limiter';
import { recordActivity } from '../usage/activityLog';

// Unauthenticated access at /v1/public — no key required, throttled hard per source IP.
// Reuses the same Redis-backed limiter/quota primitives as keyed access, just with an
// IP-derived id instead of an apiKeyId; there's no api_keys row for anonymous callers, so
// this path intentionally never calls recordUsage() (usage_hourly/usage_daily_quota have a
// NOT NULL FK to api_keys — a fake id there would roll back the whole flush batch, wiping
// out real keys' stats too). Only recordActivity() is used, whose api_key_id column is
// nullable for exactly this reason.
export function publicRateId(ip: string): string {
  return `public:${ip}`;
}

function extractMethod(body: Buffer): string | null {
  try {
    const parsed = JSON.parse(body.toString() || '{}');
    if (Array.isArray(parsed)) return 'batch';
    return typeof parsed?.method === 'string' ? parsed.method : null;
  } catch {
    return null;
  }
}

export async function publicAccessGuard(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const start = Date.now();
  const ip = req.ip ?? 'unknown';
  const rateId = publicRateId(ip);
  const method = extractMethod(req.body as Buffer);

  const log = (statusCode: number) => {
    recordActivity({
      apiKeyId: null,
      keyPrefix: 'public',
      method,
      statusCode,
      durationMs: Date.now() - start,
      ipAddress: ip,
    });
  };

  try {
    await checkRpsLimit(rateId, config.publicRpsLimit);
    await checkDailyQuota(rateId, config.publicDailyQuota);
  } catch (err) {
    if (err instanceof RpsLimitExceededError) {
      log(429);
      res.status(429).json({
        jsonrpc: '2.0',
        error: {
          code: -32005,
          message: 'Rate limit exceeded on the public endpoint — register a free API key for higher limits',
          data: { retryAfter: err.msBeforeNext },
        },
        id: null,
      });
      return;
    }
    if (err instanceof DailyQuotaExceededError) {
      log(429);
      res.status(429).json({
        jsonrpc: '2.0',
        error: {
          code: -32005,
          message: 'Daily quota exceeded on the public endpoint — register a free API key for higher limits',
        },
        id: null,
      });
      return;
    }
    next(err);
    return;
  }

  res.on('finish', () => log(res.statusCode));
  next();
}
