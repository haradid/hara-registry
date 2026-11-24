import { pool } from '../db';

interface UsageEvent {
  apiKeyId: string;
  method: string | null;
  isError: boolean;
  isRateLimited: boolean;
}

const FLUSH_INTERVAL_MS = 10_000;
const buffer: UsageEvent[] = [];
const lastUsed = new Map<string, Date>();
let isFlushing = false;

export function recordUsage(event: UsageEvent): void {
  buffer.push(event);
  lastUsed.set(event.apiKeyId, new Date());
}

function hourBucket(date: Date): Date {
  const bucket = new Date(date);
  bucket.setUTCMinutes(0, 0, 0);
  return bucket;
}

async function flush(): Promise<void> {
  if (buffer.length === 0 && lastUsed.size === 0) return;
  // Re-entrancy guard: under load, a flush can take longer than FLUSH_INTERVAL_MS (each
  // event is a sequential await'd query on ONE held pooled client for the whole
  // transaction) — without this, the next timer tick starts a second overlapping flush,
  // holding a second client, and two overlapping flushes racing the same ON CONFLICT
  // upsert rows in different order is exactly what caused the 2026-09-15 10:15 UTC
  // deadlock (40P01) that silently exhausted the pool and stopped all usage/activity
  // logging until this fix. Same pattern already in use on testnet's recorder.ts.
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
  const lastUsedEntries = Array.from(lastUsed.entries());
  lastUsed.clear();

  const bucketStart = hourBucket(new Date()).toISOString();
  const today = new Date().toISOString().slice(0, 10);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const event of events) {
      await client.query(
        `INSERT INTO usage_hourly (api_key_id, bucket_start, method, request_count, error_count, rate_limited_count)
         VALUES ($1, $2, $3, 1, $4, $5)
         ON CONFLICT (api_key_id, bucket_start, method)
         DO UPDATE SET
           request_count = usage_hourly.request_count + 1,
           error_count = usage_hourly.error_count + $4,
           rate_limited_count = usage_hourly.rate_limited_count + $5`,
        [event.apiKeyId, bucketStart, event.method, event.isError ? 1 : 0, event.isRateLimited ? 1 : 0]
      );

      await client.query(
        `INSERT INTO usage_daily_quota (api_key_id, usage_date, request_count)
         VALUES ($1, $2, 1)
         ON CONFLICT (api_key_id, usage_date)
         DO UPDATE SET request_count = usage_daily_quota.request_count + 1`,
        [event.apiKeyId, today]
      );
    }

    for (const [apiKeyId, ts] of lastUsedEntries) {
      await client.query(`UPDATE api_keys SET last_used_at = $1 WHERE id = $2`, [ts, apiKeyId]);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('usage flush failed', err);
  } finally {
    client.release();
  }
}

export function startUsageRecorder(): void {
  setInterval(() => {
    flush().catch((err) => console.error('usage flush error', err));
  }, FLUSH_INTERVAL_MS);
}
