import { pool } from '@/lib/db';
import FaucetForm from './FaucetForm';

interface ClaimRow {
  address: string;
  amount_wei: string;
  status: string;
  tx_hash: string | null;
  created_at: string;
}

async function getRecentClaims(): Promise<ClaimRow[]> {
  const result = await pool.query(`
    SELECT address, amount_wei, status, tx_hash, created_at
    FROM faucet_claims
    ORDER BY created_at DESC
    LIMIT 20
  `);
  return result.rows;
}

function weiToEth(wei: string): string {
  try {
    const value = BigInt(wei);
    const whole = value / 1_000_000_000_000_000_000n;
    return whole.toString();
  } catch {
    return wei;
  }
}

export default async function FaucetPage() {
  const claims = await getRecentClaims();

  return (
    <div className="page">
      <h1 className="page-title">Testnet Faucet</h1>
      <p className="page-subtitle">
        Request free native testnet tokens for development and testing on chain ID 121299. One claim per
        address every 24 hours.
      </p>

      <FaucetForm />

      <h2 className="section-title">Recent claims</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Address</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Tx hash</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {claims.map((c, i) => (
              <tr key={i}>
                <td>
                  <code>{c.address}</code>
                </td>
                <td>{weiToEth(c.amount_wei)}</td>
                <td>
                  <span
                    className={`badge ${
                      c.status === 'sent' ? 'badge-success' : c.status === 'failed' ? 'badge-danger' : 'badge-neutral'
                    }`}
                  >
                    {c.status}
                  </span>
                </td>
                <td>{c.tx_hash ? <code>{c.tx_hash.slice(0, 10)}...</code> : '-'}</td>
                <td className="muted" style={{ fontSize: '0.82rem' }}>
                  {new Date(c.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
            {claims.length === 0 && (
              <tr>
                <td colSpan={5} className="empty-row">
                  No claims yet — be the first!
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
