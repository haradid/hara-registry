#!/bin/bash
# Generate 3 validator keys + 1 rpc-node key + 1 faucet test-account key.
# JALANKAN LANGSUNG DI SERVER TESTNET (bukan di mesin lokal), begitu server tersedia —
# private key sebaiknya lahir di server yang akan memakainya, bukan dibuat lalu dikirim.
#
# Kenapa 3 validator (bukan 1)? Lihat validator1/config/config.toml — hasil debugging
# 2026-08-26: Besu tidak bisa bootstrap chain QBFT baru dengan validator tunggal.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
KEY_DIR="$SCRIPT_DIR/../keys"

mkdir -p "$KEY_DIR"

for NAME in nodekey1 nodekey2 nodekey3 nodekey_rpc1 faucet_key; do
  if [ -f "$KEY_DIR/$NAME" ]; then
    echo "ERROR: $KEY_DIR/$NAME sudah ada. Hapus manual dulu kalau memang mau regenerate"
    echo "       (regenerate validator key akan mengubah genesis -> harus dibuat ulang juga)."
    exit 1
  fi
done

echo "=== Generating validator keys (1-3) + rpc1 key + faucet key ==="
for NAME in nodekey1 nodekey2 nodekey3 nodekey_rpc1 faucet_key; do
  openssl rand -hex 32 > "$KEY_DIR/$NAME"
  chmod 600 "$KEY_DIR/$NAME"
  echo "  -> $KEY_DIR/$NAME"
done

echo ""
echo "PENTING: keys/ tidak pernah ikut ke-reset oleh cleanup_quarterly_reset.sh."
echo "         Backup folder keys/ ke tempat aman (bukan di server yang sama) setelah ini."
echo ""
echo "NEXT: jalankan 02_derive_address_and_genesis.sh"
