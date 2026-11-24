#!/usr/bin/env bash
# manifest-rows.sh — print MANIFEST.md rows for every file copied from dattabot/Blockchain.
# Usage: bash recovery-kit/tools/manifest-rows.sh > /tmp/rows.md
set -euo pipefail
KIT="$(cd "$(dirname "$0")/.." && pwd)"
FLAG='repo-derived — verify before cutover'
NOTE='copied via git archive, CRLF→LF, live host IPs → <…_IP> placeholders'

src_for() {  # $1 = kit-relative path -> prints Blockchain@<branch>:<path>, returns 1 if not a copied file
  local p="$1" mn='121212-mainnet-neva' tn='121299-testnet-neva'
  case "$p" in
    "$mn"/scripts/config/*)                    echo "Blockchain@mainnet-final:mainnet_production/config/${p#"$mn"/scripts/config/}" ;;
    "$mn"/scripts/gateway/*)                   echo "Blockchain@mainnet-final:mainnet_production/gateway/${p#"$mn"/scripts/gateway/}" ;;
    "$mn"/scripts/hara-block-health-watch.sh)  echo "Blockchain@mainnet-final:mainnet_production/scripts/hara-block-health-watch.sh" ;;
    "$mn"/docs-ref/SOURCE-README.md)           echo "Blockchain@mainnet-final:mainnet_production/README.md" ;;
    "$mn"/docs-ref/BACKLOG.md)                 echo "Blockchain@mainnet-final:mainnet_production/BACKLOG.md" ;;
    "$mn"/docs-ref/QA/*)                       echo "Blockchain@mainnet-final:mainnet_production/QA/${p#"$mn"/docs-ref/QA/}" ;;
    "$mn"/docs-ref/*)                          echo "Blockchain@mainnet-final:mainnet_production/docs/${p#"$mn"/docs-ref/}" ;;
    "$tn"/scripts/validator3/*)                echo "Blockchain@testnet-final:tesnet_server/validator3/${p#"$tn"/scripts/validator3/}" ;;
    "$tn"/scripts/gateway/*)                   echo "Blockchain@testnet-final:tesnet_server/gateway/${p#"$tn"/scripts/gateway/}" ;;
    "$tn"/scripts/ops/*)                       echo "Blockchain@testnet-final:tesnet_server/scripts/${p#"$tn"/scripts/ops/}" ;;
    "$tn"/scripts/config/*)                    echo "Blockchain@testnet-final:tesnet_server/config/${p#"$tn"/scripts/config/}" ;;
    "$tn"/host-a-deps/*)                       echo "Blockchain@testnet-final:tesnet_server/${p#"$tn"/host-a-deps/}" ;;
    "$tn"/docs-ref/SOURCE-README.md)           echo "Blockchain@testnet-final:tesnet_server/README.md" ;;
    "$tn"/docs-ref/BACKLOG.md)                 echo "Blockchain@testnet-final:tesnet_server/BACKLOG.md" ;;
    "$tn"/docs-ref/server_access-README.md)    echo "Blockchain@testnet-final:tesnet_server/server_access/README.md" ;;
    "$tn"/docs-ref/CREDENTIALS.txt.example|"$tn"/docs-ref/access.txt.example)
                                               echo "Blockchain@testnet-final:tesnet_server/${p#"$tn"/docs-ref/}" ;;
    "$tn"/docs-ref/QA/*)                       echo "Blockchain@testnet-final:tesnet_server/QA/${p#"$tn"/docs-ref/QA/}" ;;
    "$tn"/docs-ref/*)                          echo "Blockchain@testnet-final:tesnet_server/docs/${p#"$tn"/docs-ref/}" ;;
    *) return 1 ;;
  esac
}

cd "$KIT"
while IFS= read -r -d '' f; do
  rel="${f#./}"
  if src="$(src_for "$rel")"; then
    printf '| `%s` | `%s` | %s | %s |\n' "$rel" "$src" "$NOTE" "$FLAG"
  fi
done < <(find ./121212-mainnet-neva ./121299-testnet-neva -type f \( -path '*/scripts/*' -o -path '*/docs-ref/*' -o -path '*/host-a-deps/*' \) -print0 | sort -z)
