'use server';

import { headers } from 'next/headers';
import { ethers } from 'ethers';
import { pool } from './db';
import { logAudit } from './audit';

const DRIP_AMOUNT_ETH = process.env.FAUCET_DRIP_AMOUNT_ETH ?? '10';
const COOLDOWN_HOURS = Number(process.env.FAUCET_COOLDOWN_HOURS ?? 24);
const RPC_HOST = process.env.FAUCET_RPC_HOST ?? process.env.RPC_HOST ?? 'host.docker.internal';
const RPC_HTTP_PORT = process.env.FAUCET_RPC_HTTP_PORT ?? process.env.RPC_HTTP_PORT ?? '5797';

export interface FaucetState {
  status: 'idle' | 'success' | 'error';
  message?: string;
  txHash?: string;
}

// Besu's validator1 host-allowlist (validator1 merged rpc1's RPC-serving role 2026-08-28)
// only accepts Host headers of "localhost"/"127.0.0.1"/the
// server's public IP (validator1/config/config.toml, host-allowlist) — connecting via
// host.docker.internal (needed to reach validator1 from this bridge-networked container)
// sends a Host header of "host.docker.internal" and gets 403 "Host not authorized"
// otherwise. Found 2026-08-27 while building the explorer (same provider pattern) and
// confirmed this had been silently broken here too — every faucet send was failing at
// the RPC layer. Same fix the gateway's own httpProxy.ts already uses for the same
// reason, just via ethers' FetchRequest since it doesn't expose a plain header option.
let cachedProvider: ethers.JsonRpcProvider | null = null;
function getProvider(): ethers.JsonRpcProvider {
  if (!cachedProvider) {
    const fetchRequest = new ethers.FetchRequest(`http://${RPC_HOST}:${RPC_HTTP_PORT}`);
    fetchRequest.setHeader('Host', 'localhost');
    cachedProvider = new ethers.JsonRpcProvider(fetchRequest, undefined, { staticNetwork: true });
  }
  return cachedProvider;
}

let cachedWallet: ethers.Wallet | null = null;
function getWallet(): ethers.Wallet {
  if (!cachedWallet) {
    const key = process.env.FAUCET_PRIVATE_KEY;
    if (!key) throw new Error('FAUCET_PRIVATE_KEY not configured');
    cachedWallet = new ethers.Wallet(key, getProvider());
  }
  return cachedWallet;
}

// Serialize sends so concurrent faucet requests never race on the same nonce —
// ethers fetches "pending" nonce per-call, which is unsafe under concurrency otherwise.
let sendQueue: Promise<unknown> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const result = sendQueue.then(fn, fn);
  sendQueue = result.catch(() => undefined);
  return result;
}

function clientIp(): string | null {
  const h = headers();
  const fwd = h.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() ?? null;
  return h.get('x-real-ip');
}

async function recentClaim(client: import('pg').PoolClient, column: 'address' | 'ip_address', value: string): Promise<Date | null> {
  // status IN ('pending','sent') — a still-in-flight claim must also block a second one for
  // the same address, or a request could slip in between "cooldown insert" and "send confirmed".
  // A 'failed' claim does NOT count, so a failed send doesn't strand the address for the
  // full cooldown window.
  const result = await client.query(
    `SELECT created_at FROM faucet_claims
     WHERE ${column} = $1 AND status IN ('pending', 'sent') AND created_at > now() - interval '${COOLDOWN_HOURS} hours'
     ORDER BY created_at DESC LIMIT 1`,
    [value]
  );
  return result.rows[0]?.created_at ?? null;
}

function cooldownMessage(kind: 'address' | 'network', lastClaimAt: Date): string {
  const nextAt = new Date(lastClaimAt.getTime() + COOLDOWN_HOURS * 3600_000);
  const subject = kind === 'address' ? 'This address' : 'Too many claims from this network';
  return `${subject} already claimed recently. Try again after ${nextAt.toISOString()}.`;
}

export async function requestFaucetAction(_prev: FaucetState, formData: FormData): Promise<FaucetState> {
  const address = String(formData.get('address') ?? '').trim();
  const ip = clientIp();

  if (!ethers.isAddress(address)) {
    return { status: 'error', message: 'Not a valid address (expected 0x-prefixed, 40 hex characters).' };
  }
  const checksummed = ethers.getAddress(address);
  const amountWei = ethers.parseEther(DRIP_AMOUNT_ETH);

  // Cooldown check + pending-row insert happen inside ONE transaction, serialized per-address
  // via a Postgres advisory lock (pg_advisory_xact_lock, released automatically on
  // COMMIT/ROLLBACK). Without this, two concurrent requests for the SAME address could both
  // read "no recent claim" before either had inserted one — bypassing the cooldown entirely
  // under any kind of concurrent load (double form-submit, retry, or a stress test). The lock
  // is address-scoped (hashtext), so unrelated addresses are never blocked by each other.
  const lockClient = await pool.connect();
  let claimId: string;
  try {
    await lockClient.query('BEGIN');
    await lockClient.query('SELECT pg_advisory_xact_lock(hashtext($1))', [checksummed.toLowerCase()]);

    const lastByAddress = await recentClaim(lockClient, 'address', checksummed);
    if (lastByAddress) {
      await lockClient.query('ROLLBACK');
      return { status: 'error', message: cooldownMessage('address', lastByAddress) };
    }
    if (ip) {
      const lastByIp = await recentClaim(lockClient, 'ip_address', ip);
      if (lastByIp) {
        await lockClient.query('ROLLBACK');
        return { status: 'error', message: cooldownMessage('network', lastByIp) };
      }
    }

    const claim = await lockClient.query(
      `INSERT INTO faucet_claims (address, ip_address, amount_wei, status) VALUES ($1, $2, $3, 'pending') RETURNING id`,
      [checksummed, ip, amountWei.toString()]
    );
    claimId = claim.rows[0].id;
    await lockClient.query('COMMIT');
  } catch (err) {
    await lockClient.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    // Released as soon as the cooldown check + pending insert are done — does NOT stay
    // open for the slow on-chain send below, so it never blocks other addresses' requests
    // or holds a pooled client during network I/O to Besu.
    lockClient.release();
  }

  try {
    const txHash = await enqueue(async () => {
      const wallet = getWallet();
      const tx = await wallet.sendTransaction({ to: checksummed, value: amountWei });
      return tx.hash;
    });

    await pool.query(`UPDATE faucet_claims SET status = 'sent', tx_hash = $1 WHERE id = $2`, [txHash, claimId]);
    await logAudit('public', 'faucet.claim', checksummed, { amountEth: DRIP_AMOUNT_ETH, txHash, ip });

    return { status: 'success', txHash, message: `Sent ${DRIP_AMOUNT_ETH} native token(s) to ${checksummed}.` };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await pool.query(`UPDATE faucet_claims SET status = 'failed', error = $1 WHERE id = $2`, [errorMessage, claimId]);
    await logAudit('public', 'faucet.claim_failed', checksummed, { error: errorMessage, ip });
    return { status: 'error', message: `Failed to send: ${errorMessage}` };
  }
}
