import Link from 'next/link';
import { ethers } from 'ethers';
import { getExplorerProvider } from '@/lib/explorerRpc';

export default async function TxDetailPage({ params }: { params: { hash: string } }) {
  const provider = getExplorerProvider();
  const [tx, receipt] = await Promise.all([
    provider.getTransaction(params.hash),
    provider.getTransactionReceipt(params.hash),
  ]);

  if (!tx) {
    return (
      <div className="page">
        <h1 className="page-title">Transaction not found</h1>
        <p className="page-subtitle">
          <code>{params.hash}</code> was not found — wrong hash, or it hasn&apos;t been broadcast
          to this node. <Link href="/explorer">Back to explorer</Link>.
        </p>
      </div>
    );
  }

  const statusLabel = receipt === null ? 'Pending' : receipt.status === 1 ? 'Success' : 'Failed';
  const statusClass = receipt === null ? 'badge-neutral' : receipt.status === 1 ? 'badge-success' : 'badge-danger';

  return (
    <div className="page">
      <p style={{ marginBottom: '0.5rem' }}>
        <Link href="/explorer">&larr; Back to explorer</Link>
      </p>
      <h1 className="page-title">Transaction</h1>

      <div className="card">
        <dl className="kv-grid">
          <dt>Hash</dt>
          <dd>
            <code>{tx.hash}</code>
          </dd>
          <dt>Status</dt>
          <dd>
            <span className={`badge ${statusClass}`}>{statusLabel}</span>
          </dd>
          <dt>Block</dt>
          <dd>
            {tx.blockNumber !== null ? (
              <Link href={`/explorer/block/${tx.blockNumber}`}>{tx.blockNumber}</Link>
            ) : (
              '-'
            )}
          </dd>
          <dt>From</dt>
          <dd>
            <Link href={`/explorer/address/${tx.from}`}>
              <code>{tx.from}</code>
            </Link>
          </dd>
          <dt>To</dt>
          <dd>
            {tx.to ? (
              <Link href={`/explorer/address/${tx.to}`}>
                <code>{tx.to}</code>
              </Link>
            ) : receipt?.contractAddress ? (
              <>
                <span className="badge badge-neutral">Contract creation</span>{' '}
                <Link href={`/explorer/address/${receipt.contractAddress}`}>
                  <code>{receipt.contractAddress}</code>
                </Link>
              </>
            ) : (
              <span className="badge badge-neutral">Contract creation</span>
            )}
          </dd>
          <dt>Value</dt>
          <dd>{ethers.formatEther(tx.value)} native</dd>
          <dt>Nonce</dt>
          <dd>{tx.nonce}</dd>
          <dt>Gas limit</dt>
          <dd>{tx.gasLimit.toString()}</dd>
          <dt>Gas used</dt>
          <dd>{receipt ? receipt.gasUsed.toString() : '-'}</dd>
          <dt>Gas price</dt>
          <dd>{tx.gasPrice !== null ? `${tx.gasPrice.toString()} wei` : '-'}</dd>
          <dt>Input data</dt>
          <dd>
            {tx.data === '0x' ? (
              <span className="muted">none</span>
            ) : (
              <code style={{ wordBreak: 'break-all' }}>
                {tx.data.length > 138 ? `${tx.data.slice(0, 138)}... (${tx.data.length} chars)` : tx.data}
              </code>
            )}
          </dd>
        </dl>
      </div>
    </div>
  );
}
