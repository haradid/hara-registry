# Hara Registry — Documentation

This folder holds all narrative/reference documentation for Hara Registry
(formerly *HaraLedger* / *hara-ledger* — the same system). Operational runbooks
that live next to their code (`deploy/`, `ops/runbooks/`, `.github/`) are **not**
moved here on purpose; they stay coupled to what they operate.

> **Naming note:** "HaraLedger" and "hara-ledger" in older documents refer to
> this same system, renamed **Hara Registry** on 2026-06-01.

## Structure

| Folder | What lives here |
|---|---|
| [`product/`](product/) | **Product** docs — what the system is, for whom, features, phases, cost. |
| [`technical/`](technical/) | **Technical** reference — architecture, contracts, services, APIs, security/PQ. |
| [`guides/`](guides/) | **Developer / integration guides** — how partners build against the chain. |
| [`api/`](api/README.md) | **Developer platform hub** — canonical facts, OpenAPI spec, JSON-RPC reference, and links to the API console + SDKs. |
| [`console/`](console/) | Strata Console plan + intelligence roadmap. |
| [`roadmap/`](roadmap/) | Long-horizon infrastructure & deployment roadmap. |
| [`state/`](state/) | Chronological **session state handoffs** (state-02 → state-07). |
| [`partners/`](partners/) | Live partner-integration handoffs (hara-did onboarding, RPC migration). |
| [`design/`](design/) | "Strata" brand mark — full asset set (static + animated). |
| [`archives/`](archives/) | Superseded-but-historically-important docs (earlier product/technical versions, the original ecosystem blueprint). |
| [`to_be_deleted/`](to_be_deleted/) | Redundant leftovers staged for removal — see the note inside. |

## Key documents (start here)

- **🧭 Developer platform hub (start here for building):** [`api/README.md`](api/README.md)
- **Product & Users manual:** [`product/hara-registry-product-manual.md`](product/hara-registry-product-manual.md)
- **Technical manual (public):** [`technical/hara-registry-technical-manual.md`](technical/hara-registry-technical-manual.md)
- **Developer & Integration manual:** [`guides/hara-registry-developer-integration-manual.md`](guides/hara-registry-developer-integration-manual.md)
- **Interactive API console:** [`../api-console/index.html`](../api-console/index.html) · **SDKs:** [`../sdk/`](../sdk/README.md) (TypeScript · Python · Go)
- **OpenAPI (Trace REST):** [`api/openapi-trace.yaml`](api/openapi-trace.yaml) · **JSON-RPC reference:** [`api/jsonrpc-reference.md`](api/jsonrpc-reference.md)
- **Deep technical reference:** [`technical/TECHNICAL.md`](technical/TECHNICAL.md) · **Security & quantum rationale:** [`technical/audit-security-quantum-performance.md`](technical/audit-security-quantum-performance.md)
- **Latest system state:** [`state/hara-registry-state-07.md`](state/hara-registry-state-07.md)
- **New HARA Ledger assessment (2026-10-12):** [`technical/new-ledger/registry-comparison-2026-10-12.md`](technical/new-ledger/registry-comparison-2026-10-12.md) (old 131216 vs new 121212/121299, with a live testnet benchmark) · [`technical/new-ledger/new-ledger-improvement-plan-2026-10-12.md`](technical/new-ledger/new-ledger-improvement-plan-2026-10-12.md) (21 prioritized actions, P0–P3)

> The production sign-off (`PRODUCTION-READINESS.md`) and the repo entry point
> (`README.md`) intentionally remain at the repository root.
