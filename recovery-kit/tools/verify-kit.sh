#!/usr/bin/env bash
# verify-kit.sh — static safety checks for recovery-kit/. Exit 0 = clean, 1 = problems.
# Usage: bash recovery-kit/tools/verify-kit.sh [KIT_DIR]
# Env:   REPO_ROOT          repo root for repo-path checks (default: parent of KIT_DIR)
#        BLOCKCHAIN_MAINNET clone root containing mainnet_production/ (optional)
#        BLOCKCHAIN_TESTNET clone root containing tesnet_server/ (optional)
set -euo pipefail

KIT="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
KIT="$(cd "$KIT" && pwd)"
REPO="${REPO_ROOT:-$(cd "$KIT/.." && pwd)}"
ALLOW="$KIT/tools/secret-scan.allow"
IPALLOW="$KIT/tools/ip-scan.allow"
REQUIRED="$KIT/tools/required-content.txt"
fails=0
err() { echo "FAIL: $*"; fails=$((fails+1)); }

# (1) every shell script parses
while IFS= read -r -d '' f; do
  if ! bash -n "$f" 2>/dev/null; then err "bash -n: ${f#"$KIT"/}"; fi
done < <(find "$KIT" -type f -name '*.sh' -not -path '*/node_modules/*' -print0)

# (2) no CRLF in files that run or are parsed on Linux.
#     Count CRs with tr, NOT grep: Git-for-Windows grep strips CR at EOL when stdout
#     is not a TTY, so `grep $'\r'` silently reports "no CRLF" inside scripts.
while IFS= read -r -d '' f; do
  if [[ "$(tr -dc '\r' < "$f" | wc -c)" -gt 0 ]]; then err "CRLF line endings (breaks on Linux): ${f#"$KIT"/}"; fi
done < <(find "$KIT" -type f \( -name '*.sh' -o -name '*.yml' -o -name '*.yaml' -o -name '*.toml' -o -name '*.example' \) -not -path '*/node_modules/*' -print0)

# (3) no generated env files in the kit (only *.env.example allowed)
while IFS= read -r -d '' f; do
  err "env file in kit (secret risk): ${f#"$KIT"/}"
done < <(find "$KIT" -type f \( -name '.env' -o -name '*.env' \) -print0)

# (4) secret scan
SECRET_RE='0x[0-9a-fA-F]{64}|BEGIN [A-Z ]*PRIVATE KEY|AGE-SECRET-KEY-1|AKIA[0-9A-Z]{16}|(PASSWORD|PASSWD|SECRET|TOKEN|API_KEY|PRIVATE_KEY)[A-Z_]*[[:space:]]*[=:][[:space:]]*"?[A-Za-z0-9+/_@#%!.-]{8,}'
PLACEHOLDER_RE='change-me|CHANGE-ME|<FROM-VAULT:|<FROM-FILE:|<SUPPLY:|<redacted>|\$\{|process\.env|formData'
GENESIS_RE='"(mixHash|balance|extraData|parentHash|coinbase|nonce)"'
allowed=()
if [[ -f "$ALLOW" ]]; then
  while IFS= read -r a; do
    a="${a%%#*}"; a="${a//[[:space:]]/}"
    if [[ -n "$a" ]]; then allowed+=("$a"); fi
  done < "$ALLOW"
fi
while IFS= read -r hit; do
  file="${hit%%:*}"; rest="${hit#*:}"; lineno="${rest%%:*}"; line="${rest#*:}"
  if [[ "$line" =~ $GENESIS_RE ]]; then continue; fi
  clean="$line"
  for a in ${allowed[@]+"${allowed[@]}"}; do clean="${clean//$a/}"; done
  clean="$(printf '%s' "$clean" | sed -E "s/($PLACEHOLDER_RE)[^[:space:]]*//g")"
  if printf '%s' "$clean" | grep -qE "$SECRET_RE"; then
    err "possible secret: ${file#"$KIT"/}:$lineno"
  fi
done < <(grep -rnE "$SECRET_RE" "$KIT" --exclude-dir=node_modules \
           --exclude=verify-kit.sh --exclude=verify-kit.selftest.sh --exclude=secret-scan.allow || true)

