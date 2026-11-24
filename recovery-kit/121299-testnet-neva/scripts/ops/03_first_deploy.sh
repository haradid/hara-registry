#!/bin/bash
# First-time deploy — 3 validator + 1 rpc, semua di server yang sama.
# JANGAN dijalankan sebelum:
#   1. Server testnet sudah diprovision dan diakses via SSH
#   2. 01_generate_node_key.sh dan 02_derive_address_and_genesis.sh sudah dijalankan DI SERVER
#   3. .env sudah dicopy dari .env.example DI SETIAP node (validator1/2/3, rpc1) dan diisi
#      P2P_HOST = IP publik server (sama untuk semua node)
#   4. rpc1/config/config.toml host-allowlist sudah diisi IP publik server (bukan placeholder)
#   5. Firewall/NSG server sudah dibuka untuk port 30303-30306 (p2p 4 node), dan HANYA IP
#      tepercaya untuk 5797/5798 (RPC) serta 9545-9548 (metrics) — jangan expose RPC ke
#      publik tanpa alasan.
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

for NODE in validator1 validator2 validator3 rpc1; do
  if [ ! -f "$ROOT_DIR/$NODE/.env" ]; then
    echo "ERROR: $NODE/.env belum ada. cp $NODE/.env.example $NODE/.env lalu isi dulu."
    exit 1
  fi
  if [ ! -f "$ROOT_DIR/$NODE/config/genesis.json" ]; then
    echo "ERROR: $NODE/config/genesis.json belum ada. Jalankan scripts/02_derive_address_and_genesis.sh dulu."
    exit 1
  fi
done
if [ ! -f "$ROOT_DIR/keys/nodekey1" ]; then
  echo "ERROR: keys/nodekey1 belum ada. Jalankan scripts/01_generate_node_key.sh dulu."
  exit 1
fi
if grep -q "<TESTNET_SERVER_PUBLIC_IP>" "$ROOT_DIR/rpc1/config/config.toml"; then
  echo "ERROR: rpc1/config/config.toml masih ada placeholder <TESTNET_SERVER_PUBLIC_IP> di host-allowlist. Isi dulu."
  exit 1
fi

for NODE in validator1 validator2 validator3 rpc1; do
  echo "=== docker compose up -d ($NODE) ==="
  (cd "$ROOT_DIR/$NODE" && docker compose up -d)
done

sleep 15
echo ""
echo "=== Status semua node ==="
for NODE in validator1 validator2 validator3 rpc1; do
  echo "--- $NODE ---"
  (cd "$ROOT_DIR/$NODE" && docker compose ps)
done

echo ""
echo "Cek log salah satu: cd rpc1 && docker compose logs -f besu"
echo "Cek block height (dari rpc1, satu-satunya yang expose RPC):"
echo "  curl -s -X POST -H 'Content-Type: application/json' \\"
echo "    --data '{\"jsonrpc\":\"2.0\",\"method\":\"eth_blockNumber\",\"params\":[],\"id\":1}' \\"
echo "    http://127.0.0.1:5797"
