import { pool } from '@/lib/db';

interface UsageRow {
  api_key_id: string;
  key_prefix: string;
  user_name: string;
  bucket_start: string;
  method: string | null;
  request_count: string;
  error_count: string;
  rate_limited_count: string;
}

interface SummaryRow {
  api_key_id: string;
  key_prefix: string;
  user_name: string;
  user_email: string;
  total_requests: string;
  total_rate_limited: string;
  today_requests: string;
}

async function getSummary(): Promise<SummaryRow[]> {
  const result = await pool.query(`
    SELECT k.id AS api_key_id, k.key_prefix, u.name AS user_name, u.email AS user_email,
           COALESCE(SUM(h.request_count), 0)::text AS total_requests,
           COALESCE(SUM(h.rate_limited_count), 0)::text AS total_rate_limited,
           COALESCE(q.request_count, 0)::text AS today_requests
    FROM api_keys k
    JOIN users u ON u.id = k.user_id
    LEFT JOIN usage_hourly h ON h.api_key_id = k.id
    LEFT JOIN usage_daily_quota q ON q.api_key_id = k.id AND q.usage_date = CURRENT_DATE
    GROUP BY k.id, k.key_prefix, u.name, u.email, q.request_count
    ORDER BY total_requests DESC
  `);
  return result.rows;
}

async function getRecent(): Promise<UsageRow[]> {
  const result = await pool.query(`
    SELECT h.api_key_id, k.key_prefix, u.name AS user_name, h.bucket_start, h.method,
           h.request_count, h.error_count, h.rate_limited_count
    FROM usage_hourly h
    JOIN api_keys k ON k.id = h.api_key_id
    JOIN users u ON u.id = k.user_id
    ORDER BY h.bucket_start DESC
    LIMIT 50
  `);
  return result.rows;
}

export default async function UsagePage() {
  const summary = await getSummary();
  const recent = await getRecent();

  const totalRequests = summary.reduce((sum, r) => sum + Number(r.total_requests), 0);
  const totalToday = summary.reduce((sum, r) => sum + Number(r.today_requests), 0);
  const totalRateLimited = summary.reduce((sum, r) => sum + Number(r.total_rate_limited), 0);

  return (
    <div className="page">
      <h1 className="page-title">Usage</h1>
      <p className="page-subtitle">RPC request volume across every API key.</p>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Total requests</div>
          <div className="stat-value">{totalRequests.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Requests today</div>
          <div className="stat-value">{totalToday.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Rate-limited</div>
          <div className="stat-value">{totalRateLimited.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active keys</div>
          <div className="stat-value">{summary.length}</div>
        </div>
      </div>

      <h2 className="section-title">Summary by API key</h2>
      <div className="table-wrap" style={{ marginBottom: '2rem' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Key prefix</th>
              <th>User</th>
              <th>Total requests</th>
              <th>Total rate-limited</th>
              <th>Requests today</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((row) => (
              <tr key={row.api_key_id}>
                <td>
                  <code>{row.key_prefix}...</code>
                </td>
                <td>
                  {row.user_name} ({row.user_email})
                </td>
                <td>{Number(row.total_requests).toLocaleString()}</td>
                <td>{Number(row.total_rate_limited).toLocaleString()}</td>
                <td>{Number(row.today_requests).toLocaleString()}</td>
              </tr>
            ))}
            {summary.length === 0 && (
              <tr>
                <td colSpan={5} className="empty-row">
                  No usage data yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">Recent hourly buckets</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Bucket (UTC)</th>
              <th>Key prefix</th>
              <th>User</th>
              <th>Method</th>
              <th>Requests</th>
              <th>Errors</th>
              <th>Rate-limited</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((row, i) => (
              <tr key={i}>
                <td>{new Date(row.bucket_start).toISOString()}</td>
                <td>
                  <code>{row.key_prefix}...</code>
                </td>
                <td>{row.user_name}</td>
                <td>{row.method ?? '-'}</td>
                <td>{row.request_count}</td>
                <td>{row.error_count}</td>
                <td>{row.rate_limited_count}</td>
              </tr>
            ))}
            {recent.length === 0 && (
              <tr>
                <td colSpan={7} className="empty-row">
                  No usage data yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
