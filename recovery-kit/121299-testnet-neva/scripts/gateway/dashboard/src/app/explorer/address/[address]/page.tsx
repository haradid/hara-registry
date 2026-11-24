import Link from 'next/link';
import { ethers } from 'ethers';
import { getExplorerProvider } from '@/lib/explorerRpc';

// No indexer, so there's no full transaction history for an address — that's the
// inherent trade-off of a zero-database explorer. This scans a bounded recent window
// instead of the whole chain, which stays cheap (rpc1 handled 150 concurrent txs from
// 5 senders in ~7.5s during stress testing, so 50 getBlock calls here is trivial).
const RECENT_BLOCKS_WINDOW = 50;
const MAX_RECENT_TXS_SHOWN = 20;

export default async function AddressDetailPage({ params }: { params: { address: string } }) {
  let checksummed: string;
  try {
    checksummed = ethers.getAddress(params.address);
  } catch {
    return (
      <div className="page">
        <h1 className="page-title">Invalid address</h1>
        <p className="page-subtitle">
          <code>{params.address}</code> is not a valid address. <Link href="/explorer">Back to explorer</Link>.
        </p>
      </div>
    );
  }

  const provider = getExplorerProvider();
  const [balance, nonce, code, latestNumber] = await Promise.all([
    provider.getBalance(checksummed),
    provider.getTransactionCount(checksummed),
    provider.getCode(checksummed),
    provider.getBlockNumber(),
  ]);
  const isContract = code !== '0x';

  const scanFrom = Math.max(0, latestNumber - RECENT_BLOCKS_WINDOW + 1);
  const scanNumbers = Array.from({ length: latestNumber - scanFrom + 1 }, (_, i) => latestNumber - i);
  const recentBlocks = (await Promise.all(scanNumbers.map((n) => provider.getBlock(n, true)))).filter((b) => b !== null);
  const recentTxs = recentBlocks
    .flatMap((b) => b.prefetchedTransactions)
    .filter((tx) => tx.from.toLowerCase() === checksummed.toLowerCase() || tx.to?.toLowerCase() === checksummed.toLowerCase())
    .slice(0, MAX_RECENT_TXS_SHOWN);

  return (
    <div className="page">
      <p style={{ marginBottom: '0.5rem' }}>
        <Link href="/explorer">&larr; Back to explorer</Link>
      </p>
      <h1 className="page-title">Address</h1>
      <p className="page-subtitle">
        <code>{checksummed}</code>
      </p>

      <div className="card">
        <dl className="kv-grid">
          <dt>Balance</dt>
          <dd>{ethers.formatEther(balance)} native</dd>
          <dt>Transaction count (nonce)</dt>
          <dd>{nonce}</dd>
          <dt>Type</dt>
          <dd>
            <span className={`badge ${isContract ? 'badge-neutral' : 'badge-success'}`}>
              {isContract ? 'Contract' : 'Externally-owned account'}
            </span>
          </dd>
        </dl>
      </div>

      <h2 className="section-title">Recent activity (last {RECENT_BLOCKS_WINDOW} blocks only)</h2>
      <p className="muted" style={{ fontSize: '0.85rem', marginTop: '-0.5rem', marginBottom: '0.9rem' }}>
        No full-history index — this only scans the last {RECENT_BLOCKS_WINDOW} blocks
        (block {scanFrom} to {latestNumber}), not the address&apos;s entire history.
      </p>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Hash</th>
              <th>Block</th>
              <th>Direction</th>
              <th>Counterparty</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {recentTxs.map((tx) => {
              const isSender = tx.from.toLowerCase() === checksummed.toLowerCase();
              const counterparty = isSender ? tx.to : tx.from;
              return (
                <tr key={tx.hash}>
                  <td>
                    <Link href={`/explorer/tx/${tx.hash}`}>
                      <code>{tx.hash.slice(0, 14)}...</code>
                    </Link>
                  </td>
                  <td>
                    <Link href={`/explorer/block/${tx.blockNumber}`}>{tx.blockNumber}</Link>
                  </td>
                  <td>
                    <span className={`badge ${isSender ? 'badge-danger' : 'badge-success'}`}>
                      {isSender ? 'OUT' : 'IN'}
                    </span>
                  </td>
                  <td>
                    {counterparty ? (
                      <Link href={`/explorer/address/${counterparty}`}>
                        <code>{counterparty.slice(0, 10)}...</code>
                      </Link>
                    ) : (
                      <span className="badge badge-neutral">Contract creation</span>
                    )}
                  </td>
                  <td>{ethers.formatEther(tx.value)}</td>
                </tr>
              );
            })}
            {recentTxs.length === 0 && (
              <tr>
                <td colSpan={5} className="empty-row">
                  No activity in the last {RECENT_BLOCKS_WINDOW} blocks.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
