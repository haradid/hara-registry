import { Interface, Wallet } from 'ethers';
import http from 'node:http';

// Ported 1:1 from the Go backend (hara-faucet-app/backend/internal/chain/client.go).
// Uses a raw http.request (not ethers' own fetch transport) because Besu's
// host-allowlist rejects whatever Host header a generic HTTP client sends by
// default — the same fix as gateway/src/proxy/httpProxy.ts, and Node's native
// fetch() refuses to let callers override the Host header at all (it's a
// forbidden header per the Fetch spec), so the low-level http module is the
// only reliable way to do this from Node.
const WHITELIST_ABI = [
  'function isWhitelisted(address account) view returns (bool)',
  'function owner() view returns (address)',
  'function setWhitelist(address account, bool allowed)',
];

const iface = new Interface(WHITELIST_ABI);

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function normalizeKey(key: string): string {
  return key.startsWith('0x') ? key : `0x${key}`;
}

function contractAddress(): string {
  return requiredEnv('FAUCET_WHITELIST_CONTRACT');
}

function chainId(): bigint {
  return BigInt(process.env.FAUCET_CHAIN_ID ?? '121212');
}

function rpcCall<T = unknown>(method: string, params: unknown[]): Promise<T> {
  const rpcUrl = new URL(requiredEnv('FAUCET_RPC_URL'));
  const body = JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 });
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: rpcUrl.hostname,
        port: rpcUrl.port || 80,
        path: rpcUrl.pathname || '/',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), Host: 'localhost' },
        timeout: 15000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              reject(new Error(parsed.error.message ?? 'RPC error'));
              return;
            }
            resolve(parsed.result as T);
          } catch {
            reject(new Error(`bad RPC response: ${data.slice(0, 200)}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('RPC request timed out'));
    });
    req.write(body);
    req.end();
  });
}

export async function blockNumber(): Promise<number> {
  const hex = await rpcCall<string>('eth_blockNumber', []);
  return parseInt(hex, 16);
}

export async function isWhitelisted(address: string): Promise<boolean> {
  const data = iface.encodeFunctionData('isWhitelisted', [address]);
  const result = await rpcCall<string>('eth_call', [{ to: contractAddress(), data }, 'latest']);
  const [allowed] = iface.decodeFunctionResult('isWhitelisted', result);
  return allowed as boolean;
}

export async function contractOwner(): Promise<string> {
  const data = iface.encodeFunctionData('owner', []);
  const result = await rpcCall<string>('eth_call', [{ to: contractAddress(), data }, 'latest']);
  const [owner] = iface.decodeFunctionResult('owner', result);
  return owner as string;
}

interface ChainSigner {
  address: string;
  wallet: Wallet;
}

function loadSigners(): [ChainSigner, ChainSigner] {
  const primary = new Wallet(normalizeKey(requiredEnv('FAUCET_PRIMARY_PRIVATE_KEY')));
  const secondary = new Wallet(normalizeKey(requiredEnv('FAUCET_SECONDARY_PRIVATE_KEY')));
  return [
    { address: primary.address, wallet: primary },
    { address: secondary.address, wallet: secondary },
  ];
}

export function signerAddresses(): [string, string] {
  const [primary, secondary] = loadSigners();
  return [primary.address, secondary.address];
}

async function broadcastFrom(
  signer: ChainSigner,
  to: string,
  value: bigint,
  data: string | null,
  gasLimit: bigint,
): Promise<string> {
  const nonceHex = await rpcCall<string>('eth_getTransactionCount', [signer.address, 'pending']);
  const signed = await signer.wallet.signTransaction({
    to,
    value,
    data: data ?? undefined,
    gasLimit,
    gasPrice: 0n,
    nonce: parseInt(nonceHex, 16),
    chainId: chainId(),
    type: 0,
  });
  return rpcCall<string>('eth_sendRawTransaction', [signed]);
}

interface Receipt {
  status: string;
}

async function waitMined(txHash: string, timeoutMs = 35000): Promise<{ confirmed: boolean; status?: number }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const receipt = await rpcCall<Receipt | null>('eth_getTransactionReceipt', [txHash]);
    if (receipt) {
      return { confirmed: true, status: parseInt(receipt.status, 16) };
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return { confirmed: false };
}

export interface TransferResult {
  txHash: string;
  signer: string;
  confirmed: boolean;
}

/**
 * Dual-signer failover (matches the Go backend exactly): try the primary
 * signer, and only fall back to the secondary if the primary fails to even
 * broadcast. This is a failover pair, not load balancing.
 */
export async function transfer(to: string, amountWei: bigint): Promise<TransferResult> {
  const [primary, secondary] = loadSigners();
  let lastError: unknown;
  for (const signer of [primary, secondary]) {
    try {
      const txHash = await broadcastFrom(signer, to, amountWei, null, 21_000n);
      const { confirmed, status } = await waitMined(txHash);
      if (confirmed && status !== 1) {
        throw new Error('transfer transaction reverted');
      }
      return { txHash, signer: signer.address, confirmed };
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`all faucet signers failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

export async function setWhitelist(account: string, allowed: boolean): Promise<string> {
  const [primary] = loadSigners();
  const data = iface.encodeFunctionData('setWhitelist', [account, allowed]);
  // Fixed generous gas limit instead of eth_estimateGas — a mapping write +
  // one event on a gas-free chain costs nothing extra to overestimate, and it
  // avoids a second RPC round-trip that could itself need the allowlist fix.
  const txHash = await broadcastFrom(primary, contractAddress(), 0n, data, 100_000n);
  const { confirmed, status } = await waitMined(txHash);
  if (!confirmed) throw new Error('whitelist update did not confirm in time');
  if (status !== 1) throw new Error('whitelist update reverted');
  return txHash;
}
