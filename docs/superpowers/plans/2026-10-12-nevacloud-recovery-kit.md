# NevaCloud Recovery Kit Implementation Plan

> **Public-copy note.** Public IPs of the live `121212` / `121299` hosts and of the partner production boxes are written as `<…_IP>` placeholders here, because this repository is mirrored publicly. The values live in the private Blockchain repo on Azure DevOps (`mainnet_production/docs`, `tesnet_server/docs`) and go into the kit's `hosts.env`, which is never committed.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `recovery-kit/` in the hara-ledger repo — a versioned, secrets-by-reference kit that makes destroying every NevaCloud VPS (chains 131216, 121212, 121299) safe and lets the operator recreate every component, monitoring console, and backup mechanism on fresh VPSes.

**Architecture:** A static-check harness (`recovery-kit/tools/verify-kit.sh`) is built first and acts as the test suite: every later task first appends the facts its document must contain to `tools/required-content.txt` (the failing test), then writes the document or copies the files until the harness passes. 131216 scripts are *referenced* from `deploy/` (single-sourced); 121212/121299 NevaCloud files are *copied* out of the `dattabot/Blockchain` branches with `git archive`, CRLF-normalized, and secret-scanned.

**Tech Stack:** Markdown, Bash (Git Bash on Windows and Linux: `bash`, GNU `grep`/`sed`/`find`/`tar`), `git archive`, optional Docker for gitleaks.

**Spec:** `docs/superpowers/specs/2026-10-12-nevacloud-recovery-kit-design.md` (approved, commit `21cbc67`). Executors read the spec and this plan together.

## Global Constraints

- All work on branch `docs/nevacloud-recovery-kit` in `C:\Projects\claude_projects\hara-ledger`; the deliverable lives at `recovery-kit/` (repo root).
- **Secrets by reference only.** Never copy a secret value into the kit. Reference a Vault path (`secret/haraledger/...`) or a file location. Placeholder tokens are exactly: `<FROM-VAULT:path>`, `<FROM-FILE:path>`, `<SUPPLY:description>`.
- **Never print secret contents** to the terminal or chat while building the kit: do not `cat`/`sed -n`/`head` `ops/secrets.txt`, any `*.env`, `backup.env`, `rclone.conf`, or key files. Inspect scan hits only through the redacting command given in Task 5 Step 4.
- **Source-tagged.** Every kit file appears in `recovery-kit/MANIFEST.md` with its source: a repo path (`deploy/...`), `Blockchain@mainnet-final:<path>`, `Blockchain@testnet-final:<path>`, or `authored`.
- **Verify flag, exact string:** `repo-derived — verify before cutover` (em dash U+2014). Applied to every artifact that could not be confirmed against a live host.
- **131216 scripts are referenced, not copied.** 121212/121299 NevaCloud files are copied.
- **Mesh truth:** `10.43.0.0/24` = WireGuard cross-host mesh. `10.42.0.0/24` = per-host Docker bridge only. `deploy/topology.md` (10.42.x, 6 hosts, "hara-stateless") is **stale**.
- **No live access.** Building the kit never SSHes to any host. Commands *inside* the docs are for the operator to run later.
- Copy sources: Blockchain clone at `/c/Projects/claude_projects/_external/blockchain` (branches `mainnet-final`, `testnet-final`); worktrees `/c/Projects/claude_projects/_external/blockchain-mainnet` and `/c/Projects/claude_projects/_external/blockchain-testnet` are used only for source-path verification.
- Shell scripts: `#!/usr/bin/env bash` + `set -euo pipefail`; env-var defaulting `${VAR:-default}`; no apostrophes inside `${VAR:?msg}` messages; LF line endings.
- **Never detect CR with `grep`** on this machine. Git-for-Windows GNU grep 3.0 strips CR at end of line when stdout is not a TTY, so `grep $'\r'` reports "no CRLF" inside scripts and pipes (verified 2026-10-12). Count CRs with `tr -dc '\r' | wc -c` (or `grep -U`).
- Commits: `git commit -m "<subject>" -m "<body>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`. Never use PowerShell `@'…'@` here-strings from the Bash tool.

## Review Focus

1. **Teardown without migrating the validator set halts two live chains.** Destroying NevaCloud leaves mainnet 121212 with 4 of 7 validators (quorum 5) and testnet 121299 with 2 of 3 (quorum 3). The operator expects the kit to stop them *before* this happens. → Task 2 required-content lines pin the quorum math for both chains plus the add-before-remove procedure.
2. **A real secret lands in git.** This can come from a copied Blockchain doc, from a laptop `deploy/*/.env` (gitignored, real values present on this machine), or from the mainnet gateway faucet private keys. → Task 1 self-test cases (64-hex key, literal password, `.env` file in kit). Tasks 5–6 run the scan on every copied file.
3. **A rebuild follows the stale `10.42.x` mesh / `deploy/topology.md` or the Atlas `10.43.0.20` typo.** → The Task 1 mesh check plus self-test, the Task 3 `LEDGER_MESH_SUBNET=10.43.0.0/24` line, and Task 4 required-content (`topology.md` marked stale, `10.43.0.20` flagged).
4. **Copied scripts carry CRLF** (the Blockchain repo stores CRLF *in its blobs*: 139 CRs in `cleanup_quarterly_reset.sh`). On a fresh host they die with `set: pipefail\r: invalid option`. → The Task 1 CRLF check plus self-test case, and the Task 5/6 normalization steps.
5. **A recreated validator comes up with a fresh node key.** Its address is not in the QBFT set (the testnet hit exactly this keccak-derivation mismatch on 2026-09-11), or the testnet quarterly reset aborts or half-runs because the new Host B lacks the forced-command key. → Task 5 required-content (`keccak256`, `qbft_proposeValidatorVote`) and Task 6 required-content (`hara-quarterly-reset-key`, `validator3_reset_remote.sh`).

---

## File Structure

```
recovery-kit/
├── README.md                          # Task 7 — orientation + how to use the kit
├── 00-PRE-TEARDOWN-EXTRACTION.md      # Task 2 — STOP gate + extraction checklist (load-bearing)
├── secrets-inventory.md               # Task 2 — every secret by reference
├── hosts.env.example                  # Task 3 — sourceable variables for new hosts
├── MANIFEST.md                        # Task 7 — every kit file → source → flag
├── tools/
│   ├── verify-kit.sh                  # Task 1 — static checks (the test suite)
│   ├── verify-kit.selftest.sh         # Task 1 — proves each check fires
│   ├── manifest-rows.sh               # Task 7 — prints MANIFEST rows for copied files
│   ├── required-content.txt           # Task 1 (empty) → each task appends its assertions
│   └── secret-scan.allow              # Task 1 — reviewed public 64-hex values
├── 131216-ledger/                     # Task 4 — references deploy/, copies nothing
│   ├── README.md  recreate.md  monitoring.md  backup-restore.md  scripts-manifest.md
├── 121212-mainnet-neva/               # Task 5
│   ├── README.md  recreate.md
│   ├── scripts/{config/,gateway/,hara-block-health-watch.sh}
│   └── docs-ref/{ARCHITECTURE.md,RUNBOOK_…,STATUS_…,PANDUAN_…,diagrams/,BACKLOG.md,SOURCE-README.md,QA/}
└── 121299-testnet-neva/               # Task 6
    ├── README.md  recreate.md
    ├── scripts/{validator3/,gateway/,ops/*.sh,config/genesis.json.template}
    ├── host-a-deps/{caddy/,netstats/}   # AWS Host A pieces Host B depends on
    └── docs-ref/{ARCHITECTURE.md,CHANGELOG.md,CLEANUP_POLICY.md,DOMAIN_AND_PORTS.md,GATEWAY_FEATURES.md,SETUP_GUIDE.md,BACKLOG.md,SOURCE-README.md,server_access-README.md,*.txt.example,QA/}
```

Responsibilities: `tools/` = verification only, never content. Each chain dir is self-contained for that chain. Root docs are cross-chain.

---

### Task 1: Verification harness (the kit's test suite)

**Files:**
- Create: `recovery-kit/tools/verify-kit.sh`
- Create: `recovery-kit/tools/verify-kit.selftest.sh`
- Create: `recovery-kit/tools/required-content.txt`
- Create: `recovery-kit/tools/secret-scan.allow`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `recovery-kit/tools/verify-kit.sh [KIT_DIR]`. It exits `0` when clean and `1` otherwise, prints one `FAIL: <reason>` line per problem, then `verify-kit: OK` or `verify-kit: <N> problem(s)`. Env: `REPO_ROOT` (default: parent of KIT_DIR); `BLOCKCHAIN_MAINNET` / `BLOCKCHAIN_TESTNET` are optional clone roots, and when set, `Blockchain@<branch>:<path>` sources in `MANIFEST.md` are checked for existence.
  - `tools/required-content.txt` format: one assertion per line, `<kit-relative-path>|<ERE regex>`. Lines starting with `#` are comments. The regex may itself contain `|`, because only the first `|` splits.
  - `tools/secret-scan.allow` format: one reviewed public 64-hex value per line, then `  # reason`.
  - Checks, in order:
    - (1) `bash -n` on every `*.sh`.
    - (2) No CRLF in `*.sh`/`*.yml`/`*.toml`/`*.example`.
    - (3) No `.env`/`*.env` file anywhere in the kit.
    - (4) Secret scan, which allowlists genesis JSON fields (`mixHash`, `balance`, `extraData`, `parentHash`, `coinbase`, `nonce`), placeholder tokens, and `secret-scan.allow` values.
    - (5) Every line with `10.42.0.` in kit-authored `*.md`/`*.example` (excluding `scripts/`, `docs-ref/`, `host-a-deps/`) also contains `stale|bridge|docker|container|superseded`.
    - (6) Every `required-content.txt` assertion matches.
    - (7) Every backticked repo path (`deploy/…`, `ops/…`, `chain/…`, `services/…`, `console/…`, `api-console/…`, `contracts/…`, `doc/…`, `recovery-kit/…`) in `MANIFEST.md` and `131216-ledger/scripts-manifest.md` exists under `REPO_ROOT`, and `Blockchain@…` sources exist when the env roots are set.
    - (8) Once `MANIFEST.md` exists, every kit file outside `tools/` is listed in it as `` `kit/relative/path` ``.

