import { ethers } from 'ethers';

// Reuses the SAME env vars faucet.ts already reads — zero new deployment config, this
// just points at validator1 (merged rpc1's role 2026-08-28) the identical way the faucet
// does. Read-only: no wallet involved.
const RPC_HOST = process.env.FAUCET_RPC_HOST ?? process.env.RPC_HOST ?? 'host.docker.internal';
const RPC_HTTP_PORT = process.env.FAUCET_RPC_HTTP_PORT ?? process.env.RPC_HTTP_PORT ?? '5797';

// Besu's validator1 host-allowlist only accepts Host headers of "localhost"/"127.0.0.1"/the
// server's public IP (config.toml, host-allowlist) — connecting via host.docker.internal
// (needed to reach validator1 from this bridge-networked container at all) sends a Host header
// of "host.docker.internal" and gets 403 "Host not authorized" otherwise. The gateway's
// own httpProxy.ts already works around this by overriding the Host header it forwards;
// same fix here via FetchRequest, since ethers doesn't expose a plain header option.
let cachedProvider: ethers.JsonRpcProvider | null = null;
export function getExplorerProvider(): ethers.JsonRpcProvider {
  if (!cachedProvider) {
    const fetchRequest = new ethers.FetchRequest(`http://${RPC_HOST}:${RPC_HTTP_PORT}`);
    fetchRequest.setHeader('Host', 'localhost');
    cachedProvider = new ethers.JsonRpcProvider(fetchRequest, undefined, { staticNetwork: true });
  }
  return cachedProvider;
}
