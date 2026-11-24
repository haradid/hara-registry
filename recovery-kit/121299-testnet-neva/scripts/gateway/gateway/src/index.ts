import http from 'http';
import { createApp } from './server';
import { config } from './config';
import { lookupApiKey } from './auth/keyCache';
import { publicRateId } from './auth/publicAccess';
import { handleWsUpgrade } from './proxy/wsProxy';
import { startUsageRecorder } from './usage/recorder';
import { startActivityLogger, recordActivity } from './usage/activityLog';

// Last-resort safety net: a single unexpected error (e.g. a race in a proxy/socket
// library) must never take down the gateway for every concurrent user. Log and keep
// serving rather than crash — this is a public RPC entrypoint, not a batch job.
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err);
});

const httpServer = http.createServer(createApp());
httpServer.listen(config.httpPort, () => {
  console.log(`HTTP gateway listening on :${config.httpPort}`);
});

const wsServer = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok' }));
});

wsServer.on('upgrade', async (req, socket, head) => {
  const url = new URL(req.url ?? '', `ws://${req.headers.host}`);
  const match = url.pathname.match(/^\/v1\/([^/]+)\/?$/);
  const apiKey = match?.[1];

  if (!apiKey) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return;
  }

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.socket.remoteAddress ?? 'unknown';

  // Anonymous path, mirrors /v1/public on the HTTP side: no key lookup, rate-limited hard
  // per IP via a synthetic id, and NOT passed through recordUsage (no real api_keys row to
  // satisfy its NOT NULL FK) — see auth/publicAccess.ts for why.
  if (apiKey === 'public') {
    recordActivity({
      apiKeyId: null,
      keyPrefix: 'public',
      method: 'ws_connect',
      statusCode: 101,
      durationMs: 0,
      ipAddress: ip,
    });
    handleWsUpgrade(
      req,
      socket,
      head,
      { apiKeyId: publicRateId(ip), userId: 'public', rpsLimit: config.publicRpsLimit, dailyQuota: config.publicDailyQuota, status: 'active' },
      false,
    );
    return;
  }

  const apiKeyConfig = await lookupApiKey(apiKey);
  if (!apiKeyConfig || apiKeyConfig.status !== 'active') {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  recordActivity({
    apiKeyId: apiKeyConfig.apiKeyId,
    keyPrefix: apiKey.slice(0, 14),
    method: 'ws_connect',
    statusCode: 101,
    durationMs: 0,
    ipAddress: ip,
  });

  handleWsUpgrade(req, socket, head, apiKeyConfig);
});

wsServer.listen(config.wsPort, () => {
  console.log(`WS gateway listening on :${config.wsPort}`);
});

startUsageRecorder();
startActivityLogger();
