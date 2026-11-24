import { pool } from './db';

export async function logAudit(
  actor: string | null,
  action: string,
  target?: string | null,
  detail?: Record<string, unknown>
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_log (actor, action, target, detail) VALUES ($1, $2, $3, $4)`,
      [actor, action, target ?? null, detail ? JSON.stringify(detail) : null]
    );
  } catch (err) {
    // Audit logging must never break the actual action it's recording.
    console.error('audit log insert failed', err);
  }
}
