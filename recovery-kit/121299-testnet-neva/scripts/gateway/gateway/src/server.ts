import express, { Response, NextFunction } from 'express';
import { apiKeyAuth, AuthenticatedRequest } from './auth/apiKey';
import { publicAccessGuard } from './auth/publicAccess';
import {
  checkDailyQuota,
  checkRpsLimit,
  RpsLimitExceededError,
  DailyQuotaExceededError,
} from './rateLimit/limiter';
import { httpProxy } from './proxy/httpProxy';
import { recordUsage } from './usage/recorder';
import { recordActivity } from './usage/activityLog';
import { gasPriceGuard } from './tx/gasPriceGuard';
// nonceGuard disabled: causes false rejection of sequential TX from same wallet under high concurrency
// import { nonceGuard } from './tx/nonceGuard';

function extractMethod(body: Buffer): string | null {
  try {
    const parsed = JSON.parse(body.toString() || '{}');
    if (Array.isArray(parsed)) return 'batch';
    return typeof parsed?.method === 'string' ? parsed.method : null;
  } catch {
    return null;
  }
}

export function createApp(): express.Express {
  const app = express();
  // Caddy (network_mode: host) sits directly in front and sets X-Forwarded-For —
  // trust it so req.ip reflects the real client, not just 127.0.0.1.
  app.set('trust proxy', true);

  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

  // Unauthenticated, heavily-throttled path — registered as a literal path (not the
  // :apiKey param route below) so it never touches per-key lookup/usage accounting.
  // Terminal on its own: success falls through gasPriceGuard -> httpProxy and responds;
  // rejection responds inline. Either way the request never reaches the /v1/:apiKey chain.
  app.use('/v1/public', express.raw({ type: '*/*', limit: '5mb' }));
  app.use('/v1/public', publicAccessGuard);
  app.use('/v1/public', gasPriceGuard);
  app.use('/v1/public', httpProxy);

  app.use('/v1/:apiKey', express.raw({ type: '*/*', limit: '5mb' }));
  app.use('/v1/:apiKey', apiKeyAuth);

  // Per-request activity logging (RPC-side activity monitor) — captures every request
  // regardless of outcome (rate-limited, error, or success) via the response 'finish' event.
  app.use('/v1/:apiKey', (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const start = Date.now();
    const keyPrefix = req.params.apiKey ? req.params.apiKey.slice(0, 14) : null;
    res.on('finish', () => {
      recordActivity({
        apiKeyId: req.apiKeyConfig?.apiKeyId ?? null,
        keyPrefix,
        method: extractMethod(req.body as Buffer),
        statusCode: res.statusCode,
        durationMs: Date.now() - start,
        ipAddress: req.ip ?? null,
      });
    });
    next();
  });

  app.use('/v1/:apiKey', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const apiKeyConfig = req.apiKeyConfig;
    if (!apiKeyConfig) {
      next();
      return;
    }

    const method = extractMethod(req.body as Buffer);

    try {
      // RPS first, daily quota second: rate-limiter-flexible's .consume() does NOT deduct
      // a point on rejection, but checkDailyQuota's redis.incr() unconditionally increments
      // before checking the threshold. Checking RPS first means a burst that trips the RPS
      // limiter never touches the daily counter — previously the order was reversed, so every
      // RPS-rejected request still permanently consumed 1 unit of daily quota.
      await checkRpsLimit(apiKeyConfig.apiKeyId, apiKeyConfig.rpsLimit);
      await checkDailyQuota(apiKeyConfig.apiKeyId, apiKeyConfig.dailyQuota);
    } catch (err) {
      if (err instanceof RpsLimitExceededError) {
        recordUsage({ apiKeyId: apiKeyConfig.apiKeyId, method, isError: false, isRateLimited: true });
        res.status(429).json({
          jsonrpc: '2.0',
          error: { code: -32005, message: 'Rate limit exceeded', data: { retryAfter: err.msBeforeNext } },
          id: null,
        });
        return;
      }
      if (err instanceof DailyQuotaExceededError) {
        recordUsage({ apiKeyId: apiKeyConfig.apiKeyId, method, isError: false, isRateLimited: true });
        res.status(429).json({
          jsonrpc: '2.0',
          error: { code: -32005, message: 'Daily quota exceeded' },
          id: null,
        });
        return;
      }
      next(err);
      return;
    }

    // Record based on the REAL final status once the response actually finishes, not
    // immediately here — gasPriceGuard/httpProxy run after this and can still reject
    // (e.g. gasPriceGuard's 400), which used to get logged as a successful, non-error request.
    res.on('finish', () => {
      recordUsage({ apiKeyId: apiKeyConfig.apiKeyId, method, isError: res.statusCode >= 400, isRateLimited: false });
    });
    next();
  });

  app.use('/v1/:apiKey', gasPriceGuard);
  // app.use('/v1/:apiKey', nonceGuard);
  app.use('/v1/:apiKey', httpProxy);

  return app;
}
