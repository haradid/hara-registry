import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

/**
 * Routes each request to one of 3 upstream pools:
 *   - write  (rpc_frontend :5797, HAProxy primary rpc1, rpc2 only as backup)
 *   - call   (call_frontend :5799, dedicated read node)
 *   - archive (archive_frontend :5800, FOREST node via nginx rate-limiter)
 *
 * Transaction-lifecycle reads (receipt, tx-by-hash, latest/pending nonce) go to
 * the write pool when the whole request is made of them: the call node can fall
 * behind the chain under load (block imports up to ~29s seen 2026-10-08), so
 * reading them there returns stale receipts/nonces right after a send, while the
 * node that accepted the tx always has them. Any heavier method in the same batch
 * keeps the request on call so estimateGas/eth_call load never lands on the
 * single write node.
 *
 * write1/write2/call all run BONSAI with bonsai-historical-block-limit=512 —
 * only state-trie queries (balance/storage/code/call/txcount AT an explicit
 * historical block) are affected by that pruning. Block/receipt/log data is
 * NOT part of the world-state trie and is retained in full on every node
 * regardless of block age — so eth_getLogs, eth_getBlockByNumber,
 * eth_getTransactionByHash/Receipt etc. are deliberately NOT routed to
 * archive here; they work fine on call/write for any block.
 */

export type RpcTarget = 'write' | 'call' | 'archive';

const WRITE_METHODS = new Set(['eth_sendRawTransaction']);
const TX_LIFECYCLE_METHODS = new Set(['eth_getTransactionReceipt', 'eth_getTransactionByHash']);
const ARCHIVE_ONLY_PREFIXES = ['debug_', 'trace_'];

// State-trie methods where a block older than the retained trie-log window
// can miss on call/write and needs an archive fallback. Value = index of the
// block-tag argument in `params`.
const BLOCKTAG_PARAM_INDEX: Record<string, number> = {
  eth_call: 1,
  eth_getBalance: 1,
  eth_getCode: 1,
  eth_getStorageAt: 2,
  eth_getTransactionCount: 1,
};

const LATEST_TAGS = new Set(['latest', 'pending', 'safe', 'finalized', undefined, null]);

function targetUrl(target: RpcTarget): string {
  switch (target) {
    case 'write':
      return `http://${config.haproxyHost}:${config.haproxyWriteHttpPort}`;
    case 'call':
      return `http://${config.haproxyHost}:${config.haproxyCallHttpPort}`;
    case 'archive':
      return `http://${config.haproxyHost}:${config.haproxyArchiveHttpPort}`;
  }
}

function classifyMethod(method: string | undefined): 'write' | 'archive' | 'call' | 'maybeArchive' | 'lifecycle' {
  if (!method) return 'call';
  if (WRITE_METHODS.has(method)) return 'write';
  if (TX_LIFECYCLE_METHODS.has(method)) return 'lifecycle';
  if (ARCHIVE_ONLY_PREFIXES.some((p) => method.startsWith(p))) return 'archive';
  if (method in BLOCKTAG_PARAM_INDEX) return 'maybeArchive';
  return 'call';
}

function hasHistoricalBlockTag(method: string, params: unknown[] | undefined): boolean {
  const idx = BLOCKTAG_PARAM_INDEX[method];
  if (idx === undefined || !params) return false;
  const tag = params[idx];
  if (typeof tag !== 'string') return false;
  return !LATEST_TAGS.has(tag);
}

interface RpcItem { method?: string; params?: unknown[]; id?: unknown }

/**
 * Decides the upstream target for a JSON-RPC request (single or batch) and
 * stashes it on req.rpcTarget for httpProxy's router to read.
 *
 * Batch policy: if ANY item in the batch needs archive, the WHOLE batch goes
 * to archive (HTTP proxying sends one body to one target — can't split a
 * batch across upstreams). Simpler than splitting, at the cost of dragging
 * unrelated live items along when one item is historical.
 */
export function archiveRouter(req: Request, res: Response, next: NextFunction): void {
  const body = (req as Request & { body?: Buffer }).body;
  if (!body?.length) {
    (req as Request & { rpcTarget?: RpcTarget }).rpcTarget = 'call';
    next();
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString());
  } catch {
    (req as Request & { rpcTarget?: RpcTarget }).rpcTarget = 'call';
    next();
    return;
  }

  const items: RpcItem[] = Array.isArray(parsed) ? parsed : [parsed as RpcItem];

  let target: RpcTarget = 'call';
  let anyWrite = false;
  let anyArchive = false;
  let lifecycleOnly = items.length > 0;

  for (const item of items) {
    const cls = classifyMethod(item.method);
    if (cls === 'write') anyWrite = true;
    if (cls === 'archive') anyArchive = true;
    const historical =
      cls === 'maybeArchive' && hasHistoricalBlockTag(item.method as string, item.params);
    if (historical) anyArchive = true;

    const isLifecycle =
      cls === 'lifecycle' || (item.method === 'eth_getTransactionCount' && !historical);
    if (!isLifecycle) lifecycleOnly = false;
  }

  // A batch mixing writes with archive-bound reads shouldn't happen in
  // practice (clients don't usually bundle eth_sendRawTransaction with
  // debug_traceTransaction) — if it does, archive wins since it's the
  // narrower/safer pool and write methods aren't state-trie-limited anyway.
  if (anyArchive) target = 'archive';
  else if (anyWrite || lifecycleOnly) target = 'write';
  else target = 'call';

  (req as Request & { rpcTarget?: RpcTarget }).rpcTarget = target;
  next();
}

export { targetUrl };
