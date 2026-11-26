# HARA Atlas → HARA Registry (121299 / 121212): provisioning and confirmation answers

**Date:** 2026-11-26. **Answered from:** `doc/guides/hara-registry-third-party-integration-manual.md` (v2.0), the gateway and node sources copied into `recovery-kit/121212-mainnet-neva/` and `recovery-kit/121299-testnet-neva/` (from `dattabot/Blockchain@mainnet-final` / `@testnet-final`), `doc/guides/atlas-onboarding.md` (the 131216 packet), and live JSON-RPC probes of both public endpoints on 2026-11-26. No secret values appear in this document.

Legend: **DONE** = actioned from the repo. **OPS** = needs a human with gateway-admin or infrastructure access; owner and path given. **DECISION** = a product decision HARA has to make.

---

## 1. Testnet API key for the Atlas tenant (121299)

**Status: OPS. Cannot be issued from this repository.**

- **How keys are issued.** An administrator creates the user and key in the gateway dashboard (`https://dashboard.mampang.haratoken.app`, Next.js admin, pages `users/<id>` and `api-keys`; source `recovery-kit/121299-testnet-neva/scripts/gateway/dashboard/`). The plaintext key is displayed once at creation; the gateway stores only a hash (`api_keys.key_hash`, `db/init/001_init.sql`). There is no self-service registration (manual §3.1). The public endpoint's error text "register a free API key" is a known inconsistency (manual Appendix B item 2).
- **Who approves.** Whoever holds the gateway admin login for the Mampang dashboard (the team operating the Blockchain repo's `tesnet_server/` deployment). The manual routes requests through the "HARA integration contact", which **is not yet defined** anywhere in the operations documentation (Appendix B item 1). See item 6.
- **Sizing.** Per-key defaults come from the schema: `rps_limit = 10`, `daily_quota = 100000` (`001_init.sql` lines 27–28, same on both networks). Both are editable per key in the dashboard; `daily_quota = 0` means unlimited. A JSON-RPC batch counts as **one** request (manual §3.3; the limiter is per HTTP request). For seal-time bursts, batch the anchor and mint transactions and the default is adequate for staging; if you prefer headroom, ask for `rps_limit = 50` when requesting the key.
- **Batch cap.** The gateway enforces a **5 MB body limit** (`express.raw({ limit: '5mb' })`, `gateway/src/server.ts`). I found **no item-count check** in the gateway source; the manual's "≤ 100 items" is guidance (Besu's own default batch ceiling is higher). A two-item batch was accepted live on both networks. Keep transaction-lifecycle calls (`eth_sendRawTransaction`, `eth_getTransactionReceipt`, `eth_getTransactionByHash`, `eth_getTransactionCount`) in their own batches: the router sends lifecycle-only batches to the write node and mixed batches to a read pool (`gateway/src/tx/archiveRouter.ts`; manual §5.6, §6.3).
- **Delivery.** The Registry side has no access to the Atlas Vault (`haraatlas/registry-api-key`) and the new-ledger operations have no Vault of their own. The admin sees the key exactly once, so the agreed channel has to be: the admin writes it straight into the Atlas Vault path if they hold Atlas Vault access, otherwise an out-of-band encrypted hand-off (for example `age`-encrypted to an Atlas-supplied public key). Never via chat, ticket, file, commit or PR.

## 2. Network parameters and genesis (both networks)

**Status: DONE (verified live 2026-11-26 and against genesis in the repo).**

