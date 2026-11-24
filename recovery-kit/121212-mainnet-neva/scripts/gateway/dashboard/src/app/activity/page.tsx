import { pool } from '@/lib/db';

interface AuditRow {
  id: number;
  actor: string | null;
  action: string;
  target: string | null;
  detail: unknown;
  created_at: string;
}

interface RpcActivityRow {
  id: number;
  key_prefix: string | null;
  method: string | null;
  status_code: number | null;
  duration_ms: number | null;
  ip_address: string | null;
  created_at: string;
}

async function getAuditLog(): Promise<AuditRow[]> {
  const result = await pool.query(`
    SELECT id, actor, action, target, detail, created_at
    FROM audit_log
    ORDER BY created_at DESC
    LIMIT 50
  `);
  return result.rows;
}

async function getRpcActivity(): Promise<RpcActivityRow[]> {
  const result = await pool.query(`
    SELECT id, key_prefix, method, status_code, duration_ms, ip_address, created_at
    FROM rpc_activity_log
    ORDER BY created_at DESC
    LIMIT 50
  `);
  return result.rows;
}

function statusBadgeClass(status: number | null): string {
  if (status === null) return 'badge-neutral';
  if (status >= 200 && status < 300) return 'badge-success';
  if (status === 429) return 'badge-neutral';
  return 'badge-danger';
}

export default async function ActivityPage() {
  const [auditLog, rpcActivity] = await Promise.all([getAuditLog(), getRpcActivity()]);

  return (
    <div className="page">
      <h1 className="page-title">Activity Monitor</h1>
      <p className="page-subtitle">
        Live view of what&apos;s happening on mainnet — dashboard admin actions on the left,
        individual RPC gateway requests on the right. Most recent 50 events each.
      </p>

      <h2 className="section-title">Dashboard activity</h2>
      <div className="table-wrap" style={{ marginBottom: '2rem' }}>
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Target</th>
            </tr>
          </thead>
          <tbody>
            {auditLog.map((row) => (
              <tr key={row.id}>
                <td className="muted" style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                  {new Date(row.created_at).toLocaleString()}
                </td>
                <td>{row.actor ?? 'system'}</td>
                <td>
                  <code>{row.action}</code>
                </td>
                <td>{row.target ?? '-'}</td>
              </tr>
            ))}
            {auditLog.length === 0 && (
              <tr>
                <td colSpan={4} className="empty-row">
                  No dashboard activity recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">RPC gateway activity</h2>
      <p className="muted" style={{ fontSize: '0.85rem', marginTop: '-0.5rem', marginBottom: '0.9rem' }}>
        Per-request log, retained for 30 days. Aggregated history lives on the{' '}
        <a href="/usage">Usage</a> page.
      </p>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Key prefix</th>
              <th>Method</th>
              <th>Status</th>
              <th>Duration</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {rpcActivity.map((row) => (
              <tr key={row.id}>
                <td className="muted" style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                  {new Date(row.created_at).toLocaleString()}
                </td>
                <td>
                  <code>{row.key_prefix ?? '-'}</code>
                </td>
                <td>{row.method ?? '-'}</td>
                <td>
                  <span className={`badge ${statusBadgeClass(row.status_code)}`}>{row.status_code ?? '-'}</span>
                </td>
                <td>{row.duration_ms !== null ? `${row.duration_ms}ms` : '-'}</td>
                <td className="muted">{row.ip_address ?? '-'}</td>
              </tr>
            ))}
            {rpcActivity.length === 0 && (
              <tr>
                <td colSpan={6} className="empty-row">
                  No RPC activity recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