- [ ] **Step 1: Write the self-test (the failing test)**

Create `recovery-kit/tools/verify-kit.selftest.sh`:

```bash
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
d="$TMP/reqok";   mk_clean "$d"; printf 'x-chain/README.md|10\\.43\\.0\\.0/24|nope\n' > "$d/tools/required-content.txt"; expect "required regex with | alternation passes" 0 "$d"
d="$TMP/mpath";   mk_clean "$d"; printf '| `deploy/ops/does-not-exist.sh` |\n| `x-chain/scripts/ok.sh` |\n| `x-chain/README.md` |\n' > "$d/MANIFEST.md"; expect "missing manifest repo path caught" 1 "$d"
d="$TMP/unlist";  mk_clean "$d"; printf '| `x-chain/README.md` |\n' > "$d/MANIFEST.md"; expect "kit file missing from MANIFEST caught" 1 "$d"

echo "$pass/$total passed"
[[ "$pass" == "$total" ]]
```

Also create the two empty data files:

```bash
mkdir -p recovery-kit/tools
printf '# <kit-relative-path>|<ERE regex>  — one assertion per line; tasks append their own.\n' > recovery-kit/tools/required-content.txt
printf '# Reviewed PUBLIC 64-hex values (tx/block/genesis hashes). One per line, then "  # reason".\n' > recovery-kit/tools/secret-scan.allow
```

- [ ] **Step 2: Run the self-test to verify it fails**

Run: `bash recovery-kit/tools/verify-kit.selftest.sh`
Expected: FAIL. Every case errors because `verify-kit.sh` does not exist, and the last line reads `0/15 passed` or similar, non-zero exit. (Cases expecting exit 1 may pass by accident. That is fine: the final count is not 15/15.)

- [ ] **Step 3: Write `verify-kit.sh`**

Create `recovery-kit/tools/verify-kit.sh`:

```bash
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

if [[ "$fails" -eq 0 ]]; then echo "verify-kit: OK"; exit 0; fi
echo "verify-kit: $fails problem(s)"; exit 1
```

- [ ] **Step 4: Run the self-test to verify it passes, then the real kit**

Run: `bash recovery-kit/tools/verify-kit.selftest.sh`
Expected: 15 `ok   - …` lines, last line `15/15 passed`, exit 0.

Run: `bash recovery-kit/tools/verify-kit.sh`
Expected: `verify-kit: OK` (kit is just `tools/` so far).

If a case fails, fix `verify-kit.sh`. Never weaken the self-test.

- [ ] **Step 5: Commit**

```bash
git add recovery-kit/tools/
git commit -m "feat(recovery-kit): add verify-kit static-check harness + self-test" -m "Checks: bash -n, CRLF, no .env in kit, secret scan with genesis/placeholder/allowlist, 10.42 mesh misuse, required-content assertions, manifest path existence, every file listed in MANIFEST." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Pre-teardown STOP gate + secrets inventory (load-bearing)

**Files:**
- Create: `recovery-kit/00-PRE-TEARDOWN-EXTRACTION.md`
- Create: `recovery-kit/secrets-inventory.md`
- Modify: `recovery-kit/tools/required-content.txt` (append)

**Interfaces:**
- Consumes: `tools/verify-kit.sh`, `required-content.txt` format (Task 1).
- Produces: extraction item numbers `E1`–`E19` (below). Later docs cite them as "see 00-PRE-TEARDOWN-EXTRACTION.md E<n>". Also the extraction output dir convention `~/hara-ops/teardown-<YYYY-MM-DD>/` with every file `*.age`-encrypted.

- [ ] **Step 1: Append the assertions (failing test)**

```bash
cat >> recovery-kit/tools/required-content.txt <<'EOF'
00-PRE-TEARDOWN-EXTRACTION.md|quorum
00-PRE-TEARDOWN-EXTRACTION.md|121212.*(4 of 7|4/7)
00-PRE-TEARDOWN-EXTRACTION.md|121299.*(2 of 3|2/3)
00-PRE-TEARDOWN-EXTRACTION.md|add-before-remove
00-PRE-TEARDOWN-EXTRACTION.md|qbft_proposeValidatorVote
00-PRE-TEARDOWN-EXTRACTION.md|FAUCET_PRIMARY_PRIVATE_KEY
00-PRE-TEARDOWN-EXTRACTION.md|hara-backups\.txt
00-PRE-TEARDOWN-EXTRACTION.md|ops/secrets\.txt
00-PRE-TEARDOWN-EXTRACTION.md|s3-readback-check
00-PRE-TEARDOWN-EXTRACTION.md|GetObject 403
00-PRE-TEARDOWN-EXTRACTION.md|age -r
00-PRE-TEARDOWN-EXTRACTION.md|E19
secrets-inventory.md|Never copy values
secrets-inventory.md|secret/haraledger/validators
secrets-inventory.md|secret/haraledger/admin-keys/admin-2026-05-27
secrets-inventory.md|secret/haraledger/signer-keys/anchor-worker
secrets-inventory.md|FAUCET_PRIVATE_KEY
EOF
```

- [ ] **Step 2: Run to verify it fails**

Run: `bash recovery-kit/tools/verify-kit.sh`
Expected: `FAIL: required file missing: 00-PRE-TEARDOWN-EXTRACTION.md` (×12) and `…secrets-inventory.md` (×5), then `verify-kit: 17 problem(s)`.

- [ ] **Step 3: Write `00-PRE-TEARDOWN-EXTRACTION.md`**

Required structure and facts. Write them as prose plus tables, with the commands verbatim:

**§0 STOP — read before destroying anything.** One table per chain showing what dies:
- **121212 mainnet:** NevaCloud carries validator3 `<MAINNET_V3_IP>`, validator4 `<MAINNET_V4_IP>`, validator5 `<MAINNET_V5_IP>`. Destroying them leaves **4 of 7** validators; QBFT quorum is **5**, so **the chain halts**. Also on NevaCloud: `call` (`<MAINNET_CALL_IP>`, read pool + write-failover behind validator1's HAProxy `call_frontend`/`rpc_tx` backup), and the public gateway/dashboard/Postgres/Redis host `<MAINNET_GATEWAY_IP>` behind `rpc.registry.haratoken.app` / `dashboard.registry.haratoken.app`. Required action, **add-before-remove**:
  1. Stand up replacement validators with new keys.
  2. Have a majority of current validators call `qbft_proposeValidatorVote(<newAddress>, true)`. Wait for the address to appear in `qbft_getValidatorsByBlockNumber("latest")`.
  3. Only then vote each NevaCloud validator out with `qbft_proposeValidatorVote(<oldAddress>, false)`.

  Never let the active count drop below 5. Note: this was done successfully on the testnet on 2026-09-11 (`tesnet_server/docs/CHANGELOG.md`).
- **121299 testnet:** NevaCloud Host B `<TESTNET_HOSTB_IP>` carries validator3. Destroying it leaves **2 of 3**; quorum is **3**, so **the chain halts**. Host B also runs the gateway (`:4000/:4001`), dashboard (`:4002`), Postgres and Redis, so every `*.mampang.haratoken.app` endpoint dies. The same add-before-remove procedure applies. Alternatively, accept the testnet outage, because the testnet is disposable and quarterly-reset.
- **131216 ledger:** the whole chain plus services are on NevaCloud, so this is a full outage. Notify partners first: hara-did / Atlas (on hara-did-stg `103.67.244.109`), and the Gapura/Aurum facades, which are not yet deployed. Halal Passport (`<HALAL_PASSPORT_PROD_IP>`) is a **production app on Polygon Amoy (chainId 80002)**, not a HARA chain. Confirm with its owner before destroying it.

**§1 Setup (operator laptop).** Verbatim:

```bash
export AGE_RECIPIENT="age1fcdr3qk0wuzxy0ynmzj3d28d8m8pfe489wpk6udstzcyccj7l45sjla6e3"   # public key; private half = ~/.config/age/hara-backups.txt
OUT="$HOME/hara-ops/teardown-$(date +%F)"; mkdir -p "$OUT"; chmod 700 "$OUT"
grab() {  # usage: grab <ssh-target> <remote-path> <name>   — never prints the file
  ssh "$1" "sudo cat '$2'" | age -r "$AGE_RECIPIENT" > "$OUT/$3.age"
  test -s "$OUT/$3.age" || { echo "EMPTY: $3"; return 1; }
}
dumpdb() {  # usage: dumpdb <ssh-target> <pg-container> <db-user> <name>
  ssh "$1" "sudo docker exec $2 pg_dumpall -U $3" | age -r "$AGE_RECIPIENT" > "$OUT/$4.sql.age"
  test -s "$OUT/$4.sql.age" || { echo "EMPTY: $4"; return 1; }
}
# Prove you can decrypt BEFORE you rely on any of it:
echo probe | age -r "$AGE_RECIPIENT" | age -d -i ~/.config/age/hara-backups.txt
```

**§2 Extraction checklist.** Table columns: `#` | Item | Lives at | Extract with | Verify | Done. Rows. Paths marked † are `repo-derived — verify before cutover`; confirm each with `ls` on the host first.
- **E1** `ops/secrets.txt`: master index (Vault unseal 3-of-5, S3 keys, Blockscout `SECRET_KEY_BASE`, console basic-auth, deployer keys). On this laptop at `hara-ledger/ops/secrets.txt` (gitignored) and † `/opt/hara/hara-ledger/ops/secrets.txt` on hara-stateless-2. Extract: `age -r "$AGE_RECIPIENT" < ops/secrets.txt > "$OUT/secrets.txt.age"`, plus mirror into the password manager. Verify: decrypt-and-count lines only (`age -d … | wc -l`).
- **E2** age private key `~/.config/age/hara-backups.txt`, laptop only. Without it every backup is unreadable. Extract: confirm it is in the password manager and on an offline USB. Verify: the §1 probe decrypts.
- **E3** `backup.env` (`BACKUP_AGE_RECIPIENT`, `RCLONE_TARGET`, `VAULT_APPROLE_*`) † `/opt/hara/hara-ledger/deploy/ops/backup.env` on hara-stateful and hara-v1..v4. `grab hara-stateful <path> backup.env-stateful` (repeat per host).
- **E4** rclone remote `nevacloud-s3`. Locate with `ssh hara-stateful 'sudo rclone config file'`, then `grab` that path. If the provider (Nevacloud Object Storage) is also being left, the buckets in E17 must be copied elsewhere first.
- **E5** Vault init output (`vault-init-keys-v2.json`: 5 unseal keys + root token): laptop `~/hara-ops/` plus password manager. AppRole `role_id`/`secret_id` pairs live in E3/E7 env files.
- **E6** WireGuard keys `/etc/wireguard/wg0.conf` on every 131216 host plus hara-did-stg. Optional: new hosts get new keys from `deploy/ops/wg-bootstrap.sh`. Extract only to keep the partner peer (hara-did-stg) unchanged.
- **E7** Per-role `.env` † `/opt/hara/hara-ledger/deploy/{platform,data,services,chain,rpc}/.env` on their hosts. The laptop holds partial gitignored copies at `deploy/{chain,data,platform,rpc,services}/.env`; treat the host copies as authoritative.
- **E8** Blockscout env † `deploy/services/blockscout/envs/common-blockscout.env` on hara-stateless-2 (`SECRET_KEY_BASE`, `INDEXER_DISABLE_INTERNAL_TRANSACTIONS_FETCHER=true`, which is host-only and gitignored).
- **E9** DNS: export the `haratrust.io` and `haratoken.app` zones from the DNS provider (Cloudflare; see `deploy/edge/cfedit-apiconsole.py`). Records needed: `rpc.ledger`, `explorer.ledger`, `grafana.platform`, `console.platform` (131216); `rpc.registry`, `dashboard.registry`, `explorer.registry`, `netstats.registry`, `grafana.registry`, `health.registry` (121212); `rpc.mampang`, `dashboard.mampang`, `explorer.mampang`, `netstats.mampang` (121299).
- **E10** Locally built images not on GHCR: `hara-registry-node`, `hara-alert-sink`. Optional `docker save | zstd`; otherwise rebuild from `deploy/chain/node/Dockerfile` and `deploy/platform/alert-sink/Dockerfile`.
- **E11** Vault data: run a final snapshot with `ssh hara-stateful 'sudo systemctl start hara-snapshot-vault.service'` (unit name per `deploy/ops/install-backup-timers.sh`; confirm with `systemctl list-units 'hara-*'`).
- **E12** Mainnet NevaCloud validator3/4/5 config **and node key** (host-only; no compose exists in any repo). For each container `hara-mainnet-validator{3,4,5}`: `ssh <ip> "sudo docker inspect hara-mainnet-validatorN --format '{{json .Mounts}}'"` to find the config/data dirs. Then `grab` the `docker-compose.yml`, `config.toml`, `static-nodes.json`, and the node `key` file. **The key file is the validator identity**: keep it to rejoin with the same address, or lose it and do add-before-remove (§0).
- **E13** Mainnet `call` node `<MAINNET_CALL_IP>` (`hara-mainnet-call`, `sync-mode=FULL`): same procedure as E12. Note it is reached with a **password, not a key** (ARCHITECTURE.md), so it is listed as a security gap.
- **E14** Mainnet gateway host `<MAINNET_GATEWAY_IP>`: `grab` the gateway `.env`. It contains **`FAUCET_PRIMARY_PRIVATE_KEY` / `FAUCET_SECONDARY_PRIVATE_KEY` (control prefunded faucet HARA)**, `JWT_SECRET`, `TURNSTILE_SECRET_KEY`, `BOOTSTRAP_ADMIN_PASSWORD`, `POSTGRES_PASSWORD`. Then `dumpdb <MAINNET_GATEWAY_IP> hara-gateway-postgres hara_gw mainnet-gateway` (users / api_keys / usage / faucet_claims). Also grab `/etc/nginx/` and `/etc/letsencrypt/` (tar via `ssh … 'sudo tar -C / -cz etc/nginx etc/letsencrypt' | age -r …`). The co-hosted `hara-status` app belongs to a teammate, so coordinate before teardown.
- **E15** Testnet Host B `<TESTNET_HOSTB_IP>`: `grab` validator3 `nodekey3`. `grab` the gateway `.env` (`FAUCET_PRIVATE_KEY`, `JWT_SECRET`, `BOOTSTRAP_ADMIN_PASSWORD`, `POSTGRES_PASSWORD`). Run `dumpdb <TESTNET_HOSTB_IP> hara-tesnet-gateway-postgres hara_gw testnet-gateway`. `grab` † `scripts/validator3_reset_remote.sh` (host-only, not in any repo), and the `authorized_keys` line carrying the forced command for `hara-quarterly-reset-key`.
- **E16** Partner boxes hara-did-stg (`103.67.244.109`, HaraDID + Atlas), hara-exchange-stg (`<EXCHANGE_STG_IP>`), halal-passport-prod (`<HALAL_PASSPORT_PROD_IP>`): their deploy code lives in their own Azure repos (PRODUCT HARA OS: hara-did, hara-atlas, hara-exchange; PRODUCT HALAL PASSPORT: halal-passport). Their owners must extract their `.env` files and DB dumps. Flag Cloud_2 audit C-001: halal-passport exposes Postgres `:5432` and MinIO `:9000/9001` publicly.
- **E17** Final off-host backup pass for 131216: `systemctl start` every `hara-snapshot-*.service` on hara-stateful and hara-v1..v4. Then `bash deploy/ops/s3-readback-check.sh`. **Known blocker: Nevacloud S3 GetObject 403** (the credential is write-only). Until a read-capable credential proves the objects are retrievable, **do not destroy hara-stateful**. If Nevacloud Object Storage is also being left, `rclone sync nevacloud-s3:<bucket> <new-remote>:<bucket>` for all 7 `hara-backups-*` buckets.
- **E18** Validator chain data (optional; chains can re-sync from peers while ≥1 healthy node remains): `snapshot-validator.sh` for 131216. The mainnet/testnet have no snapshot tooling, so they rely on peers.
- **E19** Sign-off: tick every row. `ls -la "$OUT"` shows every `*.age` non-empty. Decrypt-test one random file with `age -d -i ~/.config/age/hara-backups.txt "$OUT/<file>" | wc -c`. Copy `$OUT` to two separate locations (password manager attachment plus offline media). Only then destroy hosts, in this order: partner apps → 131216 services → 131216 chain → mainnet NevaCloud nodes (after §0 votes) → testnet Host B.

