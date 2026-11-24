import { pool } from '@/lib/db';
import {
  addAlertRecipientAction,
  toggleAlertRecipientAction,
  deleteAlertRecipientAction,
} from '@/lib/actions';

interface RecipientRow {
  id: string;
  email: string;
  severity: string;
  active: boolean;
  note: string | null;
  created_at: string;
}

async function getRecipients(): Promise<RecipientRow[]> {
  const result = await pool.query(`
    SELECT id, email, severity, active, note, created_at
    FROM alert_recipients
    ORDER BY created_at DESC
  `);
  return result.rows;
}

export default async function AlertRecipientsPage() {
  const recipients = await getRecipients();

  return (
    <div className="page">
      <h1 className="page-title">Alert Recipients</h1>
      <p className="page-subtitle">
        Email addresses that receive blockchain alerts from Alertmanager via alert-sink.
        Severity <strong>all</strong> = critical + warning. Manage via SQL:{' '}
        <code>INSERT INTO alert_recipients (email, severity) VALUES (&#39;you@example.com&#39;, &#39;critical&#39;)</code>
      </p>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <form action={addAlertRecipientAction} className="field-row">
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" className="input" name="email" type="email" placeholder="you@example.com" required style={{ minWidth: 220 }} />
          </div>
          <div className="field">
            <label htmlFor="severity">Severity</label>
            <select id="severity" className="input" name="severity">
              <option value="all">All alerts</option>
              <option value="critical">Critical only</option>
              <option value="warning">Warning only</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="note">Note</label>
            <input id="note" className="input" name="note" placeholder="Optional" />
          </div>
          <button type="submit" className="btn btn-primary">
            Add recipient
          </button>
        </form>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Severity</th>
              <th>Status</th>
              <th>Note</th>
              <th>Added</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {recipients.map((r) => (
              <tr key={r.id} style={{ opacity: r.active ? 1 : 0.5 }}>
                <td>{r.email}</td>
                <td>{r.severity}</td>
                <td>
                  <form action={toggleAlertRecipientAction.bind(null, r.id, !r.active)}>
                    <button type="submit" className="btn btn-sm">
                      {r.active ? 'Disable' : 'Enable'}
                    </button>
                  </form>
                </td>
                <td className="muted">{r.note ?? '-'}</td>
                <td className="muted" style={{ fontSize: '0.82rem' }}>
                  {new Date(r.created_at).toLocaleDateString()}
                </td>
                <td>
                  <form action={deleteAlertRecipientAction.bind(null, r.id)}>
                    <button type="submit" className="btn btn-sm btn-danger">
                      Delete
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {recipients.length === 0 && (
              <tr>
                <td colSpan={6} className="empty-row">
                  No alert recipients yet. Add one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
