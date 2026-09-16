# Hara Registry — Session State Handoff #8 (2026-09-16)

Supersedes `hara-registry-state-07.md` (2026-06-03). This is the comprehensive technical
state after a long multi-phase session. Everything structural in state-07 (7-VPS split
topology, QBFT Besu chain 131216, DR pillars, PITR, console) **still holds**; this doc adds
the large deltas since: the **developer platform**, **integration-partner onboarding
(Atlas, Gapura, Aurum)**, **operator SSH onboarding**, the **Azure DevOps migration**, and
**CI hardening**. Chain facts of record live in `doc/api/hara-registry-facts.md`.

---

## 0. TL;DR — what changed since state-7

1. **CANONICAL REPO IS NOW AZURE DEVOPS:** `https://dev.azure.com/dattabot/PRODUCT%20HARA%20OS/_git/hara-registry`
   (org `dattabot`, project **PRODUCT HARA OS**). Migrated from GitHub this session. **GitHub
   `github.com/haradid/hara-registry`** (transferred from `imronzuhri-svg/…`, which still redirects) holds
   this session's PR history #46–#70 and is still this local clone's `origin`. **Going forward, work
   targets Azure** — the local `origin` should be re-pointed to the Azure clone URL
   (`https://dattabot@dev.azure.com/dattabot/PRODUCT%20HARA%20OS/_git/hara-registry`), and any GitHub-side
   commits (incl. this state doc) synced across. Sibling repos also on Azure: hara-exchange, hara-did,
   hara-atlas (same PRODUCT HARA OS project); halal-passport (project PRODUCT HALAL PASSPORT). Still on
   GitHub: db-electoral (migration pending), erudio_flow (staying).