- [ ] **Step 4: Write `secrets-inventory.md`**

Open with the sentence: **"Never copy values into this kit — this file lists where each secret lives, not what it is."** Then one table per chain. Columns: Secret | Used by | Lives at (Vault path or file) | Extraction item.

- **131216:**
  - `secret/haraledger/validators/{1..4}` (validator keypairs; init.sh).
  - `secret/haraledger/signer-keys/deployer`.
  - `secret/haraledger/signer-keys/anchor-worker` (`0x1083b82AB0F9dC35827edAdf5f7B489cBE10C433`).
  - `secret/haraledger/anchor/*`.
  - `secret/haraledger/admin-keys/admin-2026-05-27` (platform admin `0x944b237097A03E1e8CdE8A0F46605506319EC329`; laptop copy `~/hara-ops/admin-2026-05-27.json`, flagged for shredding in state-09).
  - AppRoles `haraledger-{validator,signer,anchor,snapshot}`.
  - Vault unseal/root (E5); age key (E2); `ops/secrets.txt` (E1); `backup.env` (E3); rclone (E4); per-role `.env` (E7); Blockscout `SECRET_KEY_BASE` (E8); WG private keys (E6); console basic-auth (E1).
  - Partner facade keys, not yet deployed: Gapura/Aurum `ANCHOR_ROLE` and ML-DSA-65 seeds, intended for Vault.
- **121212:** validator node keys v3/v4/v5 plus `call` (E12/E13). Gateway: `FAUCET_PRIMARY_PRIVATE_KEY`, `FAUCET_SECONDARY_PRIVATE_KEY`, `JWT_SECRET`, `TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY`, `BOOTSTRAP_ADMIN_PASSWORD`, `POSTGRES_PASSWORD` (E14). TLS certs `/etc/letsencrypt` (E14). Faucet address `0xb43BC9a81Bb1BA5Db272968956F9E4427b025137`.
- **121299:** `nodekey3` (E15). Gateway `FAUCET_PRIVATE_KEY`, `JWT_SECRET`, `BOOTSTRAP_ADMIN_PASSWORD`, `POSTGRES_PASSWORD` (E15). `hara-quarterly-reset-key` (lives on Host A `keys/automation/`; public half in Host B `authorized_keys`). Faucet `0x5b701b7c9ef5d641e9270a6f19ed9be9b6a1830b`.
- Final section, **"Known plaintext secrets already committed in dattabot/Blockchain"** (rotate; never copied here): `docs/08_reference.md` and `deploy.sh` (1212 validator keys plus VM password); `shared_doc_tesnet_and_prod/PROD_ACCESS_AND_GUIDE.md` and `TESNET_ACCESS_AND_GUIDE.md` (admin/Grafana creds, QA API key); `cloud_2/ARSITEKTUR.md` (root SSH password, `HX_NODE_PRIVKEY`).

Addresses (40-hex) are public and allowed. Never write a 64-hex value.

- [ ] **Step 5: Run to verify it passes**

Run: `bash recovery-kit/tools/verify-kit.sh`
Expected: `verify-kit: OK`.

