import Link from 'next/link';
import { ethers } from 'ethers';
import { getExplorerProvider } from '@/lib/explorerRpc';

export default async function BlockDetailPage({ params }: { params: { number: string } }) {
  const provider = getExplorerProvider();
  const numberOrTag = /^\d+$/.test(params.number) ? Number(params.number) : params.number;
  const block = await provider.getBlock(numberOrTag, true);

  if (!block) {
    return (
      <div className="page">
        <h1 className="page-title">Block not found</h1>
        <p className="page-subtitle">
          Block <code>{params.number}</code> hasn&apos;t been produced yet (or the number is
          invalid). <Link href="/explorer">Back to explorer</Link>.
        </p>
      </div>
    );
  }

  const txs = block.prefetchedTransactions;

  return (
    <div className="page">
      <p style={{ marginBottom: '0.5rem' }}>
        <Link href="/explorer">&larr; Back to explorer</Link>
      </p>
      <h1 className="page-title">Block #{block.number}</h1>

      <div className="card">
        <dl className="kv-grid">
          <dt>Hash</dt>
          <dd>
            <code>{block.hash}</code>
          </dd>
          <dt>Parent hash</dt>
          <dd>
            <Link href={`/explorer/block/${block.number - 1}`}>
              <code>{block.parentHash}</code>
            </Link>
          </dd>
          <dt>Timestamp</dt>
          <dd>{new Date(block.timestamp * 1000).toLocaleString()}</dd>
          <dt>Miner</dt>
          <dd>
            <Link href={`/explorer/address/${block.miner}`}>
              <code>{block.miner}</code>
            </Link>
          </dd>
          <dt>Gas used / limit</dt>
          <dd>
            {block.gasUsed.toString()} / {block.gasLimit.toString()}
          </dd>
          <dt>Transactions</dt>
          <dd>{txs.length}</dd>
        </dl>
      </div>

      <h2 className="section-title">Transactions</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Hash</th>
              <th>From</th>
              <th>To</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {txs.map((tx) => (
              <tr key={tx.hash}>
                <td>
                  <Link href={`/explorer/tx/${tx.hash}`}>
                    <code>{tx.hash.slice(0, 14)}...</code>
                  </Link>
                </td>
                <td>
                  <Link href={`/explorer/address/${tx.from}`}>
                    <code>{tx.from.slice(0, 10)}...</code>
                  </Link>
                </td>
                <td>
                  {tx.to ? (
                    <Link href={`/explorer/address/${tx.to}`}>
                      <code>{tx.to.slice(0, 10)}...</code>
                    </Link>
                  ) : (
                    <span className="badge badge-neutral">Contract creation</span>
                  )}
                </td>
                <td>{ethers.formatEther(tx.value)}</td>
              </tr>
            ))}
            {txs.length === 0 && (
              <tr>
                <td colSpan={4} className="empty-row">
                  No transactions in this block.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
