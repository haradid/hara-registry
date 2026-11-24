import { pool } from '@/lib/db';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import {
  createApiKeyAction,
  updateApiKeyLimitsAction,
  revokeApiKeyAction,
  updateUserStatusAction,
  dismissNewApiKey,
} from '@/lib/actions';

interface ApiKeyRow {
  id: string;
  key_prefix: string;
  label: string | null;
  rps_limit: number;
  daily_quota: string;
  status: string;
  last_used_at: string | null;
}

async function getUser(userId: string) {
  const result = await pool.query(
    `SELECT id, name, email, organization, status FROM users WHERE id = $1`,
    [userId]
  );
  return result.rows[0] ?? null;
}

async function getApiKeys(userId: string): Promise<ApiKeyRow[]> {
  const result = await pool.query(
    `SELECT id, key_prefix, label, rps_limit, daily_quota, status, last_used_at
     FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows;
}

export default async function UserDetailPage({ params }: { params: { id: string } }) {
  const user = await getUser(params.id);
  if (!user) notFound();

  const apiKeys = await getApiKeys(params.id);
  const newKey = cookies().get('new_api_key')?.value ?? null;

  return (
    <div className="page">
      <p style={{ marginBottom: '0.5rem' }}>
        <a href="/users">&larr; Back to users</a>
      </p>
      <h1 className="page-title">{user.name}</h1>
      <p className="page-subtitle" style={{ marginBottom: '1rem' }}>
        {user.email} {user.organization ? `· ${user.organization}` : ''}
      </p>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span className="muted" style={{ fontSize: '0.85rem' }}>Status</span>
          <span className={`badge ${user.status === 'active' ? 'badge-success' : 'badge-danger'}`}>
            {user.status}
          </span>
          {user.status === 'active' ? (
            <form action={updateUserStatusAction.bind(null, user.id, 'suspended')}>
              <button type="submit" className="btn btn-sm btn-danger">
                Suspend
              </button>
            </form>
          ) : (
            <form action={updateUserStatusAction.bind(null, user.id, 'active')}>
              <button type="submit" className="btn btn-sm btn-primary">
                Reactivate
              </button>
            </form>
          )}
        </div>
      </div>

      {newKey && (
        <div className="alert alert-success">
          <strong>New API key created — copy it now, it will not be shown again:</strong>
          <div className="pre-box" style={{ margin: '0.6rem 0' }}>
            {newKey}
          </div>
          <p style={{ margin: '0 0 0.75rem' }}>
            HTTP: <code>https://rpc.registry.haratoken.app/v1/{newKey}</code>
            <br />
            WS: <code>wss://rpc.registry.haratoken.app/v1/{newKey}</code>
          </p>
          <form action={dismissNewApiKey.bind(null, user.id)}>
            <button type="submit" className="btn btn-sm">
              I&apos;ve copied it
            </button>
          </form>
        </div>
      )}

      <h2 className="section-title">API Keys</h2>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <form action={createApiKeyAction.bind(null, user.id)} className="field-row">
          <div className="field">
            <label htmlFor="label">Label</label>
            <input id="label" className="input" name="label" placeholder="Optional" />
          </div>
          <div className="field">
            <label htmlFor="rps_limit">RPS limit</label>
            <input id="rps_limit" className="input" name="rps_limit" type="number" defaultValue={10} min={1} style={{ width: 90 }} />
          </div>
          <div className="field">
            <label htmlFor="daily_quota">Daily quota (0=unlimited)</label>
            <input id="daily_quota" className="input" name="daily_quota" type="number" defaultValue={100000} min={0} style={{ width: 130 }} />
          </div>
          <button type="submit" className="btn btn-primary">
            Generate key
          </button>
        </form>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Key prefix</th>
              <th>Label</th>
              <th>Limits (RPS / daily quota)</th>
              <th>Status</th>
              <th>Last used</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {apiKeys.map((k) => (
              <tr key={k.id}>
                <td>
                  <code>{k.key_prefix}...</code>
                </td>
                <td>{k.label ?? '-'}</td>
                <td>
                  <form
                    action={updateApiKeyLimitsAction.bind(null, k.id, user.id)}
                    style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}
                  >
                    <input className="input" name="rps_limit" type="number" defaultValue={k.rps_limit} min={1} style={{ width: 70, padding: '0.35rem 0.5rem' }} />
                    <input className="input" name="daily_quota" type="number" defaultValue={k.daily_quota} min={0} style={{ width: 100, padding: '0.35rem 0.5rem' }} />
                    <button type="submit" className="btn btn-sm">Save</button>
                  </form>
                </td>
                <td>
                  <span className={`badge ${k.status === 'active' ? 'badge-success' : 'badge-danger'}`}>
                    {k.status}
                  </span>
                </td>
                <td>{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : 'never'}</td>
                <td>
                  {k.status === 'active' && (
                    <form action={revokeApiKeyAction.bind(null, k.id, user.id)}>
                      <button type="submit" className="btn btn-sm btn-danger">
                        Revoke
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {apiKeys.length === 0 && (
              <tr>
                <td colSpan={6} className="empty-row">
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