| | Mampang testnet | Mainnet |
|---|---|---|
| Chain ID | `121299` (`0x1d9d3`); `net_version` `121299` | `121212` (`0x1d97c`); `net_version` `121212` |
| HTTP RPC | `https://rpc.mampang.haratoken.app/v1/<API_KEY>` (`/v1/public` for probes only) | `https://rpc.registry.haratoken.app/v1/<API_KEY>` |
| WebSocket | `wss://rpc.mampang.haratoken.app/v1/<API_KEY>` | `wss://rpc.registry.haratoken.app/v1/<API_KEY>` |
| Client (live `web3_clientVersion`) | `besu/v26.6.1/linux-x86_64/openjdk-java-25` | `besu/v26.6.1/linux-x86_64/openjdk-java-25` |
| Block time (live, 20 blocks) | 100 s / 20 = **5 s** (blocks 789,809 → 789,829) | 100 s / 20 = **5 s** (blocks 1,649,191 → 1,649,211) |
| Gas | `eth_gasPrice` `0x0`, `baseFeePerGas` `0x0`, `eth_maxPriorityFeePerGas` `0x0` | same |
| Block gas limit (live) | 10,000,000,000 | 10,000,000,000 |
| QBFT | `blockperiodseconds 5`, `epochlength 30000`, `requesttimeoutseconds 10` | same |
| EVM forks (genesis) | all pre-London forks at block 0, `londonBlock 0`, `shanghaiTime 0`, `zeroBaseFee true` | same |

- **EVM version.** Shanghai (confirmed from genesis `shanghaiTime: 0`). Shanghai is a superset of London, so contracts compiled for London (no `PUSH0`) run unchanged (manual §8.1). `zeroBaseFee: true` is why the London fee market yields `baseFee = 0`.
- **Gas policy.** Zero. Legacy type-0 transactions with `gasPrice = 0` are what the manual recommends (§5.1); a non-zero gas price is rejected by the gateway before it reaches a node (`gateway/src/tx/gasPriceGuard.ts`, error `-32000`), and a batch containing one such item is rejected whole.
- **Pre-funding.** The manual (§5.3) states a zero-balance wallet can deploy and transact; the chain-level reason the 131216 packet required ≥ 1 wei (Besu dropping zero-balance senders) is not reproduced in the new node configuration. I did **not** send a transaction from an empty account during this check, so treat it as a documented behaviour to confirm with one testnet transaction. Fallback is the open testnet faucet at `https://dashboard.mampang.haratoken.app/faucet` (10 HARA, 24 h cooldown per address and IP). Mainnet faucet is allow-listed (2 HARA, human check); ask for allow-listing only if Atlas will transfer value.
- **Genesis for a local fork / CI chain.** Both files are public in this repository and contain no secrets:
  - mainnet: `recovery-kit/121212-mainnet-neva/scripts/config/genesis.json`
  - testnet: `recovery-kit/121299-testnet-neva/scripts/validator3/config/genesis.json` (concrete) and `scripts/config/genesis.json.template` (placeholder `extraData`)
  For a single-node dev chain, keep `config` and `alloc`, and regenerate `extraData` for your own validator (`recovery-kit/121299-testnet-neva/scripts/ops/02_derive_address_and_genesis.sh` shows the procedure). Validator address derivation is `keccak256(uncompressed pubkey)[12:]`; use `besu public-key export-address`.
- **Method surface.** `admin_*` and `txpool_*` return `-32601 Method not available on this endpoint` on `/v1/public` (verified live). `debug_*` / `trace_*` route to the archive node and are subject to the key's entitlements.

## 3. Shared registries on 121299 / 121212

**Status: DECISION for HARA; current fact is NO.**

- No platform contract (`ContractRegistry`, shared `PQAnchorRegistry`, `HaraPalmOil`, `TraceabilityBatchRelay`, …) is deployed on either new network (manual Appendix A table; Appendix B item 6: "today none are deployed or documented"). No deployment plan exists in `doc/technical/new-ledger/` either.
- The 131216 `ContractRegistry` at `0xe7f1…0512` and the shared `PQAnchorRegistry` at `0x8A79…C318` are void with the old chain.
- **Recommendation for MIG-A4:** proceed on **NO**: drop discovery and carry Atlas's own `PQAnchorRegistry` and `ObjectPassport` addresses in configuration, per network. If HARA later deploys a shared `ContractRegistry`, the registration interface Atlas used before (`register(bytes32 name, uint16 version, address addr)` under `REGISTRAR_ROLE`, `name = keccak256("AtlasPQAnchorRegistry")`) is documented in `doc/guides/atlas-onboarding.md` §5 and would be re-announced through the integration contact with the new address.

