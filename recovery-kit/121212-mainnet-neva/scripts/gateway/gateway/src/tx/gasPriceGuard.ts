import { Request, Response, NextFunction } from 'express';

// ── Minimal RLP helpers ──────────────────────────────────────────────────────

function rlpSkip(buf: Buffer, offset: number): number {
  const b = buf[offset];
  if (b <= 0x7f) return offset + 1;
  if (b <= 0xb7) return offset + 1 + (b - 0x80);
  if (b <= 0xbf) {
    const ll = b - 0xb7;
    const len = parseInt(buf.subarray(offset + 1, offset + 1 + ll).toString('hex'), 16);
    return offset + 1 + ll + len;
  }
  if (b <= 0xf7) return offset + 1 + (b - 0xc0);
  const ll = b - 0xf7;
  const len = parseInt(buf.subarray(offset + 1, offset + 1 + ll).toString('hex'), 16);
  return offset + 1 + ll + len;
}

function rlpReadBytes(buf: Buffer, offset: number): Buffer {
  const b = buf[offset];
  if (b <= 0x7f) return buf.subarray(offset, offset + 1);
  if (b <= 0xb7) return buf.subarray(offset + 1, offset + 1 + (b - 0x80));
  if (b <= 0xbf) {
    const ll = b - 0xb7;
    const len = parseInt(buf.subarray(offset + 1, offset + 1 + ll).toString('hex'), 16);
    return buf.subarray(offset + 1 + ll, offset + 1 + ll + len);
  }
  return Buffer.alloc(0);
}

function listContentStart(buf: Buffer, offset: number): number {
  const b = buf[offset];
  if (b <= 0xf7) return offset + 1;
  return offset + 1 + (b - 0xf7);
}

function bufToBigInt(b: Buffer): bigint {
  return b.length === 0 ? 0n : BigInt('0x' + b.toString('hex'));
}

// ── Gas price extraction ─────────────────────────────────────────────────────

/**
 * Extracts effective gas price from a raw signed Ethereum transaction.
 *
 * Supports:
 *   - Legacy (type 0): RLP([nonce, gasPrice, gasLimit, to, value, data, v, r, s])
 *   - EIP-2930 (type 1): 0x01 || RLP([chainId, nonce, gasPrice, ...])
 *   - EIP-1559 (type 2): 0x02 || RLP([chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, ...])
 *
 * Returns 0n on any decode error — safe default (allow TX through if unreadable).
 * For EIP-1559, returns maxFeePerGas (the ceiling price the sender is willing to pay).
 */
export function extractGasPrice(rawTx: string): bigint {
  try {
    const hex = rawTx.startsWith('0x') ? rawTx.slice(2) : rawTx;
    if (hex.length < 20) return 0n;
    const buf = Buffer.from(hex, 'hex');

    let txType = 0;
    let listOffset = 0;

    if (buf[0] < 0xc0) {
      txType = buf[0];
      listOffset = 1;
    }

    let pos = listContentStart(buf, listOffset);

    if (txType >= 1) pos = rlpSkip(buf, pos); // skip chainId
    pos = rlpSkip(buf, pos);                   // skip nonce

    if (txType === 2) {
      pos = rlpSkip(buf, pos);                 // skip maxPriorityFeePerGas
      return bufToBigInt(rlpReadBytes(buf, pos)); // maxFeePerGas
    }
    return bufToBigInt(rlpReadBytes(buf, pos)); // gasPrice (type 0 and 1)
  } catch {
    return 0n;
  }
}

// ── Middleware ───────────────────────────────────────────────────────────────

function rejectResponse(id: unknown, message: string) {
  return {
    jsonrpc: '2.0',
    error: { code: -32000, message },
    id: id ?? null,
  };
}

function checkSingle(parsed: { method?: string; params?: unknown[]; id?: unknown }): object | null {
  if (parsed.method !== 'eth_sendRawTransaction') return null;
  const rawTx = parsed.params?.[0];
  if (typeof rawTx !== 'string') return null;

  const gasPrice = extractGasPrice(rawTx);
  if (gasPrice > 0n) {
    return rejectResponse(
      parsed.id,
      `Transaction rejected: gasPrice must be 0 on this network (gas-free chain). Got ${gasPrice.toString()} wei.`,
    );
  }
  return null;
}

/**
 * Express middleware: rejects eth_sendRawTransaction calls where gasPrice > 0.
 * Handles both single requests and JSON-RPC batch arrays.
 * Fails open — if the body cannot be parsed, the request is forwarded unchanged.
 */
export function gasPriceGuard(req: Request, res: Response, next: NextFunction): void {
  const body = (req as Request & { body?: Buffer }).body;
  if (!body || !body.length) { next(); return; }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString());
  } catch {
    next(); return;
  }

  if (Array.isArray(parsed)) {
    const errors: object[] = [];
    for (const item of parsed) {
      const err = checkSingle(item as { method?: string; params?: unknown[]; id?: unknown });
      if (err) errors.push(err);
    }
    if (errors.length > 0) {
      res.status(400).json(errors.length === 1 ? errors[0] : errors);
      return;
    }
  } else if (parsed && typeof parsed === 'object') {
    const err = checkSingle(parsed as { method?: string; params?: unknown[]; id?: unknown });
    if (err) {
      res.status(400).json(err);
      return;
    }
  }

  next();
}