- [ ] **Step 6: Commit**

```bash
git add recovery-kit/00-PRE-TEARDOWN-EXTRACTION.md recovery-kit/secrets-inventory.md recovery-kit/tools/required-content.txt
git commit -m "docs(recovery-kit): pre-teardown STOP gate + extraction checklist + secrets inventory" -m "Quorum gate for 121212 (4/7 < 5) and 121299 (2/3 < 3) with add-before-remove; 19 extraction items piped straight into age; secrets listed by reference only." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `hosts.env.example` — sourceable variables for the new hosts

**Files:**
- Create: `recovery-kit/hosts.env.example`
- Modify: `recovery-kit/tools/required-content.txt` (append)

**Interfaces:**
- Consumes: Task 1 harness.
- Produces: variable names used verbatim by Tasks 4–7 runbooks.
  - 131216: `LEDGER_CHAIN_ID`, `LEDGER_MESH_SUBNET`, `LEDGER_DOCKER_BRIDGE`, `LEDGER_{V1,V2,V3,V4,RPC1,STATELESS2,STATEFUL,DIDSTG}_{PUBLIC_IP,MESH_IP}`, `LEDGER_EXCHANGE_PUBLIC_IP`, `LEDGER_HALAL_PUBLIC_IP`, `LEDGER_DOMAIN_{RPC,EXPLORER,GRAFANA,CONSOLE}`, `LEDGER_ACME_EMAIL`, `IMAGE_REGISTRY`.
  - 121212: `MAINNET_CHAIN_ID`, `MAINNET_{V3,V4,V5,CALL,GATEWAY}_PUBLIC_IP`, `MAINNET_HAPROXY_HOST`, `MAINNET_DOMAIN_{RPC,DASHBOARD,EXPLORER}`.
  - 121299: `TESTNET_CHAIN_ID`, `TESTNET_HOSTA_PUBLIC_IP`, `TESTNET_HOSTB_PUBLIC_IP`, `TESTNET_DOMAIN_BASE`.
  - Shared: `BACKUP_S3_REMOTE`, `AGE_RECIPIENT`.

- [ ] **Step 1: Append the assertions**

```bash
cat >> recovery-kit/tools/required-content.txt <<'EOF'
hosts.env.example|^LEDGER_MESH_SUBNET="10\.43\.0\.0/24"
hosts.env.example|10\.42\.0\.0/24.*bridge
hosts.env.example|topology\.md.*stale
hosts.env.example|^LEDGER_DOMAIN_RPC="rpc\.ledger\.haratrust\.io"
hosts.env.example|^MAINNET_CALL_PUBLIC_IP=
hosts.env.example|^TESTNET_HOSTB_PUBLIC_IP=
hosts.env.example|^MAINNET_HAPROXY_HOST="52\.77\.106\.39"
EOF
```

- [ ] **Step 2: Run to verify it fails**

Run: `bash recovery-kit/tools/verify-kit.sh`
Expected: 7× `FAIL: required file missing: hosts.env.example`, `verify-kit: 7 problem(s)`.

- [ ] **Step 3: Write `hosts.env.example`**

Rules:
- Every value **double-quoted**. Placeholders contain `<`, so unquoted they would be parsed as a shell redirect.
- Each NevaCloud host that is being replaced gets `"<SUPPLY:new public IP>"` plus a `# was <current IP>` comment.
- Mesh IPs keep their current values (internal and reusable).
- Domains keep their current values (DNS gets repointed).
- Non-NevaCloud dependencies keep their real current values.

Header comment: the 10.43/10.42 rule, and `deploy/topology.md` (10.42.x, 6 hosts) is **stale**. Current values to write in comments:
- 131216: v1 `202.155.18.234`/`10.43.0.11`, v2 `103.169.206.46`/`.12`, v3 `103.169.206.127`/`.13`, v4 `160.19.166.23`/`.14`, rpc-1 `103.169.206.237`/`.21`, stateless-2 `103.169.206.239`/`.25`, stateful `103.67.244.250`/`.40`, did-stg `103.67.244.109`/`.50`, exchange `<EXCHANGE_STG_IP>` (no mesh), halal `<HALAL_PASSPORT_PROD_IP>` (no mesh). Domains `rpc.ledger.haratrust.io`, `explorer.ledger.haratrust.io`, `grafana.platform.haratrust.io`, `console.platform.haratrust.io`. ACME email `ops@haratrust.io`. `IMAGE_REGISTRY="ghcr.io/imronzuhri-svg/"`. `LEDGER_CHAIN_ID="131216"`.
- 121212: v3 `<MAINNET_V3_IP>`, v4 `<MAINNET_V4_IP>`, v5 `<MAINNET_V5_IP>`, call `<MAINNET_CALL_IP>`, gateway `<MAINNET_GATEWAY_IP>`. `MAINNET_HAPROXY_HOST="<MAINNET_V1_AWS_IP>"` (AWS, stays). Domains `rpc.registry.haratoken.app`, `dashboard.registry.haratoken.app`, `explorer.registry.haratoken.app`. `MAINNET_CHAIN_ID="121212"`.
- 121299: `TESTNET_HOSTA_PUBLIC_IP="<TESTNET_HOSTA_IP>"` (AWS, stays), Host B was `<TESTNET_HOSTB_IP>`. `TESTNET_DOMAIN_BASE="mampang.haratoken.app"`. `TESTNET_CHAIN_ID="121299"`.
- Shared: `BACKUP_S3_REMOTE="<SUPPLY:rclone remote name, was nevacloud-s3>"`, `AGE_RECIPIENT="age1fcdr3qk0wuzxy0ynmzj3d28d8m8pfe489wpk6udstzcyccj7l45sjla6e3"`.

- [ ] **Step 4: Verify it is sourceable and the harness passes**

Run: `bash -c 'set -euo pipefail; set -a; . recovery-kit/hosts.env.example; echo "$LEDGER_CHAIN_ID $MAINNET_CHAIN_ID $TESTNET_CHAIN_ID $LEDGER_MESH_SUBNET"'`
Expected: `131216 121212 121299 10.43.0.0/24`

Run: `bash recovery-kit/tools/verify-kit.sh`
Expected: `verify-kit: OK`

- [ ] **Step 5: Commit**

