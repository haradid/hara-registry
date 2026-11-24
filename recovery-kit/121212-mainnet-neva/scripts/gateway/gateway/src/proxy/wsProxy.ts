import { WebSocket, WebSocketServer, RawData } from 'ws';
import { IncomingMessage } from 'http';
import { Duplex } from 'stream';
import { config } from '../config';
import { ApiKeyConfig } from '../auth/keyCache';
import { checkRpsLimit, checkDailyQuota, RpsLimitExceededError, DailyQuotaExceededError } from '../rateLimit/limiter';
import { recordUsage } from '../usage/recorder';

const wss = new WebSocketServer({ noServer: true });

const QUOTA_EXCEEDED_CLOSE_CODE = 4029;

export function handleWsUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  apiKeyConfig: ApiKeyConfig,
  // false for the anonymous /v1/public path: its apiKeyId is a synthetic
  // `public:<ip>` string, not a real api_keys row, so recordUsage() (NOT NULL
  // FK to api_keys) must be skipped there — rate limiting/quota still apply
  // via Redis regardless of this flag.
  trackUsage: boolean = true,
): void {
  wss.handleUpgrade(req, socket, head, (clientWs) => {
    // WS always goes to the write pool (rpc1+write2 round-robin) — no
    // per-message smart routing (a WS connection is 1 socket : 1 upstream
    // for its whole lifetime, archive/call don't apply to subscriptions).
    const upstreamUrl = `ws://${config.haproxyHost}:${config.haproxyWriteWsPort}`;
    const upstreamWs = new WebSocket(upstreamUrl, {
      headers: { Host: config.upstreamHostHeader },
    });
    const pendingFromClient: string[] = [];

    upstreamWs.on('open', () => {
      for (const msg of pendingFromClient.splice(0)) {
        upstreamWs.send(msg);
      }
    });

    upstreamWs.on('message', (data: RawData, isBinary: boolean) => {
      clientWs.send(data, { binary: isBinary });
    });

    upstreamWs.on('close', (code, reason) => {
      clientWs.close(code, reason);
    });

    upstreamWs.on('error', (err) => {
      console.error('upstream ws error', err);
      clientWs.close(1011, 'Upstream error');
    });

    clientWs.on('message', async (data: RawData, isBinary: boolean) => {
      if (isBinary) {
        clientWs.send(JSON.stringify({ jsonrpc: '2.0', error: { code: -32600, message: 'Binary frames not supported' }, id: null }));
        return;
      }

      const text = data.toString();
      let method: string | null = null;
      let id: unknown = null;
      try {
        const parsed = JSON.parse(text);
        method = parsed?.method ?? null;
        id = parsed?.id ?? null;
      } catch {
        // leave method/id as null; still subject to rate limiting
      }

      try {
        await checkDailyQuota(apiKeyConfig.apiKeyId, apiKeyConfig.dailyQuota);
        await checkRpsLimit(apiKeyConfig.apiKeyId, apiKeyConfig.rpsLimit);
      } catch (err) {
        if (err instanceof DailyQuotaExceededError) {
          if (trackUsage) recordUsage({ apiKeyId: apiKeyConfig.apiKeyId, method, isError: false, isRateLimited: true });
          clientWs.close(QUOTA_EXCEEDED_CLOSE_CODE, 'Daily quota exceeded');
          return;
        }
        if (err instanceof RpsLimitExceededError) {
          if (trackUsage) recordUsage({ apiKeyId: apiKeyConfig.apiKeyId, method, isError: false, isRateLimited: true });
          clientWs.send(JSON.stringify({ jsonrpc: '2.0', error: { code: -32005, message: 'Rate limit exceeded' }, id }));
          return;
        }
        throw err;
      }

      if (trackUsage) recordUsage({ apiKeyId: apiKeyConfig.apiKeyId, method, isError: false, isRateLimited: false });

      if (upstreamWs.readyState === WebSocket.OPEN) {
        upstreamWs.send(text);
      } else {
        pendingFromClient.push(text);
      }
    });

    clientWs.on('close', () => {
      upstreamWs.close();
    });

    clientWs.on('error', () => {
      upstreamWs.close();
    });
  });
}
