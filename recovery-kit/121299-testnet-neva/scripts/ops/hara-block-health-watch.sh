#!/bin/bash
# =============================================================================
# HARA block-production health watch (log-only early warning, pola sama seperti
# hara-mem-watch.sh).
#
# Ditambahkan 2026-09-22 setelah insiden validator2 (testnet) absen total dari rotasi
# proposing QBFT selama entah berapa lama, dan HANYA ketahuan dari laporan user, bukan
# alert otomatis. Watchdog ini mendeteksi dini 2 gejala yang sama:
#   1. Ada validator yang seharusnya ikut round-robin tapi tidak muncul sebagai `miner`
#      sama sekali dalam N block terakhir.
#   2. Rata-rata block time N block terakhir melebihi ambang (indikasi round-change
#      berulang, meski penyebabnya belum tentu #1).
#
# Deteksi dini di sini penting khususnya karena `bonsai-limit-trie-logs-enabled=true`
# (baik testnet maupun mainnet, demi kontrol biaya storage) membatasi window SNAP-sync
# ke `bonsai-historical-block-limit` block (512) — kalau sebuah node terlanjur
# tertinggal LEBIH dari itu sebelum ketahuan, SNAP sync jadi permanen gagal dan butuh
# intervensi manual (ganti sync-mode=FULL sementara, seperti fix testnet 2026-09-22).
# Watchdog ini dimaksudkan supaya masalah ketahuan JAUH sebelum lewat batas itu.
# =============================================================================
set -uo pipefail

RPC_URL="${1:?Usage: hara-block-health-watch.sh <rpc_url> <comma-separated-validator-addresses> <log_file>}"
EXPECTED_VALIDATORS="${2:?Usage: hara-block-health-watch.sh <rpc_url> <comma-separated-validator-addresses> <log_file>}"
LOG_FILE="${3:?Usage: hara-block-health-watch.sh <rpc_url> <comma-separated-validator-addresses> <log_file>}"

SAMPLE_SIZE=20
BLOCK_PERIOD_SECONDS=5
MAX_AVG_MULTIPLIER=2

ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
log() { echo "[$(ts)] $*" >> "$LOG_FILE"; }

rpc() {
  curl -s --max-time 5 -X POST -H "Content-Type: application/json" --data "$1" "$RPC_URL"
}

LATEST_HEX=$(rpc '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' | grep -oE '"result":"0x[0-9a-f]+"' | cut -d'"' -f4)
if [ -z "$LATEST_HEX" ]; then
  log "WARNING: RPC tidak merespons di $RPC_URL"
  exit 0
fi
LATEST_DEC=$((16#${LATEST_HEX#0x}))

MINERS=""
TIMESTAMPS=()
for i in $(seq 0 $((SAMPLE_SIZE - 1))); do
  BN=$((LATEST_DEC - i))
  if [ "$BN" -lt 0 ]; then
    break
  fi
  HEX=$(printf "0x%x" "$BN")
  BLOCK=$(rpc "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getBlockByNumber\",\"params\":[\"$HEX\",false],\"id\":1}")
  MINER=$(echo "$BLOCK" | grep -oE '"miner":"[^"]*"' | cut -d'"' -f4)
  TS=$(echo "$BLOCK" | grep -oE '"timestamp":"[^"]*"' | cut -d'"' -f4)
  # Blok bisa null kalau backend yang menjawab query ini belum menerima blok itu lewat
  # gossip (khususnya lewat gateway yang failover antar node) — skip saja, jangan
  # dipaksa masuk hitungan (ditemukan sebagai false-positive nyata saat testing script
  # ini 2026-09-22: query ke block tip persis lewat gateway publik sesekali balas null).
  if [ -z "$MINER" ] || [ -z "$TS" ]; then
    continue
  fi
  MINERS="$MINERS $MINER"
  TIMESTAMPS+=($((16#${TS#0x})))
done

IFS=',' read -ra EXPECTED_ARR <<< "$EXPECTED_VALIDATORS"
for addr in "${EXPECTED_ARR[@]}"; do
  if ! echo "$MINERS" | grep -qi "$addr"; then
    log "WARNING: validator $addr TIDAK muncul sebagai miner dalam $SAMPLE_SIZE block terakhir — kemungkinan tidak ikut proposing (cek sync status / OOM / restart loop di node itu SEKARANG, sebelum lewat batas retensi trie log)."
  fi
done

COUNT=${#TIMESTAMPS[@]}
if [ "$COUNT" -ge 2 ]; then
  FIRST=${TIMESTAMPS[0]}
  LAST=${TIMESTAMPS[$((COUNT - 1))]}
  SPAN=$((FIRST - LAST))
  AVG=$((SPAN / (COUNT - 1)))
  THRESHOLD=$((BLOCK_PERIOD_SECONDS * MAX_AVG_MULTIPLIER))
  if [ "$AVG" -gt "$THRESHOLD" ]; then
    log "WARNING: rata-rata block time $SAMPLE_SIZE block terakhir = ${AVG}s, melebihi ambang ${THRESHOLD}s (target ${BLOCK_PERIOD_SECONDS}s)."
  fi
fi
