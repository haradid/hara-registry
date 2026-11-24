#!/bin/bash
# Install cron entry untuk cleanup_quarterly_reset.sh — jalan tiap 3 bulan
# (tanggal 1, jam 03:00 UTC, bulan Januari/April/Juli/Oktober).
# JANGAN dijalankan sebelum server testnet siap dan 03_first_deploy.sh sudah sukses.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLEANUP_SCRIPT="$SCRIPT_DIR/cleanup_quarterly_reset.sh"
CRON_LINE="0 3 1 1,4,7,10 * $CLEANUP_SCRIPT >> $SCRIPT_DIR/../logs/cron.log 2>&1"

chmod +x "$CLEANUP_SCRIPT"

if crontab -l 2>/dev/null | grep -qF "$CLEANUP_SCRIPT"; then
  echo "Cron entry sudah ada, tidak ditambahkan lagi:"
  crontab -l | grep -F "$CLEANUP_SCRIPT"
else
  (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
  echo "Cron entry ditambahkan:"
  echo "  $CRON_LINE"
fi

echo ""
echo "Cek jadwal: crontab -l"
echo "Untuk menunda/skip 1 siklus (misal ada demo penting): crontab -e lalu comment baris ini."
