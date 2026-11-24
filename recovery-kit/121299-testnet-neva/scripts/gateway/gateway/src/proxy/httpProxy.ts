import { createProxyMiddleware } from 'http-proxy-middleware';
import http from 'http';
import type { ClientRequest, IncomingMessage, ServerResponse } from 'http';
import { config } from '../config';
import { currentHttpTarget, PRIMARY_TARGET, startRpcHealthChecks } from './rpcHealth';

startRpcHealthChecks();

// Persistent keep-alive agent so the gateway reuses TCP connections to HAProxy
const keepAliveAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 256,
  maxFreeSockets: 32,
  timeout: 60000,
});

export const httpProxy = createProxyMiddleware({
  // Static target required by the types; actual per-request target comes from `router`
  // (mirrors the pattern already used in mainnet_production's httpProxy.ts).
  target: PRIMARY_TARGET,
  router: () => currentHttpTarget(),
  changeOrigin: true,
  pathRewrite: () => '/',
  agent: keepAliveAgent,
  proxyTimeout: 30000,  // upstream must respond within 30s
  timeout: 35000,       // client-side socket timeout (slightly longer)
  on: {
    proxyReq: (proxyReq: ClientRequest, req: IncomingMessage & { body?: Buffer }) => {
      // proxyReq can already be ended here if the pooled keep-alive socket was closed
      // upstream (Besu) between being marked free and being reused — writing to it then
      // throws ERR_HTTP_HEADERS_SENT, which with no `error` handler used to crash the
      // whole gateway process. Guard defensively; the `error` handler below deals with
      // the resulting upstream failure and returns a proper response to the client.
      if (proxyReq.headersSent || proxyReq.writableEnded) return;
      try {
        proxyReq.setHeader('Host', config.upstreamHostHeader);
        const body = req.body;
        if (body && body.length) {
          proxyReq.setHeader('Content-Length', Buffer.byteLength(body));
          proxyReq.write(body);
        }
      } catch {
        // Same race as above; let the proxy's own error handling take it from here.
      }
    },
    error: (err: Error, _req: IncomingMessage, res: ServerResponse | any) => {
      // Without this handler, any upstream connection failure (stale keep-alive socket,
      // Besu restart, ECONNREFUSED) is an unhandled 'error' event on the proxy's internal
      // EventEmitter and crashes the entire Node process, not just the one request.
      if (res && typeof res.writeHead === 'function' && !res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Upstream RPC connection error' },
          id: null,
        }));
      } else if (res && typeof res.end === 'function') {
        res.end();
      }
    },
  },
} as any);
