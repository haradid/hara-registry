#!/usr/bin/env bash
# verify-kit.selftest.sh — proves verify-kit.sh catches every failure class it claims to.
# Fake secrets are generated at runtime so no secret-shaped literal is ever committed.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
V="$HERE/verify-kit.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
pass=0
total=0

mk_clean() {  # $1 = fixture kit dir
  mkdir -p "$1/tools" "$1/x-chain/scripts"
  printf '#!/usr/bin/env bash\nset -euo pipefail\necho ok\n' > "$1/x-chain/scripts/ok.sh"
  printf 'POSTGRES_PASSWORD=change-me-strong-password\nmesh 10.43.0.0/24\n' > "$1/x-chain/README.md"
  : > "$1/tools/required-content.txt"
}

expect() {  # $1 = label, $2 = expected exit (0|1), $3 = fixture kit dir
  total=$((total+1))
  local got
  if REPO_ROOT="$3" bash "$V" "$3" >/dev/null 2>&1; then got=0; else got=1; fi
  if [[ "$got" == "$2" ]]; then
    pass=$((pass+1)); echo "ok   - $1"
  else
    echo "FAIL - $1 (exit $got, want $2)"
  fi
}

d="$TMP/clean";   mk_clean "$d"; expect "clean kit passes" 0 "$d"
d="$TMP/syntax";  mk_clean "$d"; printf 'if then fi\n' > "$d/x-chain/scripts/bad.sh"; expect "bash syntax error caught" 1 "$d"
d="$TMP/crlf";    mk_clean "$d"; printf '#!/usr/bin/env bash\r\necho hi\r\n' > "$d/x-chain/scripts/crlf.sh"; expect "CRLF script caught" 1 "$d"
d="$TMP/envfile"; mk_clean "$d"; printf 'A=b\n' > "$d/x-chain/.env"; expect ".env file in kit caught" 1 "$d"
d="$TMP/hexkey";  mk_clean "$d"; printf 'PRIVATE=%s\n' "$(printf '0x%064d' 7)" > "$d/x-chain/README.md"; expect "64-hex key caught" 1 "$d"
d="$TMP/pw";      mk_clean "$d"; printf 'ADMIN_PASSWORD=%s\n' "$(printf 'S%sValue' 3cr3tLong)" > "$d/x-chain/notes.md"; expect "literal password caught" 1 "$d"
d="$TMP/genesis"; mk_clean "$d"; printf '  "mixHash": "%s",\n' "$(printf '0x%064d' 9)" > "$d/x-chain/genesis.json"; expect "genesis mixHash allowed" 0 "$d"
d="$TMP/allow";   mk_clean "$d"; h="$(printf '0x%064d' 5)"; printf 'tx %s\n' "$h" > "$d/x-chain/log.md"; printf '%s  # public tx hash\n' "$h" > "$d/tools/secret-scan.allow"; expect "allowlisted public hash allowed" 0 "$d"
d="$TMP/ph";      mk_clean "$d"; printf 'VAULT_TOKEN="<FROM-VAULT:secret/haraledger/x>"\n' > "$d/x-chain/notes.md"; expect "placeholder token allowed" 0 "$d"
d="$TMP/mesh";    mk_clean "$d"; printf 'vault at 10.42.0.40\n' > "$d/x-chain/README.md"; expect "bare 10.42 mesh IP caught" 1 "$d"
d="$TMP/meshok";  mk_clean "$d"; printf '10.42.0.0/24 is the per-host docker bridge only\n' > "$d/x-chain/README.md"; expect "10.42 in bridge context allowed" 0 "$d"
d="$TMP/req";     mk_clean "$d"; printf 'x-chain/README.md|quorum\n' > "$d/tools/required-content.txt"; expect "missing required content caught" 1 "$d"
d="$TMP/reqok";   mk_clean "$d"; printf 'x-chain/README.md|10\.43\.0\.0/24|nope\n' > "$d/tools/required-content.txt"; expect "required regex with | alternation passes" 0 "$d"
d="$TMP/mpath";   mk_clean "$d"; printf '| `deploy/ops/does-not-exist.sh` |\n| `x-chain/scripts/ok.sh` |\n| `x-chain/README.md` |\n' > "$d/MANIFEST.md"; expect "missing manifest repo path caught" 1 "$d"
d="$TMP/unlist";  mk_clean "$d"; printf '| `x-chain/README.md` |\n' > "$d/MANIFEST.md"; expect "kit file missing from MANIFEST caught" 1 "$d"
# (9) public IPv4 literals: the repo is mirrored publicly, so live host addresses stay out of the kit.
d="$TMP/pubip";   mk_clean "$d"; printf 'validator3 at 203.0.113.7\n' > "$d/x-chain/README.md"; expect "public IP literal caught" 1 "$d"
d="$TMP/ipallow"; mk_clean "$d"; printf 'old host 203.0.113.7\n' > "$d/x-chain/README.md"; printf '203.0.113.7  # decommissioned old-chain host, already public\n' > "$d/tools/ip-scan.allow"; expect "allowlisted public IP allowed" 0 "$d"
d="$TMP/privip";  mk_clean "$d"; printf 'bind 10.43.0.11, 127.0.0.1, 172.17.0.2, 0.0.0.0, 10-0-182-107.sslip.io and <MAINNET_V3_IP>\n' > "$d/x-chain/README.md"; expect "private/loopback IPs and placeholders allowed" 0 "$d"

d="$TMP/hyphip";  mk_clean "$d"; printf 'archive at 203-0-113-7.sslip.io\n' > "$d/x-chain/README.md"; expect "hyphenated (sslip.io) public IP caught" 1 "$d"
d="$TMP/envlocal"; mk_clean "$d"; printf 'DATABASE_URL=postgres://u:p@h/db\n' > "$d/x-chain/.env.local"; expect ".env.local file in kit caught" 1 "$d"
d="$TMP/sqlpw";    mk_clean "$d"; printf "CREATE ROLE r WITH LOGIN PASSWORD 'Sup3rSecretValue!';\n" > "$d/x-chain/init.sql"; expect "single-quoted SQL password literal caught" 1 "$d"

echo "$pass/$total passed"
[[ "$pass" == "$total" ]]
