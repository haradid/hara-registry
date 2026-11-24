import http from 'http';
import { config } from '../config';

// Background health-check that decides which HTTP RPC backend httpProxy.ts should use.
// Primary = validator1 (the long-standing single backend). Secondary = validator3, which
// now also serves RPC (see docs/CHANGELOG.md 2026-09-15) purely as a same-host failover so
// a validator1 restart/OOM doesn't 502 every request until it comes back.
//
// 2 consecutive failures (~10s) before failing over, 2 consecutive successes before
// failing back — avoids flapping on a single dropped health-check.

export const PRIMARY_TARGET = `http://${config.haproxyHost}:${config.haproxyHttpPort}`;
export const SECONDARY_TARGET = `http://${config.secondaryRpcHost}:${config.secondaryRpcHttpPort}`;

const CHECK_INTERVAL_MS = 5000;
const CHECK_TIMEOUT_MS = 2500;
const FAILS_TO_TRIP = 2;
const SUCCESSES_TO_RESTORE = 2;

let usingSecondary = false;
let consecutiveFailures = 0;
let consecutiveSuccesses = 0;

function checkPrimary(): Promise<boolean> {
  return new Promise((resolve) => {
    const body = JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 0 });
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    const req = http.request(
      PRIMARY_TARGET,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          Host: config.upstreamHostHeader,
        },
        timeout: CHECK_TIMEOUT_MS,
      },
      (res) => {
        res.resume();
        done(res.statusCode === 200);
      },
    );
    req.on('error', () => done(false));
    req.on('timeout', () => {
      req.destroy();
      done(false);
    });
    req.write(body);
    req.end();
  });
}

async function tick(): Promise<void> {
  const ok = await checkPrimary();
  if (ok) {
    consecutiveFailures = 0;
    consecutiveSuccesses += 1;
    if (usingSecondary && consecutiveSuccesses >= SUCCESSES_TO_RESTORE) {
      usingSecondary = false;
      console.warn(`[rpcHealth] primary RPC recovered (${consecutiveSuccesses} consecutive OK) — switching back to primary`);
    }
  } else {
    consecutiveSuccesses = 0;
    consecutiveFailures += 1;
    if (!usingSecondary && consecutiveFailures >= FAILS_TO_TRIP) {
      usingSecondary = true;
      console.error(`[rpcHealth] primary RPC failed ${consecutiveFailures} consecutive checks — failing over to secondary`);
    }
  }
}

export function startRpcHealthChecks(): void {
  setInterval(() => {
    tick().catch(() => {});
  }, CHECK_INTERVAL_MS);
  tick().catch(() => {});
}

export function currentHttpTarget(): string {
  return usingSecondary ? SECONDARY_TARGET : PRIMARY_TARGET;
}

export function isUsingSecondary(): boolean {
  return usingSecondary;
}
