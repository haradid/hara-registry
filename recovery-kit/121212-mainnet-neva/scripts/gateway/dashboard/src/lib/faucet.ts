'use server';

import { headers } from 'next/headers';
import { pool } from './db';
import { redis } from './redis';
import { isWhitelisted, transfer, blockNumber, contractOwner, signerAddresses } from './faucetChain';

export interface FaucetState {
  status: 'idle' | 'success' | 'error';
  message?: string;
  txHash?: string;
  explorerUrl?: string;
}

const RATE_LIMIT_PER_MINUTE = 10;
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function clientIp(): string {
  const h = headers();
  const forwarded = h.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return 'unknown';
}

async function allowIp(ip: string): Promise<boolean> {
  const key = `faucet_rl:${ip}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 60);
  return count <= RATE_LIMIT_PER_MINUTE;
}

async function verifyTurnstile(token: string, remoteIp: string): Promise<void> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) throw new Error('Turnstile is not configured on the server');
  if (!token || token.length > 2048) throw new Error('missing or invalid human-verification token');

  const form = new URLSearchParams({ secret, response: token });
  if (remoteIp !== 'unknown') form.set('remoteip', remoteIp);

  const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
    signal: AbortSignal.timeout(7000),
  });
  if (!resp.ok) throw new Error(`Turnstile returned HTTP ${resp.status}`);
  const result = (await resp.json()) as { success: boolean; hostname?: string; action?: string; 'error-codes'?: string[] };
  if (!result.success) throw new Error(`Turnstile rejected token: ${(result['error-codes'] ?? []).join(',')}`);

  const expectedHostname = process.env.TURNSTILE_EXPECTED_HOSTNAME;
  if (expectedHostname && result.hostname?.toLowerCase() !== expectedHostname.toLowerCase()) {
    throw new Error(`unexpected Turnstile hostname "${result.hostname}"`);
  }
  const expectedAction = process.env.TURNSTILE_EXPECTED_ACTION ?? 'faucet_claim';
  if (result.action !== expectedAction) {
    throw new Error(`unexpected Turnstile action "${result.action}"`);
  }
}

function cooldownHours(): number {
  return Number(process.env.FAUCET_COOLDOWN_HOURS ?? 24);
}

function allocationWei(): bigint {
  return BigInt(process.env.FAUCET_ALLOCATION_WEI ?? '2000000000000000000');
}

function allocationDisplay(): string {
  return process.env.FAUCET_ALLOCATION_DISPLAY ?? '2 HARA';
}

export interface Eligibility {
  address: string;
  whitelisted: boolean;
  eligible: boolean;
  cooldownRemainingSeconds: number;
  nextClaimAt: string | null;
}

export async function checkEligibility(address: string): Promise<Eligibility> {
  if (!ADDRESS_RE.test(address)) throw new Error('invalid wallet address');
  const lower = address.toLowerCase();

  const [whitelisted, claimRow] = await Promise.all([
    isWhitelisted(address),
    pool.query('SELECT created_at FROM faucet_claims WHERE address = $1', [lower]),
  ]);

  let remaining = 0;
  let nextClaimAt: string | null = null;
  const previous = claimRow.rows[0];
  if (previous) {
    const next = new Date(previous.created_at);
    next.setHours(next.getHours() + cooldownHours());
    nextClaimAt = next.toISOString();
    remaining = Math.max(0, Math.floor((next.getTime() - Date.now()) / 1000));
  }

  return {
    address,
    whitelisted,
    eligible: whitelisted && remaining === 0,
    cooldownRemainingSeconds: remaining,
    nextClaimAt,
  };
}

async function logActivity(type: string, wallet: string | null, message: string, txHash?: string): Promise<void> {
  await pool.query(
    'INSERT INTO faucet_activity (type, wallet, message, tx_hash) VALUES ($1, $2, $3, $4)',
    [type, wallet, message, txHash ?? null],
  );
}

export async function requestFaucetAction(_prev: FaucetState, formData: FormData): Promise<FaucetState> {
  const address = String(formData.get('address') ?? '').trim();
  const turnstileToken = String(formData.get('turnstileToken') ?? '').trim();

  if (!ADDRESS_RE.test(address)) {
    return { status: 'error', message: 'Enter a valid wallet address (0x followed by 40 hex characters).' };
  }

  const ip = clientIp();
  if (!(await allowIp(ip))) {
    return { status: 'error', message: 'Too many requests from this network — try again in a minute.' };
  }

  try {
    await verifyTurnstile(turnstileToken, ip);
  } catch (err) {
    return { status: 'error', message: `Human verification failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  const lower = address.toLowerCase();

  // Row-lock the address's claim record for the duration of the cooldown
  // check + reservation, so two concurrent requests for the same address
  // can't both pass the cooldown check before either writes its reservation.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const allowed = await isWhitelisted(address);
    if (!allowed) {
      await client.query('ROLLBACK');
      return { status: 'error', message: 'This wallet is not whitelisted for the faucet. Contact an admin to be added.' };
    }

    const existing = await client.query('SELECT created_at FROM faucet_claims WHERE address = $1 FOR UPDATE', [lower]);
    const now = new Date();
    if (existing.rows[0]) {
      const next = new Date(existing.rows[0].created_at);
      next.setHours(next.getHours() + cooldownHours());
      if (now < next) {
        await client.query('ROLLBACK');
        return { status: 'error', message: 'Claim cooldown has not expired yet — try again later.' };
      }
    }

    await client.query(
      `INSERT INTO faucet_claims (address, amount, confirmed, created_at)
       VALUES ($1, $2, false, now())
       ON CONFLICT (address) DO UPDATE SET amount = $2, confirmed = false, tx_hash = NULL, signer = NULL, created_at = now()`,
      [lower, allocationDisplay()],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    return { status: 'error', message: `Could not reserve claim: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    client.release();
  }

  try {
    const result = await transfer(address, allocationWei());
    await pool.query(
      'UPDATE faucet_claims SET tx_hash = $2, signer = $3, confirmed = $4 WHERE address = $1',
      [lower, result.txHash, result.signer, result.confirmed],
    );
    await logActivity('claim', lower, `${allocationDisplay()} sent from ${result.signer}`, result.txHash);

    const explorerBase = (process.env.FAUCET_EXPLORER_URL ?? 'https://explorer.registry.haratoken.app').replace(/\/$/, '');
    return {
      status: 'success',
      message: `${allocationDisplay()} sent to ${address}.`,
      txHash: result.txHash,
      explorerUrl: `${explorerBase}/tx/${result.txHash}`,
    };
  } catch (err) {
    // Release the reservation so the address isn't stuck in cooldown for a claim that never went out.
    await pool.query('DELETE FROM faucet_claims WHERE address = $1 AND confirmed = false', [lower]);
    return { status: 'error', message: `Faucet transfer failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export interface FaucetStatus {
  chainId: string;
  blockNumber: number;
  contractOwner: string;
  primarySigner: string;
  secondarySigner: string;
  allocation: string;
  cooldownHours: number;
}

export async function getFaucetStatus(): Promise<FaucetStatus> {
  const [block, owner, [primary, secondary]] = await Promise.all([
    blockNumber(),
    contractOwner(),
    Promise.resolve(signerAddresses()),
  ]);
  return {
    chainId: process.env.FAUCET_CHAIN_ID ?? '121212',
    blockNumber: block,
    contractOwner: owner,
    primarySigner: primary,
    secondarySigner: secondary,
    allocation: allocationDisplay(),
    cooldownHours: cooldownHours(),
  };
}
