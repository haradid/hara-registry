import { Pool } from 'pg';
import { config } from './config';

// Timeouts are deliberate, not defaults: mainnet's 2026-09-15 deadlock incident showed
// that a single hung/deadlocked query on an un-timed-out pool client is held forever, and
// enough of those silently exhaust the whole pool — after which every future query
// anywhere in the app queues forever with no error. These bound every failure mode to a
// fixed time so a stuck client always gets released back (or replaced) instead of leaking
// permanently. Ported here as defense-in-depth even though this file's recorder.ts already
// has the re-entrancy guard that mainnet's was missing.
export const pool = new Pool({
  connectionString: config.databaseUrl,
  statement_timeout: 15_000,
  query_timeout: 20_000,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
});
