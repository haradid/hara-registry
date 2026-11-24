import { Pool } from 'pg';

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

export const pool =
  global.__pgPool ??
  new Pool({ connectionString: process.env.DATABASE_URL });

if (!global.__pgPool) {
  global.__pgPool = pool;
}
