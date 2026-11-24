'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { pool } from './db';
import { invalidateApiKeyCache } from './redis';
import { generateApiKey, hashApiKey, apiKeyPrefix } from './apiKeys';
import { getSession, setSessionCookie, signSession, clearSessionCookie, verifyPassword, cookieSecure } from './auth';

const NEW_KEY_COOKIE = 'new_api_key';

export async function loginAction(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  const result = await pool.query('SELECT id, email, password_hash FROM admins WHERE email = $1', [email]);
  const admin = result.rows[0];
  if (!admin || !(await verifyPassword(password, admin.password_hash))) {
    redirect('/login?error=1');
  }

  const token = await signSession({ adminId: admin.id, email: admin.email });
  await setSessionCookie(token);
  redirect('/users');
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect('/login');
}

export async function createUserAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const name = String(formData.get('name') ?? '');
  const email = String(formData.get('email') ?? '');
  const organization = String(formData.get('organization') ?? '') || null;

  await pool.query(
    `INSERT INTO users (name, email, organization) VALUES ($1, $2, $3)`,
    [name, email, organization]
  );
  revalidatePath('/users');
  redirect('/users');
}

export async function updateUserStatusAction(userId: string, status: 'active' | 'suspended'): Promise<void> {
  await requireAdmin();
  await pool.query(`UPDATE users SET status = $1, updated_at = now() WHERE id = $2`, [status, userId]);
  revalidatePath(`/users/${userId}`);
  revalidatePath('/users');
}

export async function createApiKeyAction(userId: string, formData: FormData): Promise<void> {
  await requireAdmin();
  const label = String(formData.get('label') ?? '') || null;
  const rpsLimit = Number(formData.get('rps_limit') ?? 10);
  const dailyQuota = Number(formData.get('daily_quota') ?? 100000);

  const plaintextKey = generateApiKey();
  const keyHash = hashApiKey(plaintextKey);
  const prefix = apiKeyPrefix(plaintextKey);

  await pool.query(
    `INSERT INTO api_keys (user_id, key_prefix, key_hash, label, rps_limit, daily_quota)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, prefix, keyHash, label, rpsLimit, dailyQuota]
  );

  cookies().set(NEW_KEY_COOKIE, plaintextKey, {
    httpOnly: false,
    secure: cookieSecure(),
    sameSite: 'lax',
    path: `/users/${userId}`,
    maxAge: 60,
  });

  revalidatePath(`/users/${userId}`);
  redirect(`/users/${userId}`);
}

export async function dismissNewApiKey(userId: string): Promise<void> {
  cookies().delete({ name: NEW_KEY_COOKIE, path: `/users/${userId}` });
  revalidatePath(`/users/${userId}`);
}

export async function updateApiKeyLimitsAction(apiKeyId: string, userId: string, formData: FormData): Promise<void> {
  await requireAdmin();
  const rpsLimit = Number(formData.get('rps_limit') ?? 10);
  const dailyQuota = Number(formData.get('daily_quota') ?? 100000);

  const result = await pool.query(
    `UPDATE api_keys SET rps_limit = $1, daily_quota = $2 WHERE id = $3 RETURNING key_hash`,
    [rpsLimit, dailyQuota, apiKeyId]
  );
  const keyHash = result.rows[0]?.key_hash;
  if (keyHash) await invalidateApiKeyCache(keyHash);

  revalidatePath(`/users/${userId}`);
  revalidatePath('/api-keys');
}

export async function revokeApiKeyAction(apiKeyId: string, userId: string): Promise<void> {
  await requireAdmin();
  const result = await pool.query(
    `UPDATE api_keys SET status = 'revoked', revoked_at = now() WHERE id = $1 RETURNING key_hash`,
    [apiKeyId]
  );
  const keyHash = result.rows[0]?.key_hash;
  if (keyHash) await invalidateApiKeyCache(keyHash);

  revalidatePath(`/users/${userId}`);
  revalidatePath('/api-keys');
}

export async function addAlertRecipientAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const email = String(formData.get('email') ?? '').trim();
  const severity = String(formData.get('severity') ?? 'all');
  const note = String(formData.get('note') ?? '') || null;

  await pool.query(
    `INSERT INTO alert_recipients (email, severity, note) VALUES ($1, $2, $3)`,
    [email, severity, note]
  );
  revalidatePath('/alert-recipients');
  redirect('/alert-recipients');
}

export async function toggleAlertRecipientAction(id: string, active: boolean): Promise<void> {
  await requireAdmin();
  await pool.query(`UPDATE alert_recipients SET active = $1 WHERE id = $2`, [active, id]);
  revalidatePath('/alert-recipients');
}

export async function deleteAlertRecipientAction(id: string): Promise<void> {
  await requireAdmin();
  await pool.query(`DELETE FROM alert_recipients WHERE id = $1`, [id]);
  revalidatePath('/alert-recipients');
}

async function requireAdmin(): Promise<void> {
  const session = await getSession();
  if (!session) redirect('/login');
}
