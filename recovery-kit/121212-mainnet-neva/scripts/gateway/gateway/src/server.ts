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
import { gasPriceGuard } from './tx/gasPriceGuard';
import { archiveRouter } from './tx/archiveRouter';
// nonceGuard intentionally not wired in: same class of guard (decode + re-fetch
// pending state per request) was tried in cloud_1/tesnet_server and disabled —
// "causes false rejection of sequential TX from same wallet under high
// concurrency". write1/write2 are plain full nodes (not validators/signers);
// tx ordering is resolved by P2P mempool gossip regardless of which endpoint
// received a tx first, so no app-layer nonce serialization is used here either.

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
  // Caddy will sit in front once :80/:443 are open on this host — trust its
  // X-Forwarded-For so req.ip (used by /v1/public's per-IP rate limit) reflects
  // the real client, not just Caddy's own loopback address.
  app.set('trust proxy', true);

  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

  // Unauthenticated, heavily-throttled path — registered as a literal path (not
  // the :apiKey param route below, which would otherwise swallow "/v1/public"
  // as a literal API key) so it never touches per-key lookup/usage accounting.
  app.use('/v1/public', express.raw({ type: '*/*', limit: '5mb' }));
  app.use('/v1/public', publicAccessGuard);
  app.use('/v1/public', gasPriceGuard);
  app.use('/v1/public', archiveRouter);
  app.use('/v1/public', httpProxy);

  app.use('/v1/:apiKey', express.raw({ type: '*/*', limit: '5mb' }));
  app.use('/v1/:apiKey', apiKeyAuth);

  app.use('/v1/:apiKey', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const apiKeyConfig = req.apiKeyConfig;
    if (!apiKeyConfig) {
      next();
      return;
    }

    const method = extractMethod(req.body as Buffer);

    try {
      await checkDailyQuota(apiKeyConfig.apiKeyId, apiKeyConfig.dailyQuota);
      await checkRpsLimit(apiKeyConfig.apiKeyId, apiKeyConfig.rpsLimit);
    } catch (err) {
      if (err instanceof DailyQuotaExceededError) {
        recordUsage({ apiKeyId: apiKeyConfig.apiKeyId, method, isError: false, isRateLimited: true });
        res.status(429).json({
          jsonrpc: '2.0',
          error: { code: -32005, message: 'Daily quota exceeded' },
          id: null,
        });
        return;
      }
      if (err instanceof RpsLimitExceededError) {
        recordUsage({ apiKeyId: apiKeyConfig.apiKeyId, method, isError: false, isRateLimited: true });
        res.status(429).json({
          jsonrpc: '2.0',
          error: { code: -32005, message: 'Rate limit exceeded', data: { retryAfter: err.msBeforeNext } },
          id: null,
        });
        return;
      }
      next(err);
      return;
    }

    recordUsage({ apiKeyId: apiKeyConfig.apiKeyId, method, isError: false, isRateLimited: false });
    next();
  });

  app.use('/v1/:apiKey', gasPriceGuard);
  app.use('/v1/:apiKey', archiveRouter);
  app.use('/v1/:apiKey', httpProxy);

  return app;
}
