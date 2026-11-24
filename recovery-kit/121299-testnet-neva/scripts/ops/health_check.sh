#!/bin/bash
# Quick health check: status container LOKAL di host ini, block height (via validator1,
# yang merangkap RPC publik sejak rpc1 di-retire 2026-08-28), peer count, disk usage, memory.
# Jalankan dari mana saja di dalam tesnet_server/.
#
# ⚠️ Topologi 2-host sejak 2026-09-10: script ini cuma mengecek node yang ada di ROOT_DIR
# yang sama tempat script ini dijalankan (validator1+validator2, kalau dijalankan dari
# Host A). `validator3` ada di Host B (<TESTNET_HOSTB_IP>) dan TIDAK ikut tercek dari sini —
# jalankan script yang sama di Host B (di /root/tesnet_server/) untuk mengecek validator3.
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Container status (node lokal di host ini) ==="
for NODE in validator1 validator2; do
  echo "--- $NODE ---"
  (cd "$ROOT_DIR/$NODE" && docker compose ps 2>/dev/null) || echo "  (belum di-deploy)"
done
echo "--- validator3 (Host B, TIDAK tercek dari sini) ---"
echo "  jalankan script ini di Host B untuk mengecek validator3"

echo ""
echo "=== Block height (via validator1, RPC publik) ==="
curl -s -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  http://127.0.0.1:5797 || echo "RPC tidak merespons"

echo ""
echo "=== Peer count validator1 (harus 2 — connect ke validator2/3) ==="
curl -s -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"net_peerCount","params":[],"id":1}' \
  http://127.0.0.1:5797 || true

echo ""
echo "=== QBFT validators (harus 3 alamat) ==="
curl -s -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"qbft_getValidatorsByBlockNumber","params":["latest"],"id":1}' \
  http://127.0.0.1:5797 || true

echo ""
echo "=== Disk usage ==="
df -h / 2>/dev/null || true
for NODE in validator1 validator2; do
  du -sh "$ROOT_DIR/$NODE/data" 2>/dev/null || true
done

echo ""
echo "=== Memory (proses Besu lokal di host ini — pantau ini) ==="
free -h 2>/dev/null || true
