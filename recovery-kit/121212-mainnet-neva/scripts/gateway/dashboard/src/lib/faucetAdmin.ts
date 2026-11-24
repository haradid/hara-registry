'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { pool } from './db';
import { getSession } from './auth';
import { isWhitelisted, setWhitelist } from './faucetChain';

// Recipients management. Unlike the standalone Go app this replaces, there is
// no separate admin username/password/session here — this page lives inside
// the dashboard's own Next.js middleware, which already gates every
// non-public route behind the dashboard's own admin login (see middleware.ts).
// Carrying over a second, parallel auth system would just be duplicate attack
// surface for no benefit once the two apps share one process.

export interface RecipientRow {
  wallet: string;
  name: string;
  label: string | null;
  email: string | null;
  note: string | null;
  allowed: boolean;
  tx_hash: string | null;
  added_by: string | null;
  added_at: string;
  updated_at: string;
}

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export async function listRecipients(): Promise<RecipientRow[]> {
  const result = await pool.query('SELECT * FROM faucet_recipients ORDER BY updated_at DESC');
  return result.rows;
}

export async function addRecipientAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect('/login');

  const wallet = String(formData.get('wallet') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim() || 'Unnamed recipient';
  const email = String(formData.get('email') ?? '').trim() || null;
  const note = String(formData.get('note') ?? '').trim() || null;

  if (!ADDRESS_RE.test(wallet)) {
    throw new Error('Invalid wallet address');
  }
  const lower = wallet.toLowerCase();

  const existing = await pool.query('SELECT 1 FROM faucet_recipients WHERE wallet = $1', [lower]);
  if ((existing.rowCount ?? 0) > 0) {
    throw new Error('Recipient already exists');
  }

  const alreadyOnChain = await isWhitelisted(wallet);
  const txHash = alreadyOnChain ? null : await setWhitelist(wallet, true);

  await pool.query(
    `INSERT INTO faucet_recipients (wallet, name, email, note, allowed, tx_hash, added_by, added_at, updated_at)
     VALUES ($1, $2, $3, $4, true, $5, $6, now(), now())`,
    [lower, name, email, note, txHash, session.email],
  );
  await pool.query(
    `INSERT INTO faucet_activity (type, wallet, message, tx_hash) VALUES ('whitelist_added', $1, 'Recipient added to the on-chain whitelist', $2)`,
    [lower, txHash],
  );

  revalidatePath('/recipients');
}

export async function toggleRecipientAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect('/login');

  const wallet = String(formData.get('wallet') ?? '').trim().toLowerCase();
  const nextAllowed = String(formData.get('allowed') ?? '') === 'true';

  if (!ADDRESS_RE.test(wallet)) throw new Error('Invalid wallet address');

  const current = await isWhitelisted(wallet);
  const txHash = current === nextAllowed ? null : await setWhitelist(wallet, nextAllowed);

  await pool.query(
    'UPDATE faucet_recipients SET allowed = $2, tx_hash = COALESCE($3, tx_hash), updated_at = now() WHERE wallet = $1',
    [wallet, nextAllowed, txHash],
  );
  await pool.query(
    `INSERT INTO faucet_activity (type, wallet, message, tx_hash) VALUES ($2, $1, $3, $4)`,
    [
      wallet,
      nextAllowed ? 'whitelist_added' : 'whitelist_revoked',
      nextAllowed ? 'Recipient restored to the on-chain whitelist' : 'Recipient revoked from the on-chain whitelist',
      txHash,
    ],
  );

  revalidatePath('/recipients');
}

export interface ActivityRow {
  type: string;
  wallet: string | null;
  message: string | null;
  tx_hash: string | null;
  created_at: string;
}

export async function listActivity(limit = 25): Promise<ActivityRow[]> {
  const result = await pool.query('SELECT * FROM faucet_activity ORDER BY created_at DESC LIMIT $1', [limit]);
  return result.rows;
}
