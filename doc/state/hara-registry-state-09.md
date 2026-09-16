# Hara Registry — Session State Handoff #9 (2026-09-16, session close-out)

**Incremental.** The comprehensive technical state is **`hara-registry-state-08.md`** (same
session, ~1h earlier) — read it for architecture, stack, contract addresses, the model-(c)
integration partners (Atlas/Gapura/Aurum), APIs/schemas, files, and constraints. This file
records only the **repository + credential deltas** finalized after state-08 was written, plus
the carry-forward open items.

---

## 0. What changed since state-08

1. **Canonical repo move completed & synced.** GitHub `main` was pushed to Azure DevOps and the
   two are at **exact parity** (`0b91cc9` = "docs(state): #8 (#71)"; verified GitHub == Azure ==
   local). Commits #66–#71 (which had merged on GitHub after the earlier mirror) are now on Azure.
2. **Local remotes reconfigured** (state-08 said "should re-point" — now done):
   - **`origin` → Azure DevOps** `https://dattabot@dev.azure.com/dattabot/PRODUCT%20HARA%20OS/_git/hara-registry` (canonical). `main` tracks `origin/main`.
   - **`github` → `https://github.com/haradid/hara-registry.git`** (exact canonical URL; backup + the PR history #46–#71).
   - Interactive Azure push/pull now uses **Git Credential Manager** (browser sign-in) — no PAT needed day-to-day.
3. **Azure PAT shredded** (`~/hara-ops/.azdo_pat`, via `shred -u -z`). **Revocation still pending
   in the Azure UI** — the token stays valid until the operator revokes it at
   `https://dev.azure.com/dattabot/_usersSettings/tokens`. (I cannot revoke it: no PAT left to
   auth an API call, and it's an account-settings action behind the operator's Microsoft login.)

## 1. Immediate operator to-dos (from this close-out)

- **Revoke the Azure PAT** in the Azure DevOps tokens UI (above). Shredding removed the local
  copy only; the token itself is still live until revoked.
- **Shred/rotate `~/hara-ops/admin-2026-05-27.json`** — the platform chain-admin key
  (`0x944b…EC329`) is still staged on the laptop from the earlier Atlas/Gapura funding work.
- **Sync state-09 to Azure:** this doc is committed to `github` (scripted pushes to Azure need a
  PAT, which is now gone). Land it on Azure with `git push origin main` (GCM browser prompt) at
  your convenience — after that, GitHub and Azure are back at parity.

## 2. Open items / next priorities (unchanged from state-08 §12 — re-affirmed)

1. **Rotate leaked creds** — Vault root token, GitHub PAT, Kimi key (STILL #1). + revoke the Azure
   PAT (this session), shred the admin-key file, retire anvil#1 funder `0x7099…`.
2. **Nevacloud S3 GetObject 403** — unblock to finish standby + S3-readback DR validation.
3. **Gapura go-live** — deploy `services/gapura-gateway` + its scoped PQAnchorRegistry instance;
   sandbox; Authentik creds; register `did:hara:obj/authority/surveyor`; metering aggregator.
4. **Aurum go-live** — write the Ledger-scoped deploy kit; deploy `services/registry-ledger`;
   sandbox + Aurum fixtures; Numira JWTs + register `did:hara:report/tenant/passport/assay`.
5. **db-electoral** GitHub→Azure migration (last repo). CI: Node-20→24 action bump.

---
*Everything else is unchanged from state-08. Persistent memory (`MEMORY.md`,
`integration-partners.md`, `next-priorities.md`, `secrets-locations.md`) updated to match.*
