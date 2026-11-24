function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  httpPort: Number(process.env.HTTP_PORT ?? 4000),
  wsPort: Number(process.env.WS_PORT ?? 4001),
  databaseUrl: required('DATABASE_URL'),
  redisUrl: required('REDIS_URL'),

  // HAProxy runs on the validator1 host (<MAINNET_V1_AWS_IP>), gateway runs on a
  // different host (validator2+corp1+write2, Azure) — so this is a real
  // network hop, not loopback like cloud_1's mainrpc pattern.
  haproxyHost: process.env.HAPROXY_HOST ?? '<MAINNET_V1_AWS_IP>',
  // rpc_frontend — write pool (rpc1 + write2, round-robin, HAProxy owns failover)
  haproxyWriteHttpPort: Number(process.env.HAPROXY_WRITE_HTTP_PORT ?? 5797),
  haproxyWriteWsPort: Number(process.env.HAPROXY_WRITE_WS_PORT ?? 5798),
  // call_frontend — dedicated read node
  haproxyCallHttpPort: Number(process.env.HAPROXY_CALL_HTTP_PORT ?? 5799),
  // archive_frontend — archive node (via its nginx rate-limiter), for debug_*/trace_*
  // and as optimistic-fallback target when call/write report pruned state.
  haproxyArchiveHttpPort: Number(process.env.HAPROXY_ARCHIVE_HTTP_PORT ?? 5800),

  // Host header forwarded upstream; must be in Besu's host-allowlist
  // (host.docker.internal is not, so default to localhost)
  upstreamHostHeader: process.env.UPSTREAM_HOST_HEADER ?? 'localhost',

  // /v1/public — unauthenticated, throttled hard per source IP. Deliberately
  // stricter than tesnet_server's defaults (1 rps / 100 per day) since this is
  // mainnet, not a testnet — real value is at stake.
  publicRpsLimit: Number(process.env.PUBLIC_RPS_LIMIT ?? 1),
  publicDailyQuota: Number(process.env.PUBLIC_DAILY_QUOTA ?? 50),
};
