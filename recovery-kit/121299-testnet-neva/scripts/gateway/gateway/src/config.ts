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
  haproxyHost: process.env.HAPROXY_HOST ?? 'host.docker.internal',
  haproxyHttpPort: Number(process.env.HAPROXY_HTTP_PORT ?? 5797),
  haproxyWsPort: Number(process.env.HAPROXY_WS_PORT ?? 5798),
  // Failover HTTP backend for when the primary (validator1) is down/restarting — validator3
  // now also serves RPC, reachable from this container via the host's docker0 gateway since
  // it binds on the host network (see docs/CHANGELOG.md 2026-09-15). WS deliberately does NOT
  // fail over (see wsProxy.ts) — a live subscription can't be silently migrated mid-stream.
  secondaryRpcHost: process.env.SECONDARY_RPC_HOST ?? 'host.docker.internal',
  secondaryRpcHttpPort: Number(process.env.SECONDARY_RPC_HTTP_PORT ?? 5797),
  // Host header forwarded upstream; must be in Besu's host-allowlist
  // (host.docker.internal is not, so default to localhost)
  upstreamHostHeader: process.env.UPSTREAM_HOST_HEADER ?? 'localhost',
  // Unauthenticated access via /v1/public — deliberately far below the api_keys default
  // (10 rps / 100000 daily) so it's only usable for a quick try-it-out call, never a
  // substitute for registering a real key.
  publicRpsLimit: Number(process.env.PUBLIC_RPS_LIMIT ?? 1),
  publicDailyQuota: Number(process.env.PUBLIC_DAILY_QUOTA ?? 100),
};
