import Link from 'next/link';
import { getExplorerProvider } from '@/lib/explorerRpc';
import { explorerSearchAction } from '@/lib/explorerActions';

const LATEST_BLOCKS_COUNT = 15;

function timeAgo(unixSeconds: number): string {
  const diffS = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
  if (diffS < 60) return `${diffS}s ago`;
  if (diffS < 3600) return `${Math.floor(diffS / 60)}m ago`;
  return `${Math.floor(diffS / 3600)}h ago`;
}

export default async function ExplorerPage({ searchParams }: { searchParams: { error?: string } }) {
  const provider = getExplorerProvider();
  const latestNumber = await provider.getBlockNumber();

  const numbers = Array.from({ length: Math.min(LATEST_BLOCKS_COUNT, latestNumber + 1) }, (_, i) => latestNumber - i);
  const blocks = (await Promise.all(numbers.map((n) => provider.getBlock(n)))).filter((b) => b !== null);

  return (
    <div className="page">
      <h1 className="page-title">Block Explorer</h1>
      <p className="page-subtitle">
        Chain ID 121299. Reads directly from the RPC node — no separate index, so search only
        works by exact block number, transaction hash, or address (no free-text/history search).
      </p>

      <div className="card">
        <form action={explorerSearchAction} className="field-row">
          <div className="field" style={{ flex: 1, minWidth: 260 }}>
            <label htmlFor="q">Search by block number / tx hash / address</label>
            <input id="q" className="input" name="q" placeholder="0x... or a block number" style={{ width: '100%' }} autoFocus />
          </div>
          <button type="submit" className="btn btn-primary">
            Search
          </button>
        </form>
        {searchParams.error === 'notfound' && (
          <p style={{ color: 'var(--danger)', fontSize: '0.85rem', margin: '0.75rem 0 0' }}>
            Not a recognized block number, transaction hash, or address.
          </p>
        )}
      </div>

      <h2 className="section-title">Latest blocks</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Block</th>
              <th>Age</th>
              <th>Txs</th>
              <th>Gas used</th>
              <th>Miner</th>
            </tr>
          </thead>
          <tbody>
            {blocks.map((b) => (
              <tr key={b.number}>
                <td>
                  <Link href={`/explorer/block/${b.number}`}>{b.number}</Link>
                </td>
                <td className="muted" style={{ fontSize: '0.82rem' }}>
                  {timeAgo(b.timestamp)}
                </td>
                <td>{b.transactions.length}</td>
                <td>{b.gasUsed.toString()}</td>
                <td>
                  <Link href={`/explorer/address/${b.miner}`}>
                    <code>{b.miner.slice(0, 10)}...</code>
                  </Link>
                </td>
              </tr>
            ))}
            {blocks.length === 0 && (
              <tr>
                <td colSpan={5} className="empty-row">
                  No blocks yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