```bash
git add recovery-kit/hosts.env.example recovery-kit/tools/required-content.txt
git commit -m "docs(recovery-kit): add sourceable hosts.env.example for new-VPS retargeting" -m "All NevaCloud hosts abstracted (was-IP comments); 10.43.0.0/24 mesh truth; topology.md flagged stale; AWS/Azure dependencies keep real values." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `131216-ledger/` — reference runbooks (no copies)

**Files:**
- Create: `recovery-kit/131216-ledger/README.md`, `recreate.md`, `monitoring.md`, `backup-restore.md`, `scripts-manifest.md`
- Modify: `recovery-kit/tools/required-content.txt` (append)

**Interfaces:**
- Consumes: `hosts.env.example` variable names (Task 3); extraction items `E1`–`E19` (Task 2).
- Produces: `131216-ledger/scripts-manifest.md` rows with exact repo paths. The harness path check (Task 1, check 7) validates them.

- [ ] **Step 1: Append the assertions**

```bash
cat >> recovery-kit/tools/required-content.txt <<'EOF'
131216-ledger/README.md|hara-stateful
131216-ledger/README.md|[Bb]ring-up order
131216-ledger/README.md|10\.43\.0\.20
131216-ledger/README.md|topology\.md.*stale
131216-ledger/recreate.md|cloud-init\.yaml
131216-ledger/recreate.md|wg-bootstrap\.sh
131216-ledger/recreate.md|vault-raft-init\.sh
131216-ledger/recreate.md|vault-approle-bootstrap\.sh
131216-ledger/recreate.md|secrets-bootstrap\.sh init
131216-ledger/recreate.md|bringup-phase7\.sh
131216-ledger/recreate.md|INDEXER_DISABLE_INTERNAL_TRANSACTIONS_FETCHER=true
131216-ledger/recreate.md|hostname -s
131216-ledger/recreate.md|repo-derived — verify before cutover
131216-ledger/monitoring.md|besu-overview\.json
131216-ledger/monitoring.md|rpc-tier\.json
131216-ledger/monitoring.md|console\.platform\.haratrust\.io
131216-ledger/monitoring.md|:8404
131216-ledger/backup-restore.md|hara-backups-postgres-wal
131216-ledger/backup-restore.md|hara-backups-vault
131216-ledger/backup-restore.md|pitr-restore-drill\.sh
131216-ledger/backup-restore.md|GetObject 403
131216-ledger/scripts-manifest.md|`deploy/ops/install-backup-timers\.sh`
131216-ledger/scripts-manifest.md|`deploy/chain/init/init\.sh`
131216-ledger/scripts-manifest.md|`deploy/edge/Caddyfile`
EOF
```

- [ ] **Step 2: Run to verify it fails**

Run: `bash recovery-kit/tools/verify-kit.sh`
Expected: 24 `FAIL: required file missing: 131216-ledger/…` lines, `verify-kit: 24 problem(s)`.

- [ ] **Step 3: Write `scripts-manifest.md`**

A table: `Path | Purpose | Runs on | Order step`. Include exactly these existing repo paths, each in backticks. Do **not** list any `.env` file (gitignored; it is an extraction item, E7).

- **Host provisioning:**
  - `deploy/ops/cloud-init.yaml` (replace the placeholder SSH key)
  - `deploy/ops/bootstrap-vps.sh`
  - `deploy/ops/bootstrap-newbox.sh`
  - `deploy/ops/setup-swap.sh`
  - `deploy/ops/add-operator.sh`
  - `deploy/ops/remove-operator.sh`
  - `deploy/ops/operator-keygen.sh`
  - `deploy/ops/operator-keygen.bat`
- **Mesh:**
  - `deploy/ops/wg-bootstrap.sh`
  - `deploy/ops/wg-add-peer.sh`
  - `deploy/ops/wg-onboard-migration.sh`
  - `deploy/ops/wg-local-test.sh`
  - `deploy/ops/wg-local-6peer-test.sh`
  - `deploy/networks/wireguard/README.md`
- **Vault/secrets:**
  - `deploy/ops/vault-raft-init.sh`
  - `deploy/ops/vault-approle-bootstrap.sh`
  - `deploy/ops/vault-raft-snapshot.sh`
  - `deploy/ops/secrets-bootstrap.sh`
  - `deploy/ops/seed-anchor-key.sh`
  - `deploy/ops/rotate-anvil0-admin.sh`
  - `deploy/ops/minter-role.sh`
  - `deploy/platform/vault/vault.hcl`
  - `deploy/platform/docker-compose.secrets.yml`
- **Data:**
  - `deploy/data/docker-compose.yml`
  - `deploy/data/docker-compose.minio.yml`
  - `deploy/data/.env.example`
- **Chain:**
  - `deploy/chain/docker-compose.yml`
  - `deploy/chain/docker-compose.validator-only.yml`
  - `deploy/chain/qbft-config.json`
  - `deploy/chain/genesis/genesis.json`
  - `deploy/chain/init/init.sh`
  - `deploy/chain/init/Dockerfile`
  - `deploy/chain/node/Dockerfile`
  - `deploy/chain/scripts/start-validator.sh`
  - `deploy/chain/scripts/start-rpc.sh`
  - `deploy/chain/.env.example`
- **RPC:**
  - `deploy/rpc/docker-compose.yml`
  - `deploy/rpc/lb/haproxy.cfg`
  - `deploy/rpc/scripts/start-rpc.sh`
  - `deploy/rpc/scripts/start-validator.sh`
  - `deploy/rpc/.env.example`
- **Services:**
  - `deploy/services/docker-compose.yml`
  - `deploy/services/docker-compose.console.yml`
  - `deploy/services/blockscout/init-db.sh`
  - `deploy/services/blockscout/envs/common-frontend.env.example`
  - `deploy/services/.env.example`
- **Observability:**
  - `deploy/platform/docker-compose.obs.yml`
  - `deploy/platform/prometheus/prometheus.yml`
  - `deploy/platform/prometheus/alert_rules.yml`
  - `deploy/platform/alertmanager/alertmanager.yml`
  - `deploy/platform/alert-sink/Dockerfile`
  - `deploy/platform/alert-sink/sink.mjs`
  - `deploy/platform/loki/loki-config.yml`
  - `deploy/platform/promtail/promtail-config.yml`
  - `deploy/platform/tempo/tempo.yaml`
  - `deploy/platform/grafana/provisioning/datasources/prometheus.yml`
  - `deploy/platform/grafana/provisioning/datasources/tempo.yml`
  - `deploy/platform/grafana/provisioning/dashboards/dashboards.yml`
  - `deploy/platform/grafana/provisioning/dashboards/besu-overview.json`
  - `deploy/platform/grafana/provisioning/dashboards/fleet-overview.json`
  - `deploy/platform/grafana/provisioning/dashboards/indexer.json`
  - `deploy/platform/grafana/provisioning/dashboards/rpc-cache.json`
  - `deploy/platform/grafana/provisioning/dashboards/rpc-tier.json`
  - `deploy/platform/.env.example`
  - `deploy/ops/install-node-exporter.sh`
  - `deploy/ops/install-metrics-proxies.sh`
  - `deploy/ops/install-console-agent.sh`
- **Edge:**
  - `deploy/edge/docker-compose.yml`
  - `deploy/edge/Caddyfile`
  - `deploy/edge/cfedit-apiconsole.py`
  - `deploy/edge/trace-site/index.html`
- **Bring-up orchestration:**
  - `deploy/ops/bringup-stateful.sh`
  - `deploy/ops/bringup-validators.sh`
  - `deploy/ops/bringup-stateless.sh`
  - `deploy/ops/bringup-phase7.sh`
- **Backups:**
  - `deploy/ops/backup-setup.sh`
  - `deploy/ops/install-backup-timers.sh`
  - `deploy/ops/snapshot-postgres.sh`
  - `deploy/ops/snapshot-postgres-basebackup.sh`
  - `deploy/ops/snapshot-postgres-wal.sh`
  - `deploy/ops/snapshot-redis.sh`
  - `deploy/ops/snapshot-minio.sh`
  - `deploy/ops/snapshot-validator.sh`
  - `deploy/ops/snapshot-restore-drill.sh`
  - `deploy/ops/pitr-restore-drill.sh`
  - `deploy/ops/validator-snapshot-restore-drill.sh`
  - `deploy/ops/s3-readback-check.sh`
  - `deploy/ops/standby-bootstrap.sh`
  - `deploy/ops/RECOVERY.md`
  - `deploy/ops/DEPLOY-BACKUP-RECOVERY.md`
- **Historical (not needed for a fresh build):**
  - `deploy/ops/cutover-phase-c.sh`
  - `deploy/ops/decommission-old-stateless.sh`
  - `deploy/runbook-rpc-host-migration.md`
  - `deploy/rpc-scaling-design.md`
- **Docs:**
  - `deploy/README.md`
  - `deploy/PRE-VPS-CHECKLIST.md`
  - `deploy/nevacloud-runbook.md`
  - `deploy/topology.md` (mark **stale**)
  - `deploy/sim/README.md`
  - `deploy/sim/sim-up.sh`
  - `deploy/sim/sim-down.sh`
  - `ops/runbooks/L0-bring-up.md`
  - `ops/runbooks/L1-rpc-separation.md`
  - `ops/runbooks/L2-signer-broadcaster.md`
  - `ops/runbooks/L3-indexer.md`
  - `ops/runbooks/L4-monitoring.md`
  - `ops/runbooks/L5-blockscout.md`
- **App build sources:**
  - `services/pnpm-workspace.yaml`
  - `console/Dockerfile`
  - `console/server/Dockerfile`

- [ ] **Step 4: Write `README.md` (host-role matrix)**

Table: Host | Public IP var | Mesh IP | Role | Compose / scripts. Rows: hara-v1..v4 (`.11–.14`, Besu validator via `deploy/chain/docker-compose.validator-only.yml` with `VALIDATOR_ID=1..4`), hara-rpc-1 (`.21`, `deploy/rpc/docker-compose.yml`: rpc-write + 2× rpc-read + HAProxy 2.9 + autoheal), hara-stateless-2 (`.25`, services + Blockscout + console + obs + Caddy edge), hara-stateful (`.40`, Vault Raft + Postgres 16 + Redis 7 + MinIO), hara-did-stg (`.50`, partner, its own repo), hara-exchange-stg and halal-passport-prod (partner apps, own repos, not on mesh).

Then a **Bring-up order** list:
1. Provision.
2. WG mesh.
3. hara-stateful (Vault → unseal → AppRoles → secrets → data).
4. Validators.
5. hara-rpc-1.
6. hara-stateless-2 services.
7. Observability.
8. Edge.
9. Phase 7 contracts + anchor-worker.
10. Backup timers.
11. Console.

Also add two flags:
- `deploy/topology.md` is **stale** (10.42.x / 6 hosts / "hara-stateless").
- The Cloud_2 audit found Atlas configured for `10.43.0.20`, which does not exist; rpc-1 is `10.43.0.21`. Fix it on rebuild.

- [ ] **Step 5: Write `recreate.md`**

Numbered steps. Each gives: host, command (verbatim script path), what it produces, and the verify command.
1. `cloud-init.yaml` / `bootstrap-newbox.sh`, with the SSH key placeholder replaced. Then `add-operator.sh`.
2. `wg-bootstrap.sh` from the laptop. Verify `wg show` plus ping across `10.43.0.0/24`.
3. On hara-stateful: `docker compose -f deploy/platform/docker-compose.secrets.yml up -d`, then `deploy/ops/vault-raft-init.sh` (store `vault-init-keys.json` off-host, per E5), unseal 3-of-5, `deploy/ops/vault-approle-bootstrap.sh`, `deploy/ops/secrets-bootstrap.sh init`. Then either scp each role `.env` to its host, **or** restore the extracted E7 `.env` files plus the E11 Vault snapshot (`vault operator raft snapshot restore`) to keep the same chain identity and keys.
4. `bringup-stateful.sh` (data + MinIO). For a restore, follow `backup-restore.md`.
5. Chain: a **fresh chain** runs `deploy/chain/init` (new genesis, new keys = new chain). A **same chain** keeps `deploy/chain/genesis/genesis.json` and the Vault `validators/{1..4}` restored from snapshot, then `bringup-validators.sh`.
6. `deploy/rpc` on hara-rpc-1. Ensure `--sync-min-peers=2` is in `start-rpc.sh`.
7. `bringup-stateless.sh`. Re-apply `INDEXER_DISABLE_INTERNAL_TRANSACTIONS_FETCHER=true` in the Blockscout env (host-only, E8; it prevents the rpc-read Vert.x hang).
8. `deploy/platform/docker-compose.obs.yml` + `install-node-exporter.sh` + `install-metrics-proxies.sh`.
9. Edge: `deploy/edge`. DNS A-records must exist first (E9) for ACME.
10. `bringup-phase7.sh` (contracts + anchor-worker). Same-chain rebuilds skip the deploys.
11. `install-backup-timers.sh`. Pass roles explicitly on hara-stateful, because `hostname -s` returns `localhost` there.
12. Console: `docker compose -f deploy/services/docker-compose.console.yml up -d --build` + `install-console-agent.sh`.

Mark steps 3, 7, 11 `repo-derived — verify before cutover`.

- [ ] **Step 6: Write `monitoring.md`**

Per console: what it is, where its config lives (repo path), host/port, how it is fronted.
- Grafana: datasources plus the dashboards `besu-overview.json`, `fleet-overview.json`, `indexer.json`, `rpc-cache.json`, `rpc-tier.json`, at `grafana.platform.haratrust.io`.
- Prometheus scrape jobs by WG IP, from `deploy/platform/prometheus/prometheus.yml`: validators `:9545` on `.11–.14`, rpc-write `.21:9545`, rpc-read `.21:9546-9547`, HAProxy `.21:8404`, node `:9100`, indexer, Blockscout `:4000`. The Vault job is commented out.
- Alertmanager plus custom alert-sink.
- Loki/Promtail.
- Tempo.
- Blockscout BE 6.10.1 / FE v1.37.1 at `explorer.ledger.haratrust.io`.
- HAProxy stats `:8404` on hara-rpc-1.
- Strata console (`console/` SPA + `console/server` API + `console/agent` on `:8911`) at `console.platform.haratrust.io`, behind Caddy basic_auth.
- Static `api-console/` at `/api-console/*`.

- [ ] **Step 7: Write `backup-restore.md`**

Table: store | bucket | producer script | cadence:
- PG logical `hara-backups-postgres` 02:00
- PG base `hara-backups-postgres-base` 01:30
- PG WAL `hara-backups-postgres-wal` every 10 min
- Redis `hara-backups-redis` 02:30
- MinIO `hara-backups-minio` 02:45
- Validator `hara-backups-validator` 03:00 + 15·idx
- Vault `hara-backups-vault` 04:00

Retention: WAL 14d, base 21d, RPO ≤5 min.

Encryption: age, recipient in `backup.env`, private key on the laptop only (E2).

Restore recipe per store: point to `deploy/ops/RECOVERY.md` sections, using the `age -d -i ~/.config/age/hara-backups.txt` pattern. Drills: `snapshot-restore-drill.sh`, `pitr-restore-drill.sh`, `validator-snapshot-restore-drill.sh`, `s3-readback-check.sh`.

**Known blocker: Nevacloud S3 GetObject 403** (write-only credential, so readback is unproven). Moving providers means `rclone sync` of all 7 buckets (E17) and updating `RCLONE_TARGET`.

Mainnet/testnet posture: there is no automated Postgres backup. The E14/E15 dumps are the only copy, and the chain data relies on peers.

- [ ] **Step 8: Run to verify it passes**

Run: `bash recovery-kit/tools/verify-kit.sh`
Expected: `verify-kit: OK`. A `missing repo path` failure means a typo in `scripts-manifest.md`: fix the path, do not delete the row.

- [ ] **Step 9: Commit**

```bash
git add recovery-kit/131216-ledger/ recovery-kit/tools/required-content.txt
git commit -m "docs(recovery-kit): 131216 ledger runbooks referencing deploy/ (no copies)" -m "Host-role matrix, bring-up order, recreate steps, monitoring consoles, backup/restore; scripts-manifest paths verified to exist." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `121212-mainnet-neva/` — copy, normalize, scan, document

**Files:**
- Create (copied): `recovery-kit/121212-mainnet-neva/scripts/**`, `recovery-kit/121212-mainnet-neva/docs-ref/**`
- Create: `recovery-kit/121212-mainnet-neva/README.md`, `recovery-kit/121212-mainnet-neva/recreate.md`
- Modify: `recovery-kit/tools/required-content.txt`, possibly `recovery-kit/tools/secret-scan.allow`

**Interfaces:**
- Consumes: Task 1 harness; `MAINNET_*` vars (Task 3); E12–E14 (Task 2).
- Produces: the kit-relative layout that `tools/manifest-rows.sh` (Task 7) maps back to `Blockchain@mainnet-final:` sources:
  - `scripts/config/*` ← `mainnet_production/config/*`
  - `scripts/gateway/**` ← `mainnet_production/gateway/**`
  - `scripts/hara-block-health-watch.sh` ← `mainnet_production/scripts/…`
  - `docs-ref/SOURCE-README.md` ← `mainnet_production/README.md`
  - `docs-ref/BACKLOG.md` ← `mainnet_production/BACKLOG.md`
  - `docs-ref/QA/*` ← `mainnet_production/QA/*`
  - other `docs-ref/*` ← `mainnet_production/docs/*`

- [ ] **Step 1: Append the assertions**

```bash
cat >> recovery-kit/tools/required-content.txt <<'EOF'
121212-mainnet-neva/README.md|116\.212\.73\.232
121212-mainnet-neva/README.md|202\.155\.19\.177
121212-mainnet-neva/README.md|103\.143\.12\.68
121212-mainnet-neva/README.md|52\.77\.106\.39
121212-mainnet-neva/README.md|host-only
121212-mainnet-neva/recreate.md|keccak256
121212-mainnet-neva/recreate.md|qbft_proposeValidatorVote
121212-mainnet-neva/recreate.md|sync-mode=FULL
121212-mainnet-neva/recreate.md|26\.6\.1
121212-mainnet-neva/recreate.md|permitopen
121212-mainnet-neva/recreate.md|repo-derived — verify before cutover
121212-mainnet-neva/scripts/config/genesis.json|"chainId": 121212
EOF
```

- [ ] **Step 2: Run to verify it fails**

Run: `bash recovery-kit/tools/verify-kit.sh`
Expected: 12 `FAIL: required file missing: 121212-mainnet-neva/…`, `verify-kit: 12 problem(s)`.

- [ ] **Step 3: Copy from the branch with `git archive`, then normalize CRLF**

`git archive` reads committed content, never the worktree.

```bash
SRC=/c/Projects/claude_projects/_external/blockchain
DST=recovery-kit/121212-mainnet-neva
TMPX="$(mktemp -d)"
git -C "$SRC" archive mainnet-final mainnet_production | tar -x -C "$TMPX"
M="$TMPX/mainnet_production"
mkdir -p "$DST/scripts" "$DST/docs-ref/QA"
cp -r "$M/config"  "$DST/scripts/config"
cp -r "$M/gateway" "$DST/scripts/gateway"
cp "$M/scripts/hara-block-health-watch.sh" "$DST/scripts/"
cp -r "$M/docs/." "$DST/docs-ref/"
cp "$M/README.md"  "$DST/docs-ref/SOURCE-README.md"
cp "$M/BACKLOG.md" "$DST/docs-ref/BACKLOG.md"
cp "$M/QA/STRESS_TEST_RESULTS.md" "$DST/docs-ref/QA/"
rm -rf "$TMPX"
find "$DST/scripts" "$DST/docs-ref" -type f \( -name '*.sh' -o -name '*.md' -o -name '*.json' -o -name '*.yml' -o -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.sql' -o -name '*.toml' -o -name '*.css' -o -name '*.example' -o -name 'Dockerfile' \) -exec sed -i 's/\r$//' {} +
# Count CRs with tr (Git-for-Windows grep hides CR in scripts — see verify-kit check 2):
find "$DST" -type f -exec cat {} + | tr -dc '\r' | wc -c   # Expected: 0
```

- [ ] **Step 4: Scan and triage (scrub secrets, allowlist public hashes)**

Run: `bash recovery-kit/tools/verify-kit.sh 2>&1 | grep 'possible secret' || echo "no secret hits"`
Expected (pre-checked 2026-10-12): `no secret hits`. The only 64-hex values in the source are genesis `mixHash`/`balance`/`extraData` (allowlisted by field), and `.env.example` holds only `change-me` placeholders.

If any hit appears, inspect it **redacted** (never print the raw line):

```bash
f=<file>; L=<line>
sed -n "${L}p" "$f" | sed -E 's/0x[0-9a-fA-F]{64}/0x<64hex>/g; s/([=:][[:space:]]*"?)[A-Za-z0-9+\/_@#%!.-]{8,}/\1<redacted>/g'
```

- **Public hash** (tx/block hash in prose): `grep -oE '0x[0-9a-fA-F]{64}' <(sed -n "${L}p" "$f") | sed 's/$/  # public tx\/block hash in '"${f##*/}"'/' >> recovery-kit/tools/secret-scan.allow`
- **Secret:** scrub it in place:
  `sed -i -E "${L}s/0x[0-9a-fA-F]{64}/<FROM-FILE:see secrets-inventory.md>/g; ${L}s/((PASSWORD|PASSWD|SECRET|TOKEN|API_KEY|PRIVATE_KEY)[A-Z_]*[[:space:]]*[=:][[:space:]]*\"?)[A-Za-z0-9+\/_@#%!.-]{8,}/\1<FROM-FILE:see secrets-inventory.md>/g" "$f"`

  Then note `scrubbed line <L>` in the file's MANIFEST row (Task 7).