2. **Developer platform shipped** — product/technical/developer manuals, hosted interactive API
   console (`explorer.ledger.haratrust.io/api-console/`), OpenAPI + JSON-RPC reference, and core SDKs
   (TS/Python/Go) under `sdk/`. Go-SDK build wired into CI (#59). Canonical facts doc
   `doc/api/hara-registry-facts.md`.
3. **Three integration partners onboarded, all via the same "model (c)" pattern** (each gets its
   **own** PQAnchorRegistry instance — never the shared platform one):
   - **Atlas** — funded on-chain + `REGISTRAR_ROLE`; deploys its own instance.
   - **Gapura** (EUDR market-access) — HARA-operated **Gapura Gateway** facade; TS+Python SDKs; hybrid
     ECDSA+ML-DSA-65 anchoring; Authentik auth. PRs #66/#67/#69.
   - **Aurum** (tamper-evident credential ledger) — HARA-operated **Registry Ledger** (RFC 6962
     transparency log); TS SDK **with standalone offline proof verifier**; service skeleton. PR #70.
4. **Operator SSH onboarding** — 7 named operators across all 7 hosts (own keys + passwordless sudo);
   reusable kit `deploy/ops/{operator-keygen.bat,operator-keygen.sh,add-operator.sh,remove-operator.sh}`.
   PRs #64/#65. `wg-add-peer.sh` host list corrected to post-migration topology (#61).
5. **Azure DevOps migration** (org `dattabot`) — halal-passport + the HARA-OS repos mirrored; 5 team
   migration docs. (Registry-team ops task, not a chain change.)
6. **CI hardened** — Gitleaks licensed Action → free CLI (org-license wall) (#67); Trivy HIGH-CVE gate
   cleared via pnpm overrides + one OS allowlist (#68).
7. **Top open item UNCHANGED and still #1: rotate leaked creds** (Vault root token, GitHub PAT, Kimi
   key) — plus the Nevacloud S3 GetObject-403 DR readback blocker from state-6/7.

---

## 1. Architecture (current)

Topology unchanged from state-7 (7 Nevacloud VPSes, split plane). Mesh + public IPs:

| Host | Mesh IP | Public IP | Role |
|---|---|---|---|
| hara-v1..v4 | 10.43.0.11–14 | 202.155.18.234 / 103.169.206.46 / 103.169.206.127 / 160.19.166.23 | Besu QBFT validators |
| hara-rpc-1 | 10.43.0.21 | 103.169.206.237 | RPC tier (rpc-write + 2× rpc-read + HAProxy) |
| hara-stateless-2 | 10.43.0.25 | 103.169.206.239 | services + observability + edge (Caddy) |
| hara-stateful | 10.43.0.40 | 103.67.244.250 | Vault / Postgres / Redis / MinIO |
| hara-did-stg (partner) | 10.43.0.50 | 103.67.244.109 | hara-did — **Atlas runs on this same box** (ssh alias `atlas-box`, user root) |

**Integration-partner plane (NEW).** The platform anchors chain-event ranges via the shared
`PQAnchorRegistry`. Each integration partner instead runs its **own** PQAnchorRegistry instance
(model c) behind a **HARA-operated facade** that holds the partner's ANCHOR_ROLE + ML-DSA-65 keys:

```
 partner apps ──HTTPS+token──> HARA-operated facade ──recordAnchor──> partner's OWN PQAnchorRegistry
 (Gapura consoles/backend;      (Gapura Gateway :8930;                (chain 131216; distinct instance,
  Aurum backend + auditors)      Registry Ledger :8940)               registered under a distinct name)
```
Facades never anchor into the shared `0x8A79…C318` (guarded in code). Partners send **hashes + DIDs
only** — never geometry/PII/tenant payloads. Anchoring is hybrid **ECDSA (consensus) + ML-DSA-65 (PQ
commitment, off-chain sig blob)**; there is no external second chain.

---

## 2. Stack

- **Chain:** Hyperledger Besu QBFT, chain id **131216**, gasPrice **0**, legacy (type-0) txs only, EVM
  London (no PUSH0), instant finality, quorum 3/4. Prefund ≥1 wei before first tx; check
  `receipt.status==0x1`.
- **Contracts (Solidity ^0.8.26, Foundry):** AnchorRegistry (legacy), ContractRegistry, GovernanceContract,
  HaraPalmOil (ERC-1155), IssuerRegistry, PQAnchorRegistry, TraceabilityBatchRelay. **No RevocationRegistry
  contract exists** (only IssuerRegistry) — status/revocation is served off-chain by the Registry Ledger.
- **Services (`services/`, pnpm workspace, Node 22/TS):** shared, signer, broadcaster, migrate, indexer,
  rpc-cache, anchor-worker. **Standalone (own node_modules, NOT in the workspace):** `gapura-gateway`,
  `registry-ledger`. Fastify + viem + @noble/{hashes,post-quantum,curves} + pino + jose (JWT).
- **SDKs (`sdk/`):** core registry SDKs `sdk/{typescript,python,go}`; partner SDKs
  `sdk/gapura/{typescript,python}` (@hara/gapura-sdk, hara-gapura), `sdk/aurum/typescript`
  (@hara/registry-ledger-sdk). All TS SDKs: ESM, Node 18+, global fetch, **zero runtime deps**,
  `typescript` the only devDep.
- **Console:** Vite/React SPA + Node/Fastify API (Postgres-backed, scrypt hashing, httpOnly+Secure session
  cookies, RBAC viewer<operator<approver<owner). User management added earlier this session.
- **Edge:** Caddy TLS (on hara-stateless-2) fronting rpc/explorer/grafana/trace/console + `/api-console/`
  + `/capi/*` same-origin proxies.
- **Contract addresses (chain 131216):** PQAnchorRegistry (shared) `0x8A791620dd6260079BF849Dc5567aDC3F2FdC318`
  · ContractRegistry `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` · HaraPalmOil `0xa513E6E4b8f2a923D98304ec87F64353C4D5C853`
  · TraceabilityBatchRelay `0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6` · GovernanceContract `0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9`
  · AnchorRegistry (legacy) `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0`.
- **Key accounts:** platform admin (DEFAULT_ADMIN + all roles, re-keyed 2026-05-28) =
  `0x944b237097A03E1e8CdE8A0F46605506319EC329` (in Vault `secret/haraledger/admin-keys/admin-2026-05-27`
  + password manager; ~8799 HARA). Anvil #1 `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` is the genesis
  funder (~9990 HARA) but is the **well-known public anvil key — retire/sweep it** (holds no roles).

## 3. Chain conventions (record)

- Reads → `https://rpc.ledger.haratrust.io/read/` (rpc-cache-backed); writes → `…/write/`; WS `…/ws`.
  **Trailing slash is mandatory** on the public `/read/` `/write/` paths (Caddy `handle /read/*`). In-mesh:
  `http://10.43.0.21:8545/rpc/{read,write}` (HAProxy strips, slash optional).
- `PQAnchorRegistry.recordAnchor(bytes32 merkleRoot, bytes32 sha3Root, uint64 blockFrom, uint64 blockTo,
  uint64 eventCount, bytes32 anchorChain, bytes32 pqSignatureHash) → uint256 anchorId` — `ANCHOR_ROLE`;
  `pqSignatureHash = keccak256(ml_dsa65.sign(canonicalMessage))` MUST be non-zero. `currentPQKeyHash =
  keccak256(1952-byte ML-DSA-65 pubkey)`. Roles: `ANCHOR_ROLE=keccak256("ANCHOR_ROLE")`,
  `KEY_ROTATOR_ROLE`, `REGISTRAR_ROLE` (ContractRegistry). `roleAdmin` = `DEFAULT_ADMIN_ROLE`.
- `ContractRegistry.register(bytes32 name, uint64 version, address addr)` — **`name = keccak256("<utf8>")`**
  (NOT formatBytes32String); first version auto-activates. Partner instances registered under **distinct
  names**: `AtlasPQAnchorRegistry`, `GapuraPQAnchorRegistry`, `RegistryLedgerAnchor`.

## 4. Integration partners (NEW — the model-(c) pattern)

| Partner | Facade (HARA-operated) | Auth | SDK(s) | On-chain | Status |
|---|---|---|---|---|---|
| **Atlas** | — (uses the low-level SDK directly) | — | core SDKs | own PQAnchorRegistry (`AtlasPQAnchorRegistry`); signer `0xec76fa92b6bcc042b0ccd52a5f64dbc3e8946fa8` funded 1 HARA + `REGISTRAR_ROLE` (verified on-chain) | live on-chain; deploys its own family |
| **Gapura** (EUDR) | `services/gapura-gateway` (Fastify, :8930) | Authentik client-credentials (ADR-0018), scopes anchor/identity/metering | `@hara/gapura-sdk` (TS), `hara-gapura` (Py) | own instance (`GapuraPQAnchorRegistry`); deploy kit `contracts/script/DeployGapuraPQAnchor.s.sol` + `services/gapura-gateway/scripts/derive-pq-key.mjs` + runbook `doc/api/gapura-pq-registry-deploy.md` | contract-complete; Gateway to deploy |
| **Aurum** (credential ledger) | `services/registry-ledger` (Fastify, :8940) | Numira token (JWT, pass-through, `aud=attest.ledger.haratrust.io`) | `@hara/registry-ledger-sdk` (TS) + standalone RFC 6962 proof verifier | own Ledger-scoped instance (`RegistryLedgerAnchor`) anchoring transparency-log tree heads | contract-complete; Ledger to deploy |

**Gapura specifics:** anchor a single digest → `recordAnchor(merkleRoot=sha3Root=digest, eventCount=1,
blockFrom=blockTo=safe head, anchorChain=keccak256("purpose|tenant"), pqSignatureHash)`; `{objectDid,
purpose, digest→anchorId}` live in the Gateway Postgres. Metering spec'd (`atlasDidMints` etc.), build
later. Docs: `doc/api/gapura-integration-guide.md`, `openapi-gapura.yaml`, `numira-gapura-identity-prompt.md`.
Gateway config **refuses the shared registry** (`isGapuraScopedRegistry`, PQ_ANCHOR_REGISTRY defaults to
zero) — fixed in #69.

**Aurum specifics:** RFC 6962/9162 SHA-256 Merkle transparency log per tenant; leaf=SHA256(0x00‖data),
node=SHA256(0x01‖L‖R). Tree heads (Signed Tree Head = {tree_size, root_hash, ts}) anchored via
`recordAnchor(merkleRoot=root, eventCount=tree_size,…)`. Serves **inclusion + consistency** proofs,
offline-verifiable in the SDK (`verifyInclusion`/`verifyConsistency`/`verifySthAnchored`). **Registry owns
status-of-record** (active|superseded|revoked, each change an anchored leaf) **and retention-of-record**
(no-delete-before-expiry; `DELETE`→`409 retention_locked`, the refusal itself anchored). Docs:
`doc/api/aurum-ledger-integration-guide.md`, `openapi-aurum-ledger.yaml`, `numira-aurum-identity-prompt.md`.
SDK verifier passed 544 self-tests; service transparency-log passed 1125; **service→SDK proof interop
verified**.

## 5. APIs & OpenAPI specs (this session)

- `doc/api/openapi-trace.yaml` — Traceability REST (earlier).
- `doc/api/openapi-gapura.yaml` — Gapura Gateway (11 paths): `/anchors` (create/verify), `/anchors/{id}`,
  `/anchors/{id}/status`, `/did/{did}`, `/identities*`, `/metering/*`. RFC 9457 errors; scopes gate each.
- `doc/api/openapi-aurum-ledger.yaml` — Registry Ledger (10 paths): `/attestations` (+`/{id}`,`/proof`,
  `/status`,`/revoke`), `/anchors` (checkpoint) + `/anchors/consistency`, `/evidence` (+`/{id}` GET/PATCH/
  DELETE), `/verify?subject=`. Numira bearer; proof/status reads public.

## 6. Schemas (partner facades)

- **Gapura Gateway (Postgres):** digest→{anchorId, onChainId, objectDid, purpose, txRef, pqKeyHash,
  anchoredAt}; idempotency keys (24h); DID↔Authentik-sub bindings.
- **Registry Ledger (Postgres skeleton; in-memory default):** per-`log_id` append-only leaves; attestations
  (registry_id, subject, issuer, recordType, contentHash, status, leaf_index); status history (anchored
  leaves); evidence (evidence_id, contentHash, retention{until,basis,legalHold}); checkpoints (STH per log).
  DDL in `services/registry-ledger/src/store/postgres.ts`.

## 7. Key files (this session)

- **Partners:** `services/gapura-gateway/**`, `services/registry-ledger/**` (core:
  `transparency-log.ts` RFC 6962, `services/anchor.ts`, `config.ts` with `isLedgerScopedRegistry`).
  `sdk/gapura/{typescript,python}/**`, `sdk/aurum/typescript/**` (`src/verifier.ts` = the offline verifier).
- **Deploy/ops:** `contracts/script/DeployGapuraPQAnchor.s.sol`; `deploy/ops/{operator-keygen.bat,
  operator-keygen.sh,add-operator.sh,remove-operator.sh}`; `deploy/ops/wg-add-peer.sh` (host list fixed).
- **Docs:** `doc/api/{gapura-integration-guide,aurum-ledger-integration-guide,numira-gapura-identity-prompt,
  numira-aurum-identity-prompt,gapura-pq-registry-deploy}.md`; `doc/guides/{operator-access,atlas-onboarding}.md`.
- **CI:** `.github/workflows/{sdk.yml (Go/TS/Py SDK build),secret-scan.yml (gitleaks CLI)}`; `.gitleaks.toml`,
  `.trivyignore` (added CVE-2026-45447); `services/package.json` (pnpm overrides).

## 8. Constraints & gotchas (carry forward — NEW in bold)

- **`@'…'@` is PowerShell here-string syntax — it leaks a stray leading `@` into commit subjects when used
  in the Bash tool. Use `git commit -F <file>` for multi-line messages.** (Hit twice this session.)
- **Repo homes:** canonical = **Azure DevOps** `dattabot/PRODUCT HARA OS/hara-registry`; GitHub
  `haradid/hara-registry` holds PR history #46–#70 and is the current local `origin` (`imronzuhri-svg/…`
  redirects; `gh` canonicalizes to `haradid/…`, so pass `--repo haradid/hara-registry` if a `gh` command
  misresolves). Re-point `origin` to Azure for future work; Azure pushes need a PAT (Code: read/write).
- **Gitleaks Action requires a paid license for org repos** → use the free CLI binary
  (`ghcr.io/gitleaks/gitleaks:v8.21.2 git /repo --redact --exit-code 1`); it auto-loads `.gitleaks.toml`.
- **Trivy gate fails on newly-published CVEs in existing deps** — fix with pnpm `overrides` (in-major bounded)
  + `pnpm install --lockfile-only` (CI=true to skip the interactive purge prompt); OS base-image CVEs go in
  `.trivyignore` with justification.
- **Each partner MUST anchor to its own PQAnchorRegistry instance, never the shared `0x8A79…C318`** —
  facades guard this in code; a mis-set `PQ_ANCHOR_REGISTRY` would couple tenants and break PQ verification.
- **`did:hara` sub-namespaces used by partners are NOT yet registered** in the method spec/resolver:
  Gapura `obj/authority/surveyor`, Aurum `report/tenant/passport/assay`. Numira/HaraDID hand-off prompts written.
- **The laptop has no WireGuard/mesh and can't reach Vault (10.43.0.40:8200)**; it reaches the public
  `/read` `/write` RPC. Sign locally via node + `sdk/typescript/node_modules/viem` (no cast/forge installed).
- Carry-forward from state-7: `systemctl show --value` ignores property order; PITR recovery GUCs ≥ primary;
  hara-stateful `hostname -s`=`localhost`; same-host=container name, cross-host=mesh IP.

## 9. Coding conventions
`set -euo pipefail`; env-var defaulting `${VAR:-default}`; Docker bridge stays 10.42.0.0/24; image refs use
`${IMAGE_REGISTRY}` prefix; TS SDKs zero-runtime-dep. Chain writes are **propose-only from tooling** — build
the exact command, the operator signs with keys. Partner facades keep the ANCHOR_ROLE + PQ keys (Gapura/Aurum
never expose them to callers). See `memory/coding-conventions.md`.

## 10. Unresolved / open items (priority order)

1. **Rotate leaked creds** — Vault root token, GitHub PAT, Kimi key (STILL #1). Also sweep/retire anvil#1
   funder `0x7099…`. Shred laptop-staged secrets (`~/hara-ops/.azdo_pat`, `~/hara-ops/admin-2026-05-27.json`).
2. **Nevacloud S3 GetObject 403** (write-only cred) — DR readback + standby validation blocked; `deploy/ops/
   s3-readback-check.sh` waits on it. Standby VPS + Nevacloud power automation still pending.
3. **Gapura go-live:** deploy `gapura-gateway` + its scoped PQAnchorRegistry instance; sandbox
   `gapura.sandbox.haratrust.io`; Authentik `gapura-backend` client creds; register `did:hara:obj/authority/
   surveyor`; build the metering aggregator.
4. **Aurum go-live:** deploy `registry-ledger` + its Ledger-scoped instance (deploy kit analogous to Gapura's,
   NOT yet written); sandbox seeded with Aurum golden-path fixtures; Numira JWTs (`aud=attest.ledger.haratrust.io`)
   + register `did:hara:report/tenant/passport/assay`.
5. **db-electoral** — last GitHub→Azure repo not yet migrated (needs its Azure project URL).
6. Bump Node-20 GitHub Actions to Node-24; RPC node hang bug (state-7); validator/Vault backups.

## 11. PRs merged this session (all on `main`)
#46 (standby DR) · #47 doc restructure · … · #56 console user mgmt · #57 manuals · #58 API console hosting ·
#59 Go-SDK CI · #60 brand guidelines · #61 wg host-list · #62/#63 Atlas onboarding docs · #64 operator kit ·
#65 operator-access guide · **#66** Gapura guide/OpenAPI/SDKs/Gateway · **#67** Gapura PQ deploy kit + gitleaks
CLI · **#68** Trivy CVE bumps · **#69** Gapura own-registry fix · **#70** Aurum Registry Ledger. (Earlier PRs
#36–#45 admin-merged past the 1-review gate.)

## 12. Next priorities (ordered)
1. Rotate the leaked creds (#1 forever until done) + shred laptop secrets.
2. Unblock Nevacloud S3 GetObject → finish standby + S3-readback DR validation.
3. Gapura go-live (deploy gateway + sandbox + Authentik + namespaces).
4. Aurum go-live (Ledger deploy kit → deploy + sandbox fixtures + Numira namespaces/JWTs).
5. Finish db-electoral Azure migration.
6. CI: Node-24 action bump; keep Trivy/gitleaks green.
