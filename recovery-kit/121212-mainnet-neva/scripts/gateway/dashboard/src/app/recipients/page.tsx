import { listRecipients, listActivity, addRecipientAction, toggleRecipientAction } from '@/lib/faucetAdmin';

export const dynamic = 'force-dynamic';

export default async function RecipientsPage() {
  const [recipients, activity] = await Promise.all([listRecipients(), listActivity()]);
  const active = recipients.filter((r) => r.allowed).length;

  return (
    <div className="page">
      <h1 className="page-title">Faucet Recipients</h1>
      <p className="page-subtitle">
        {active} active / {recipients.length} total — manages the on-chain whitelist contract
        directly (each toggle sends a real transaction).
      </p>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <form action={addRecipientAction} className="field-row">
          <div className="field">
            <label htmlFor="wallet">Wallet address</label>
            <input id="wallet" className="input" name="wallet" placeholder="0x..." required pattern="^0x[a-fA-F0-9]{40}$" style={{ minWidth: 320 }} />
          </div>
          <div className="field">
            <label htmlFor="name">Name</label>
            <input id="name" className="input" name="name" placeholder="Optional" />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" className="input" name="email" type="email" placeholder="Optional" />
          </div>
          <div className="field">
            <label htmlFor="note">Note</label>
            <input id="note" className="input" name="note" placeholder="Optional" />
          </div>
          <button type="submit" className="btn btn-primary">
            Add to whitelist
          </button>
        </form>
      </div>

      <div className="table-wrap" style={{ marginBottom: '2rem' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Wallet</th>
              <th>Name</th>
              <th>Email</th>
              <th>Status</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {recipients.map((r) => (
              <tr key={r.wallet}>
                <td>
                  <code>{r.wallet}</code>
                </td>
                <td>{r.name}</td>
                <td>{r.email ?? '-'}</td>
                <td>
                  <span className={`badge ${r.allowed ? 'badge-success' : 'badge-danger'}`}>
                    {r.allowed ? 'Whitelisted' : 'Revoked'}
                  </span>
                </td>
                <td>{new Date(r.updated_at).toLocaleString()}</td>
                <td>
                  <form action={toggleRecipientAction}>
                    <input type="hidden" name="wallet" value={r.wallet} />
                    <input type="hidden" name="allowed" value={(!r.allowed).toString()} />
                    <button type="submit" className={`btn btn-sm ${r.allowed ? 'btn-danger' : ''}`}>
                      {r.allowed ? 'Revoke' : 'Restore'}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {recipients.length === 0 && (
              <tr>
                <td colSpan={6} className="empty-row">
                  No recipients yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">Recent activity</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Type</th>
              <th>Wallet</th>
              <th>Message</th>
              <th>Tx</th>
            </tr>
          </thead>
          <tbody>
            {activity.map((a, i) => (
              <tr key={i}>
                <td className="muted" style={{ fontSize: '0.82rem' }}>{new Date(a.created_at).toLocaleString()}</td>
                <td>{a.type}</td>
                <td>{a.wallet ? <code>{a.wallet}</code> : '-'}</td>
                <td>{a.message}</td>
                <td>{a.tx_hash ? <code>{a.tx_hash.slice(0, 10)}...</code> : '-'}</td>
              </tr>
            ))}
            {activity.length === 0 && (
              <tr>
                <td colSpan={5} className="empty-row">
                  No activity yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
