import { pool } from '@/lib/db';

interface ApiKeyRow {
  id: string;
  key_prefix: string;
  label: string | null;
  rps_limit: number;
  daily_quota: string;
  status: string;
  last_used_at: string | null;
  user_id: string;
  user_name: string;
  user_email: string;
}

async function getApiKeys(): Promise<ApiKeyRow[]> {
  const result = await pool.query(`
    SELECT k.id, k.key_prefix, k.label, k.rps_limit, k.daily_quota, k.status, k.last_used_at,
           u.id AS user_id, u.name AS user_name, u.email AS user_email
    FROM api_keys k
    JOIN users u ON u.id = k.user_id
    ORDER BY k.created_at DESC
  `);
  return result.rows;
}

export default async function ApiKeysPage() {
  const keys = await getApiKeys();

  return (
    <div className="page">
      <h1 className="page-title">API Keys</h1>
      <p className="page-subtitle">All keys issued across every user, newest first.</p>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Key prefix</th>
              <th>Label</th>
              <th>User</th>
              <th>RPS limit</th>
              <th>Daily quota</th>
              <th>Status</th>
              <th>Last used</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id}>
                <td>
                  <code>{k.key_prefix}...</code>
                </td>
                <td>{k.label ?? '-'}</td>
                <td>
                  <a href={`/users/${k.user_id}`}>
                    {k.user_name} ({k.user_email})
                  </a>
                </td>
                <td>{k.rps_limit}</td>
                <td>{Number(k.daily_quota) === 0 ? 'unlimited' : k.daily_quota}</td>
                <td>
                  <span className={`badge ${k.status === 'active' ? 'badge-success' : 'badge-danger'}`}>
                    {k.status}
                  </span>
                </td>
                <td>{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : 'never'}</td>
              </tr>
            ))}
            {keys.length === 0 && (
              <tr>
                <td colSpan={7} className="empty-row">
                  No API keys yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