# (5) 10.42.0.x only in docker-bridge / stale context (kit-authored docs only)
while IFS= read -r hit; do
  line="${hit#*:}"; line="${line#*:}"
  if ! printf '%s' "$line" | grep -qiE 'stale|bridge|docker|container|superseded'; then
    err "10.42.0.x used as a host address (mesh is 10.43.0.0/24): ${hit%%:*}"
  fi
done < <(grep -rn '10\.42\.0\.' "$KIT" --include='*.md' --include='*.example' \
           --exclude-dir=scripts --exclude-dir=docs-ref --exclude-dir=host-a-deps --exclude-dir=tools || true)

# (6) required content
if [[ -f "$REQUIRED" ]]; then
  while IFS='|' read -r rel re; do
    if [[ -z "$rel" || "$rel" == \#* ]]; then continue; fi
    if [[ ! -f "$KIT/$rel" ]]; then err "required file missing: $rel"; continue; fi
    if ! grep -qE -- "$re" "$KIT/$rel"; then err "required content /$re/ not found in $rel"; fi
  done < "$REQUIRED"
fi

# (7) manifest paths exist
for m in "$KIT/MANIFEST.md" "$KIT/131216-ledger/scripts-manifest.md"; do
  if [[ ! -f "$m" ]]; then continue; fi
  while IFS= read -r p; do
    if [[ ! -e "$REPO/$p" ]]; then err "missing repo path in ${m#"$KIT"/}: $p"; fi
  done < <(grep -oE '`(deploy|ops|chain|services|console|api-console|contracts|doc|recovery-kit)/[^`[:space:]]+`' "$m" | tr -d '`' | sort -u)
  while IFS= read -r ref; do
    br="${ref%%:*}"; p="${ref#*:}"; root=""
    case "$br" in
      Blockchain@mainnet-final) root="${BLOCKCHAIN_MAINNET:-}" ;;
      Blockchain@testnet-final) root="${BLOCKCHAIN_TESTNET:-}" ;;
    esac
    if [[ -z "$root" ]]; then continue; fi
    if [[ ! -e "$root/$p" ]]; then err "missing Blockchain source in ${m#"$KIT"/}: $ref"; fi
  done < <(grep -oE '`Blockchain@(mainnet|testnet)-final:[^`[:space:]]+`' "$m" | tr -d '`' | sort -u)
done

# (8) every kit file is listed in MANIFEST.md (enforced once MANIFEST.md exists)
if [[ -f "$KIT/MANIFEST.md" ]]; then
  while IFS= read -r -d '' f; do
    rel="${f#"$KIT"/}"
    if ! grep -qF "\`$rel\`" "$KIT/MANIFEST.md"; then err "not listed in MANIFEST.md: $rel"; fi
  done < <(find "$KIT" -type f -not -path "$KIT/tools/*" -not -name 'MANIFEST.md' -print0)
fi

# (9) no public IPv4 literal anywhere in the kit (the repo is mirrored publicly).
#     Private/loopback/unspecified ranges pass; anything else must be in tools/ip-scan.allow
#     (reserved for already-public, decommissioned old-chain hosts). Live hosts use <X_IP> placeholders.
IP_RE='\b([0-9]{1,3}\.){3}[0-9]{1,3}\b'
PRIVATE_IP_RE='^(10\.|127\.|0\.0\.0\.0$|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|169\.254\.|255\.|224\.)'
ipallowed=()
if [[ -f "$IPALLOW" ]]; then
  while IFS= read -r a; do
    a="${a%%#*}"; a="${a//[[:space:]]/}"
    if [[ -n "$a" ]]; then ipallowed+=("$a"); fi
  done < "$IPALLOW"
fi
while IFS= read -r hit; do
  file="${hit%%:*}"; ip="${hit##*:}"
  if [[ "$ip" =~ $PRIVATE_IP_RE ]]; then continue; fi
  ok=0
  for a in ${ipallowed[@]+"${ipallowed[@]}"}; do if [[ "$a" == "$ip" ]]; then ok=1; break; fi; done
  if [[ "$ok" -eq 0 ]]; then err "public IP literal (use a <…_IP> placeholder or tools/ip-scan.allow): ${file#"$KIT"/}: $ip"; fi
done < <(grep -rnoE "$IP_RE" "$KIT" --exclude-dir=node_modules --exclude-dir=tools | sort -u || true)

if [[ "$fails" -eq 0 ]]; then echo "verify-kit: OK"; exit 0; fi
echo "verify-kit: $fails problem(s)"; exit 1