- [ ] **Step 5: Write `121212-mainnet-neva/README.md`**

Facts:
- Chain 121212, Besu `hyperledger/besu:26.6.1`, QBFT 5s/30000/10, `zeroBaseFee`, gasLimit `0x2540be400`.
- 7 validators, quorum 5. Domains `*.registry.haratoken.app`. Permanent data.
- **NevaCloud slice:** validator3 `<MAINNET_V3_IP>`, validator4 `<MAINNET_V4_IP>`, validator5 `<MAINNET_V5_IP>` (3 vCPU / 3.8 GB / 60 GB each); `call` `<MAINNET_CALL_IP>` (read pool + write failover, `sync-mode=FULL`); gateway host `<MAINNET_GATEWAY_IP>` (gateway + dashboard + Postgres + Redis + nginx/certbot, moved there 2026-09-30).
- **Stays on AWS/Azure, and NevaCloud depends on it:**
  - validator1 `<MAINNET_V1_AWS_IP>`: HAProxy with 4 pools over local SSH tunnels, Prometheus 3.5.0, Grafana 12.1.0, netstats, Caddy.
  - validator2 `<MAINNET_V2_IP>`
  - validator6 `<MAINNET_V6_IP>`
  - validator7 `<MAINNET_V7_IP>`
  - rpc1 `<MAINNET_RPC1_IP>`
  - archive + Blockscout `<MAINNET_ARCHIVE_IP>`
