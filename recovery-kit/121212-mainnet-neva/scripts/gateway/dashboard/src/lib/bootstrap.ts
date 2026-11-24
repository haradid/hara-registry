import { pool } from './db';
import { hashPassword } from './auth';

declare global {
  // eslint-disable-next-line no-var
  var __bootstrapAdmin: Promise<void> | undefined;
}

export function ensureBootstrapAdminOnce(): Promise<void> {
  if (!global.__bootstrapAdmin) {
    global.__bootstrapAdmin = ensureBootstrapAdmin().catch((err) => {
      console.error('bootstrap admin failed', err);
    });
  }
  return global.__bootstrapAdmin;
}

async function ensureBootstrapAdmin(): Promise<void> {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !password) return;

  const existing = await pool.query('SELECT 1 FROM admins LIMIT 1');
  if ((existing.rowCount ?? 0) > 0) return;

  const passwordHash = await hashPassword(password);
  await pool.query(
    `INSERT INTO admins (email, password_hash) VALUES ($1, $2)
     ON CONFLICT (email) DO NOTHING`,
    [email, passwordHash]
  );
}
