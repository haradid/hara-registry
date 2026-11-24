#!/bin/bash
# =============================================================================
# FULL CHAIN RESET — dijalankan tiap 3 bulan via cron (lihat install_cron.sh).
#
# Topologi 2-host (sejak load-splitting 2026-09-10): validator1+validator2 ada di
# Host A (tempat script ini jalan), validator3 ada di Host B (<TESTNET_HOSTB_IP>).
# Reset HARUS simultan di kedua host — kalau tidak, salah satu validator akan
# start dari genesis block 0 sementara yang lain masih di block lama, dan Besu
# QBFT tidak bisa capai konsensus dari state yang tidak konsisten (pola persis
# insiden bootstrap 2026-08-26). Koordinasi ke Host B lewat SSH key khusus
# (`keys/automation/hara-quarterly-reset-key`, forced-command di Host B — HANYA
# bisa menjalankan stop|wipe|start|status, tidak ada akses shell bebas) yang
# memanggil `scripts/validator3_reset_remote.sh` di sana.
#
# PRE-FLIGHT WAJIB: script ABORT sebelum menyentuh apa pun kalau Host B tidak
# terjangkau — reset SEBAGIAN (Host A saja) justru menciptakan masalah
# inkonsistensi konsensus yang sama seperti tidak dikoordinasikan sama sekali.
#
# INI DESTRUKTIF: seluruh data chain (blok, tx, state, kontrak yang sudah
# di-deploy) di ./validator{1,2}/data (Host A) DAN validator3/data (Host B)
# DIHAPUS dan node di-restart dari genesis block 0. Ini keputusan yang
# disengaja (dikonfirmasi user) karena disk server testnet ini terbatas dan
# chain ini murni untuk keperluan testing, bukan produksi. Kalau ada
# demo/testing penting dalam 3 bulan ke depan, tunda cron ini dulu
# (crontab -e) atau backup manual sebelum tanggal reset.
#
# YANG DIPERTAHANKAN (tidak ikut kehapus):
#   - keys/nodekey1, nodekey2, faucet_key (Host A) & nodekey3 (Host B) ->
#     identitas validator tetap sama setelah reset
#   - config/genesis.json di semua node -> genesis yang sama dipakai lagi
#     setelah reset (chain ID & validator set konsisten)
#   - logs/cleanup_history.log       -> riwayat reset (di luar data node manapun)
#
# YANG DIHAPUS:
#   - {validator1,validator2}/data/* (Host A) & validator3/data/* (Host B)
#   - docker image/container/build-cache menganggur di Host A (docker system
#     prune) — Host B TIDAK ikut di-prune, di luar scope phase remote yang ada
# =============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_FILE="$ROOT_DIR/logs/cleanup_history.log"
NODES="validator1 validator2"

HOSTB_IP="<TESTNET_HOSTB_IP>"
HOSTB_KEY="$ROOT_DIR/keys/automation/hara-quarterly-reset-key"
HOSTB_SSH="ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -i $HOSTB_KEY root@$HOSTB_IP"

mkdir -p "$ROOT_DIR/logs"

ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
log() { echo "[$(ts)] $*" | tee -a "$LOG_FILE"; }

hostb_phase() {
  local phase="$1"
  local out
  if ! out=$($HOSTB_SSH "$phase" 2>&1); then
    log "ABORT: Host B phase '$phase' gagal: $out"
    exit 1
  fi
  log "Host B ($phase): $out"
}

log "===== Cleanup run start ====="

for NODE in $NODES; do
  if [ ! -f "$ROOT_DIR/keys/nodekey1" ]; then
    log "ABORT: keys/ tidak lengkap — refuse to reset tanpa identitas validator yang aman."
    exit 1
  fi
done

log "Pre-flight: cek Host B (validator3) terjangkau sebelum menyentuh apa pun di Host A..."
if ! $HOSTB_SSH status >/dev/null 2>&1; then
  log "ABORT: Host B tidak terjangkau lewat SSH key otomasi — reset DIBATALKAN seluruhnya."
  log "         Reset sebagian (Host A saja) akan membuat validator3 tertinggal di block"
  log "         lama dan chain gagal capai konsensus. Perbaiki akses Host B dulu, baru"
  log "         jalankan ulang script ini manual."
  exit 1
fi
log "Pre-flight OK: Host B terjangkau."

BLOCK_BEFORE=$(curl -s -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  http://127.0.0.1:5797 2>/dev/null | grep -oE '"result":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
DISK_BEFORE=$(df -h / | awk 'NR==2{print $3"/"$2" ("$5" used)"}')
log "Block height before reset (Host A): $BLOCK_BEFORE"
log "Disk usage before reset (Host A):   $DISK_BEFORE"

log "Stopping validator1+validator2 (Host A) dan validator3 (Host B) — near-simultan..."
hostb_phase stop
for NODE in $NODES; do
  (cd "$ROOT_DIR/$NODE" && docker compose stop besu)
done

log "Wiping data/ di semua node (keys/ dan config/ tidak disentuh)..."
hostb_phase wipe
for NODE in $NODES; do
  find "$ROOT_DIR/$NODE/data" -mindepth 1 -not -name '.gitkeep' -exec rm -rf {} + 2>/dev/null || true
done

log "Pruning unused docker images/containers/build cache di Host A (volumes NOT pruned)..."
docker system prune -af || true

log "Starting validator1+validator2 (Host A) dan validator3 (Host B) dari fresh genesis — near-simultan..."
hostb_phase start
for NODE in $NODES; do
  (cd "$ROOT_DIR/$NODE" && docker compose up -d besu)
done

log "Waiting for validator1's RPC to come up and block height to advance..."
for i in $(seq 1 30); do
  if curl -s -X POST -H "Content-Type: application/json" \
      --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
      http://127.0.0.1:5797 >/dev/null 2>&1; then
    break
  fi
  sleep 5
done

BLOCK_AFTER=$(curl -s -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  http://127.0.0.1:5797 2>/dev/null | grep -oE '"result":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
DISK_AFTER=$(df -h / | awk 'NR==2{print $3"/"$2" ("$5" used)"}')
log "Block height after reset (Host A): $BLOCK_AFTER (expect 0x0 lalu naik lagi tiap ~5 detik)"
log "Disk usage after reset (Host A):   $DISK_AFTER"

log "Waiting for Host B (validator3) RPC to come up and block height to advance..."
for i in $(seq 1 30); do
  if $HOSTB_SSH status 2>/dev/null | grep -q '"result"'; then
    break
  fi
  sleep 5
done
HOSTB_BLOCK_AFTER=$($HOSTB_SSH status 2>/dev/null | grep -oE '"result":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
log "Block height after reset (Host B): $HOSTB_BLOCK_AFTER (expect naik bareng Host A, bukan 0x0 terus)"

log "===== Cleanup run end ====="
echo ""