- What is in `scripts/`: genesis, static-nodes, gateway app, health-watch.
- Monitoring lives on AWS validator1, not NevaCloud. Prometheus scrapes 9 `besu-mainnet` targets (validator1–7 + rpc1 + call), so the `call`/v3/v4/v5 targets must be re-pointed to the new IPs. **Alertmanager is dormant** (not wired to any notifier), so nothing alerts on the archive disk (~54% used on 2026-10-12, projected full ~Oct 26). External status page: `health.registry.haratoken.app`.
- **Host-only:** validator/`call` compose files, `config.toml`, node keys, and the HAProxy config on validator1 (`/opt/hara-mainnet/config/haproxy.cfg`) do **not** exist in any repo, so see E12–E14.
- Flag: `scripts/gateway/.env.example` comments still say the gateway runs on validator2 (Azure). That is stale since 2026-09-30.

- [ ] **Step 6: Write `121212-mainnet-neva/recreate.md`**

Sections:
1. Validator (v3/v4/v5) on a new host:
   - Docker; image `hyperledger/besu:26.6.1`; `--network-id 121212`; genesis `scripts/config/genesis.json`; `static-nodes.json`.
   - Settings: `sync-mode=SNAP`, `bonsai-limit-trie-logs-enabled=true`, `bonsai-historical-block-limit=512`, min-gas-price 0. mem_limit ≥3072m (OOM history: v3/4/5 raised to 3072m on 2026-10-09). **No `cpus: 0.7` cap**: that cap caused 15s block gaps (2026-10-12 root cause).
   - Use the extracted compose/config (E12) as primary. This parameter list is the fallback and is `repo-derived — verify before cutover`.
   - Identity:
     - **Same key** (E12 `key` file) → same address, rejoins the set automatically.
     - **New key** → address = `keccak256(uncompressed pubkey)[12:]`, **not** `pubkey[:20]`. That wrong derivation broke the testnet faucet and validator1 in 2026-08/09. Add it with `qbft_proposeValidatorVote(<addr>, true)` from a majority of current validators before removing the old one.
   - 512-block SNAP window: a node more than 512 blocks (~43 min) behind cannot self-resync; see `docs-ref/RUNBOOK_VALIDATOR_SNAP_STUCK_RECOVERY.md`.
2. `call` node: `sync-mode=FULL`, trie-log limit off. Serves validator1 HAProxy `call_frontend` (5799) and the `rpc_tx` backup. On validator1, add the new IP to the SSH-tunnel config and the `permitopen` list, because a missing `permitopen` cross-contaminated pools on 2026-09-15 (`docs-ref/QA/STRESS_TEST_RESULTS.md`).
3. Gateway host:
   - `scripts/gateway/docker-compose.yml` (containers `hara-gateway`, `hara-gateway-dashboard`, `hara-gateway-postgres`, `hara-gateway-redis`; ports bound to 127.0.0.1).
   - Restore `.env` (E14), and the DB with `age -d … | docker exec -i hara-gateway-postgres psql -U hara_gw`.
   - nginx + certbot (E14). DNS `rpc.registry` / `dashboard.registry` → new IP.
   - Set `HAPROXY_HOST=<MAINNET_V1_AWS_IP>` and allow the new IP in validator1's firewall.
4. Health: `scripts/hara-block-health-watch.sh` as a systemd timer every 5 min. It runs on validator1 today, so check it still covers the new node addresses.

- [ ] **Step 7: Run to verify it passes**

Run: `BLOCKCHAIN_MAINNET=/c/Projects/claude_projects/_external/blockchain-mainnet bash recovery-kit/tools/verify-kit.sh`
Expected: `verify-kit: OK`

- [ ] **Step 8: Commit**

