import { pool } from '../db';

interface ActivityEvent {
  apiKeyId: string | null;
  keyPrefix: string | null;
  method: string | null;
  statusCode: number;
  durationMs: number;
  ipAddress: string | null;
}

const FLUSH_INTERVAL_MS = 10_000;
const PRUNE_INTERVAL_MS = 60 * 60_000; // check hourly — cheap, and independent of traffic volume
const RETENTION_HOURS = 24 * 30; // ~1 bulan (diminta user 2026-08-27, sebelumnya 72 jam)
const buffer: ActivityEvent[] = [];
let isFlushing = false;

export function recordActivity(event: ActivityEvent): void {
  buffer.push(event);
}

async function flush(): Promise<void> {
  if (buffer.length === 0) return;
  // Same re-entrancy guard as usage/recorder.ts — avoid overlapping flushes holding
  // multiple pooled Postgres clients under load.
  if (isFlushing) return;
  isFlushing = true;
  try {
    await doFlush();
  } finally {
    isFlushing = false;
  }
}

async function doFlush(): Promise<void> {
  const events = buffer.splice(0, buffer.length);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const event of events) {
      await client.query(
        `INSERT INTO rpc_activity_log (api_key_id, key_prefix, method, status_code, duration_ms, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [event.apiKeyId, event.keyPrefix, event.method, event.statusCode, event.durationMs, event.ipAddress]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('activity log flush failed', err);
  } finally {
    client.release();
  }
}

// Terpisah dari flush() dengan sengaja — flush() cuma jalan kalau ada data BARU di buffer,
// jadi di testnet yang traffic-nya sepi, prune yang digantung di flush() nyaris tidak pernah
// kejalan (buffer sering kosong -> flush() return early -> prune ikut ke-skip). Timer sendiri
// di sini jalan tiap jam terlepas dari ada traffic atau tidak.
async function prune(): Promise<void> {
  try {
    const result = await pool.query(
      `DELETE FROM rpc_activity_log WHERE created_at < now() - interval '${RETENTION_HOURS} hours'`
    );
    if ((result.rowCount ?? 0) > 0) {
      console.log(`activity log: pruned ${result.rowCount} rows older than ${RETENTION_HOURS}h`);
    }
  } catch (err) {
    console.error('activity log prune failed', err);
  }
}

export function startActivityLogger(): void {
  setInterval(() => {
    flush().catch((err) => console.error('activity log flush error', err));
  }, FLUSH_INTERVAL_MS);
  setInterval(() => {
    prune().catch((err) => console.error('activity log prune error', err));
  }, PRUNE_INTERVAL_MS);
  prune().catch((err) => console.error('activity log prune error', err)); // also run once at startup
}
