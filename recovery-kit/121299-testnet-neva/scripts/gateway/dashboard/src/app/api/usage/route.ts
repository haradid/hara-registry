import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET(req: NextRequest) {
  const apiKeyId = req.nextUrl.searchParams.get('apiKeyId');
  const from = req.nextUrl.searchParams.get('from');
  const to = req.nextUrl.searchParams.get('to');

  const conditions: string[] = [];
  const values: unknown[] = [];

  if (apiKeyId) {
    values.push(apiKeyId);
    conditions.push(`api_key_id = $${values.length}`);
  }
  if (from) {
    values.push(from);
    conditions.push(`bucket_start >= $${values.length}`);
  }
  if (to) {
    values.push(to);
    conditions.push(`bucket_start <= $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await pool.query(
    `SELECT api_key_id, bucket_start, method, request_count, error_count, rate_limited_count
     FROM usage_hourly
     ${where}
     ORDER BY bucket_start DESC
     LIMIT 500`,
    values
  );

  return NextResponse.json({ data: result.rows });
}