```bash
git add recovery-kit/121212-mainnet-neva/ recovery-kit/tools/
git commit -m "docs(recovery-kit): 121212 mainnet NevaCloud slice — copied sources + runbooks" -m "git-archive copy of mainnet_production config/gateway/health-watch/docs from Blockchain@mainnet-final, CRLF->LF, secret-scanned; validator/call/gateway recreate steps incl. keccak address derivation + add-before-remove." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `121299-testnet-neva/` — copy, normalize, scan, document

**Files:**
- Create (copied): `recovery-kit/121299-testnet-neva/scripts/**`, `recovery-kit/121299-testnet-neva/host-a-deps/**`, `recovery-kit/121299-testnet-neva/docs-ref/**`
- Create: `recovery-kit/121299-testnet-neva/README.md`, `recovery-kit/121299-testnet-neva/recreate.md`
- Modify: `recovery-kit/tools/required-content.txt`, possibly `recovery-kit/tools/secret-scan.allow`

**Interfaces:**
- Consumes: Task 1 harness; `TESTNET_*` vars (Task 3); E15 (Task 2).
- Produces: the layout mapped back to `Blockchain@testnet-final:` sources:
  - `scripts/validator3/**` ← `tesnet_server/validator3/**`
  - `scripts/gateway/**` ← `tesnet_server/gateway/**`
  - `scripts/ops/*.sh` ← `tesnet_server/scripts/*.sh`
  - `scripts/config/*` ← `tesnet_server/config/*`
  - `host-a-deps/{caddy,netstats}/**` ← `tesnet_server/{caddy,netstats}/**`
  - `docs-ref/SOURCE-README.md` ← `tesnet_server/README.md`
  - `docs-ref/BACKLOG.md` ← `tesnet_server/BACKLOG.md`
  - `docs-ref/server_access-README.md` ← `tesnet_server/server_access/README.md`
  - `docs-ref/{CREDENTIALS,access}.txt.example` ← `tesnet_server/…`
  - `docs-ref/QA/*` ← `tesnet_server/QA/*`
  - other `docs-ref/*.md` ← `tesnet_server/docs/*.md`

- [ ] **Step 1: Append the assertions**

```bash
cat >> recovery-kit/tools/required-content.txt <<'EOF'
121299-testnet-neva/README.md|103\.169\.206\.10
121299-testnet-neva/README.md|52\.76\.170\.251
121299-testnet-neva/README.md|quorum.*3
121299-testnet-neva/recreate.md|validator3_reset_remote\.sh
121299-testnet-neva/recreate.md|hara-quarterly-reset-key
121299-testnet-neva/recreate.md|host\.docker\.internal:5797
121299-testnet-neva/recreate.md|DOCKER-USER
121299-testnet-neva/recreate.md|sync-mode=FULL
121299-testnet-neva/recreate.md|repo-derived — verify before cutover
121299-testnet-neva/scripts/config/genesis.json.template|121299
121299-testnet-neva/scripts/ops/cleanup_quarterly_reset.sh|103\.169\.206\.10|HOST_B
EOF
```

- [ ] **Step 2: Run to verify it fails**

Run: `bash recovery-kit/tools/verify-kit.sh`
Expected: 11 `FAIL: required file missing: 121299-testnet-neva/…`, `verify-kit: 11 problem(s)`.

- [ ] **Step 3: Copy with `git archive`, then normalize CRLF**

The Blockchain blobs themselves contain CRLF (139 in `cleanup_quarterly_reset.sh`), so this step is mandatory.

```bash
SRC=/c/Projects/claude_projects/_external/blockchain
DST=recovery-kit/121299-testnet-neva
TMPX="$(mktemp -d)"
git -C "$SRC" archive testnet-final tesnet_server | tar -x -C "$TMPX"
T="$TMPX/tesnet_server"
mkdir -p "$DST/scripts/ops" "$DST/scripts/config" "$DST/host-a-deps" "$DST/docs-ref/QA"
cp -r "$T/validator3" "$DST/scripts/validator3"
cp -r "$T/gateway"    "$DST/scripts/gateway"
cp "$T"/scripts/*.sh  "$DST/scripts/ops/"
cp "$T/config/genesis.json.template" "$DST/scripts/config/"
cp -r "$T/caddy"    "$DST/host-a-deps/caddy"
cp -r "$T/netstats" "$DST/host-a-deps/netstats"
cp "$T"/docs/*.md   "$DST/docs-ref/"
cp "$T/README.md"   "$DST/docs-ref/SOURCE-README.md"
cp "$T/BACKLOG.md"  "$DST/docs-ref/BACKLOG.md"
cp "$T/server_access/README.md" "$DST/docs-ref/server_access-README.md"
cp "$T/CREDENTIALS.txt.example" "$T/access.txt.example" "$DST/docs-ref/"
cp "$T/QA/STRESS_TEST_RESULTS.md" "$DST/docs-ref/QA/"
rm -rf "$TMPX"
find "$DST" -type f \( -name '*.sh' -o -name '*.md' -o -name '*.json' -o -name '*.template' -o -name '*.yml' -o -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.sql' -o -name '*.toml' -o -name '*.css' -o -name '*.example' -o -name 'Dockerfile' -o -name 'Caddyfile' \) -exec sed -i 's/\r$//' {} +
# Count CRs with tr (Git-for-Windows grep hides CR in scripts — see verify-kit check 2):
find "$DST" -type f -exec cat {} + | tr -dc '\r' | wc -c   # Expected: 0
```

- [ ] **Step 4: Scan and triage**

Same procedure as Task 5 Step 4. Pre-check on 2026-10-12 found only genesis fields and the `<admin-email>`/`<redacted>` placeholders, so expect `no secret hits`. Note: `validator3/config/genesis.json` `extraData` encodes the **pre-fix validator1 address `0x7ac4c91a…`**, which was corrected live on 2026-09-11 by vote and not by changing genesis. Record it in README as `repo-derived — verify before cutover`.

- [ ] **Step 5: Write `121299-testnet-neva/README.md`**

Facts:
- Chain 121299 "HARA Testnet". 3 validators, **quorum 3 of 3 (0% fault tolerance)**. 5s blocks. Free gas (`gasPriceGuard`). `target-gas-limit` 10G. `profile=ENTERPRISE`, SNAP + BONSAI trie-log pruning, `tx-pool=sequenced`, `discovery-enabled=false`.
- Quarterly wipe: cron `0 3 1 1,4,7,10 *` UTC.
- **NevaCloud Host B `<TESTNET_HOSTB_IP>`** (3 vCPU / 3.8 GB, root, SSH 22): validator3 (sealer + failover RPC, Besu RPC 5797 / WS 5798, P2P 30305), gateway (Express `:4000`/`:4001`), dashboard (Next.js `:4002`, includes explorer pages), Postgres (`127.0.0.1:5432`), Redis.
- **Stays on AWS Host A `<TESTNET_HOSTA_IP>`** (SSH 4422): validator1 (primary RPC) + validator2 + Caddy (all `*.mampang.haratoken.app` TLS) + netstats. That is why `host-a-deps/` is included.
- Faucet `0x5b701b7c9ef5d641e9270a6f19ed9be9b6a1830b`, 10 per claim / 24h.
- Repo configs are explicitly **not ground truth** (TESTNET_ARCHITECTURE §2.3: live mem_limits and RPC flags differ), so flag them.

- [ ] **Step 6: Write `121299-testnet-neva/recreate.md`**

Sections:
1. **validator3 on the new Host B:**
   - Use `scripts/validator3/docker-compose.yml` + `config/config.toml` + `static-nodes.json` (update Host A's static-nodes and validator3's enode IP).
   - Restore `nodekey3` (E15). With a new key, use `keccak256` derivation + add-before-remove, and expect a halt at 2/3 meanwhile.
   - If stuck in a SNAP loop, switch to `sync-mode=FULL` (2026-09-22 lesson). Raise mem_limit per CHANGELOG.
2. **Gateway + dashboard:**
   - `scripts/gateway/docker-compose.yml` (project `hara-tesnet-gateway`; containers `hara-tesnet-gateway{,-dashboard,-postgres,-redis}`).
   - Restore `.env` + DB dump (E15).
   - Primary RPC is Host A `<TESTNET_HOSTA_IP>:5797`; secondary is `host.docker.internal:5797` (validator3); `rpcHealth.ts` handles failover.
   - The ufw rule allows 4000-4002 only from Host A.
3. **Host A changes** (AWS; out of NevaCloud scope but required):
   - Point the Caddy upstreams (`host-a-deps/caddy/Caddyfile`) at the new Host B IP.
   - Update the ufw + AWS SG rule for 5797/5798 to allow the new Host B IP.
   - Netstats firewall is a `DOCKER-USER` iptables rule (`netstats-firewall-restrict.service`); ufw does not apply to it.
4. **Quarterly reset coordination:**
   - `scripts/ops/cleanup_quarterly_reset.sh` (on Host A) SSHes to Host B with `keys/automation/hara-quarterly-reset-key`, a forced command limited to `stop|wipe|start|status`, and runs `validator3_reset_remote.sh` on Host B.
   - That script is **host-only** (E15). Restore it plus the `authorized_keys` forced-command line, and update the Host B IP inside `cleanup_quarterly_reset.sh`.
   - Pre-flight aborts if Host B is unreachable. Test with `status` before the next 1 Jan/Apr/Jul/Oct 03:00 UTC run.
5. **Monitoring:** netstats only. `scripts/ops/hara-block-health-watch.sh` (systemd timer, 5 min) and `hara-mem-watch` are log-only. There is no Prometheus.

Mark sections 1–4 `repo-derived — verify before cutover`.

- [ ] **Step 7: Run to verify it passes**

Run: `BLOCKCHAIN_TESTNET=/c/Projects/claude_projects/_external/blockchain-testnet bash recovery-kit/tools/verify-kit.sh`
Expected: `verify-kit: OK`

- [ ] **Step 8: Commit**

```bash
git add recovery-kit/121299-testnet-neva/ recovery-kit/tools/
git commit -m "docs(recovery-kit): 121299 testnet Host B slice — copied sources + runbooks" -m "git-archive copy of tesnet_server validator3/gateway/scripts/config + Host A deps (caddy, netstats) from Blockchain@testnet-final, CRLF->LF (blobs store CRLF), secret-scanned; quarterly-reset Host A<->B coordination documented." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Orientation README + MANIFEST + full verification

**Files:**
- Create: `recovery-kit/tools/manifest-rows.sh`
- Create: `recovery-kit/README.md`, `recovery-kit/MANIFEST.md`
- Modify: `recovery-kit/tools/required-content.txt`

**Interfaces:**
- Consumes: every earlier task's files and the copy layouts from Tasks 5–6.
- Produces: `MANIFEST.md`, with columns `Kit path | Source | Notes | Flag`. One row per kit file outside `tools/`, and the tools themselves listed in a separate un-enforced section.

- [ ] **Step 1: Write `tools/manifest-rows.sh`**

```bash
#!/usr/bin/env bash
# manifest-rows.sh — print MANIFEST.md rows for every file copied from dattabot/Blockchain.
# Usage: bash recovery-kit/tools/manifest-rows.sh > /tmp/rows.md
set -euo pipefail
KIT="$(cd "$(dirname "$0")/.." && pwd)"
FLAG='repo-derived — verify before cutover'

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
    printf '| `%s` | `%s` | copied via git archive, CRLF→LF | %s |\n' "$rel" "$src" "$FLAG"
  fi
done < <(find ./121212-mainnet-neva ./121299-testnet-neva -type f \( -path '*/scripts/*' -o -path '*/docs-ref/*' -o -path '*/host-a-deps/*' \) -print0 | sort -z)
```

- [ ] **Step 2: Append the assertions**

```bash
cat >> recovery-kit/tools/required-content.txt <<'EOF'
README.md|00-PRE-TEARDOWN-EXTRACTION\.md
README.md|hosts\.env\.example
README.md|verify-kit\.sh
README.md|121212
README.md|121299
README.md|131216
MANIFEST.md|Blockchain@mainnet-final:
MANIFEST.md|Blockchain@testnet-final:
MANIFEST.md|authored
EOF
```

- [ ] **Step 3: Run to verify it fails**

Run: `bash recovery-kit/tools/verify-kit.sh`
Expected: 9 `FAIL: required file missing: README.md` / `MANIFEST.md`, `verify-kit: 9 problem(s)`.

- [ ] **Step 4: Write `README.md` (orientation)**

Sections:
1. What this kit is: the spec §1 purpose, and a link to `docs/superpowers/specs/2026-10-12-nevacloud-recovery-kit-design.md`.
2. The three chains table (chain ID, domains, NevaCloud hosts, dir).
3. **Order of use:**
   1. `00-PRE-TEARDOWN-EXTRACTION.md` (STOP gate + E1–E19).
   2. Fill `hosts.env.example` → `hosts.env` (gitignored by `*.env`).
   3. The per-chain `recreate.md`.
   4. `backup-restore.md`.
4. Conventions: placeholders, the verify flag, reference-vs-copy.
5. How to re-verify: `bash recovery-kit/tools/verify-kit.selftest.sh && BLOCKCHAIN_MAINNET=… BLOCKCHAIN_TESTNET=… bash recovery-kit/tools/verify-kit.sh`.
6. Known limits: no live access (drift is possible), AWS/Azure hosts out of scope, S3 GetObject 403.

- [ ] **Step 5: Write `MANIFEST.md`**

```bash
{
  printf '# recovery-kit MANIFEST\n\nEvery file in the kit, its source, and its verification flag.\n\n'
  printf '| Kit path | Source | Notes | Flag |\n|---|---|---|---|\n'
  for f in README.md 00-PRE-TEARDOWN-EXTRACTION.md secrets-inventory.md hosts.env.example \
           131216-ledger/README.md 131216-ledger/recreate.md 131216-ledger/monitoring.md \
           131216-ledger/backup-restore.md 131216-ledger/scripts-manifest.md \
           121212-mainnet-neva/README.md 121212-mainnet-neva/recreate.md \
           121299-testnet-neva/README.md 121299-testnet-neva/recreate.md; do
    printf '| `%s` | authored (from spec + `deploy/` + Blockchain docs) | — | %s |\n' "$f" \
      "$(case "$f" in *recreate.md|00-*|hosts.env.example) echo 'repo-derived — verify before cutover';; *) echo '—';; esac)"
  done
  bash recovery-kit/tools/manifest-rows.sh
  printf '\n## Tooling (not enforced by check 8)\n\n'
  for t in verify-kit.sh verify-kit.selftest.sh manifest-rows.sh required-content.txt secret-scan.allow; do
    printf -- '- `tools/%s` — authored\n' "$t"
  done
} > recovery-kit/MANIFEST.md
```

Then hand-edit the Notes cell of any file scrubbed in Task 5/6 Step 4 to `scrubbed line <L>`.

- [ ] **Step 6: Full verification**

Run: `bash recovery-kit/tools/verify-kit.selftest.sh`
Expected: `15/15 passed`

Run: `BLOCKCHAIN_MAINNET=/c/Projects/claude_projects/_external/blockchain-mainnet BLOCKCHAIN_TESTNET=/c/Projects/claude_projects/_external/blockchain-testnet bash recovery-kit/tools/verify-kit.sh`
Expected: `verify-kit: OK`. Every copied file is listed, every source exists on its branch, and every repo path exists.

Run: `git status --porcelain recovery-kit | grep -E '\.env$' || echo "no env files staged"`
Expected: `no env files staged`

Optional, if Docker is available: `docker run --rm -v "$PWD:/repo" ghcr.io/gitleaks/gitleaks:v8.21.2 dir /repo/recovery-kit --redact --exit-code 1`
Expected: exit 0. If it is not run locally, CI `secret-scan.yml` runs gitleaks on the PR.

- [ ] **Step 7: Commit**

```bash
git add recovery-kit/
git commit -m "docs(recovery-kit): orientation README + MANIFEST; full kit verified" -m "MANIFEST maps every kit file to its source (authored / deploy/ / Blockchain@<branch>:path) with verify-before-cutover flags; verify-kit + self-test green." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Report**

Summarize for the operator:
- The kit path.
- `verify-kit` results.
- Any scrubbed lines.
- The §0 STOP findings (mainnet 4/7, testnet 2/3).
- The host-only gaps that only extraction can close (E12–E15).

Ask whether to push the branch and open a PR. Do not push without being asked.