## 4. Prerequisites for deploying Atlas's own contracts

**Status: DONE (confirmed from configuration). Nothing is needed from Registry ops beyond the API key.**

- **No allow-listing.** No Besu account or transaction permissioning is configured: the testnet validator `config.toml` carries no `permissions-*` flags and the mainnet architecture documentation describes none. Any address may deploy and call.
- **No role grant.** Atlas's own `PQAnchorRegistry` constructor grants `DEFAULT_ADMIN_ROLE`, `ANCHOR_ROLE` and `KEY_ROTATOR_ROLE` to the deployer; there is no shared registry to be granted anything on (item 3).
- **No funding** per manual §5.3, subject to the one-transaction confirmation noted in item 2.
- Things that **do** apply: `gasPrice = 0` or the gateway rejects the transaction; `chainId` 121299 / 121212 in the signature; manage nonces yourself when sending more than one transaction per 5 s block (manual §5.4); a transaction hash is not confirmation, poll the receipt (§5.5); `eth_getLogs` ranges ≤ 1,000 blocks (§6.4). Block gas limit is 10 G, so contract size and deployment gas are not a constraint.

## 5. Testnet lifecycle

**Status: DONE (confirmed from the reset script and policy).**

- **Schedule.** Cron `0 3 1 1,4,7,10 *` UTC on testnet Host A, installed by `scripts/ops/install_cron.sh`; the job is `scripts/ops/cleanup_quarterly_reset.sh` (copies under `recovery-kit/121299-testnet-neva/`). It stops all three validators, wipes each node's `data/` directory and restarts from the same genesis at block 0. `keys/` and `config/` are untouched, so chain ID, validator set and genesis hash are identical after a reset.
- **What survives.** The gateway stack (Postgres, Redis, users, API keys, dashboard) is explicitly **not** touched by the reset (`docs-ref/CLEANUP_POLICY.md`, "Yang TIDAK ikut hilang": API keys remain valid). Faucet claim history lives in the same database, so cooldowns also persist rather than resetting.
- **Expected partner behaviour.** Yes: re-deploy your two contracts after each reset and re-point configuration (manual §11 "Testnet resets"; §13 checklist item "full quarterly-reset re-deployment drill"). Detect a reset from the chain, not the calendar: the script aborts if Host B is unreachable, so a scheduled reset can be skipped. A reliable signal is `eth_getCode(<your contract>) == 0x` or `eth_blockNumber` moving backwards.

## 6. Integration contact

**Status: OPS / DECISION. Not defined today.**

- Manual §14 names "the HARA integration contact assigned at onboarding"; Appendix B item 1 records that **no partner support address or portal exists in the operations documentation**. This is a HARA-side gap and is flagged as such.
- Functionally today: key issuance and limit changes are performed by the gateway dashboard administrator for each network (the team operating the `dattabot/Blockchain` deployments); incident escalation goes to the same team. Monitoring on both networks is log-only (validator health-watch timers, netstats; no pager), so expect best-effort response until an operating-level statement exists (Appendix B item 8).
- The HARA Registry repository maintainer owns the manual and should name the contact (a person plus a shared mailbox or channel) in §14 before the partner-facing copy is published.

---

### Notes for the HARA side (not for the Atlas copy)

- The testnet CHANGELOG still says `besu:26.6.0-RC1` at bootstrap; live is `26.6.1`, so the manual is correct and the CHANGELOG is stale.
- The live gateway blocks `admin_*` and `txpool_*` on `/v1/public` even though the copied `archiveRouter.ts` has no allowlist; the filter lives elsewhere in the deployment. This narrows the "missing method allowlist" finding from the 2026-11-25 security review to the source copy, not production.
- Items 1 and 6 are the same gap: there is no named owner for partner key issuance. Until one exists, every partner request lands with whoever holds the dashboard admin login.
