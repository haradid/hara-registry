# Diagram Visual — Arsitektur Mainnet

Diagram ini melengkapi [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) (referensi tertulis
lengkap: spek host, akses SSH, detail konfigurasi) dengan gambaran visual topologi dan
jalur trafik. Dibuat dalam format Mermaid (teks biasa, ter-render otomatis di
GitHub/Azure DevOps, bisa diedit siapa saja tanpa tool khusus). Sinkron dengan kondisi
per **2026-09-30**.

---

## 1. Topologi Host — 3 Cloud Provider

```mermaid
flowchart TB
    subgraph AWS["AWS"]
        V1["validator1<br/><MAINNET_V1_AWS_IP><br/>Besu sealer + HAProxy<br/>+ Prometheus + Grafana<br/>+ Netstats + Caddy"]
        V6["corp1 / validator6<br/><MAINNET_V6_IP><br/>Besu sealer"]
        RPC1["rpc1<br/><MAINNET_RPC1_IP><br/>Besu — write pool PRIMARY"]
        ARC["archive<br/><MAINNET_ARCHIVE_IP><br/>Besu archive + Blockscout"]
    end

    subgraph Azure["Azure"]
        V2["validator2<br/><MAINNET_V2_IP><br/>Besu sealer<br/>(gateway stack STANDBY,<br/>tidak menerima trafik publik)"]
        V7["corp2 / validator7<br/><MAINNET_V7_IP><br/>Besu sealer"]
    end

    subgraph NevaCloud["NevaCloud"]
        V3["validator3<br/><MAINNET_V3_IP><br/>Besu sealer"]
        V4["validator4<br/><MAINNET_V4_IP><br/>Besu sealer"]
        V5["validator5<br/><MAINNET_V5_IP><br/>Besu sealer"]
        RPC2["rpc2-backup + call<br/><MAINNET_CALL_IP><br/>Besu (1 proses gabungan) —<br/>write pool BACKUP + read pool"]
        PROXY["proxy<br/><MAINNET_GATEWAY_IP><br/>nginx + gateway + dashboard<br/>+ Postgres + Redis + hara-status<br/>(PRIMARY publik sejak 2026-09-30)"]
    end

    V1 -. "tunnel SSH (monitoring + akses)" .-> RPC1
    V1 -. "tunnel SSH (monitoring + akses)" .-> RPC2
    V1 -. "tunnel SSH (monitoring)" .-> V6
    V1 -. "tunnel SSH (monitoring)" .-> V7

    PROXY -- "HTTP publik (rpc.*, dashboard.*, health.*)" --> Internet(("Internet"))
    V1 -- "HTTP publik (netstats.*, grafana.*)" --> Internet
    ARC -- "HTTP publik (explorer.*)" --> Internet

    PROXY -- "eth_sendRawTransaction dkk<br/>via HAProxy di validator1" --> V1
```

**Catatan kuorum QBFT**: 7 validator (V1, V2, V3, V4, V5, V6, V7) — toleran 2 node mati
bersamaan tanpa network berhenti produksi block. `rpc1`, `rpc2/call`, `archive`, dan
`proxy` BUKAN validator (tidak ikut menandatangani blok).

---

## 2. Jalur Trafik RPC — Write, Read, Archive

```mermaid
flowchart LR
    Client(["Klien / dApp"])

    subgraph Proxy["Host proxy (<MAINNET_GATEWAY_IP>)"]
        NGINX["nginx<br/>TLS publik (Let's Encrypt)"]
        GW["gateway<br/>archiveRouter.ts:<br/>klasifikasi method"]
    end

    subgraph HAP["HAProxy (validator1)"]
        TXB["rpc_tx_backend<br/>(write)"]
        READB["rpc_read_backend<br/>(read, round-robin)"]
        CALLB["call_backend"]
        ARCB["archive_backend"]
    end

    RPC1N["rpc1<br/>(<MAINNET_RPC1_IP>)"]
    RPC2N["rpc2/call<br/>(<MAINNET_CALL_IP>)"]
    ARCN["archive<br/>nginx rate-limiter → Besu<br/>(<MAINNET_ARCHIVE_IP>)"]

    Client -- "HTTPS" --> NGINX --> GW

    GW -- "eth_sendRawTransaction,<br/>receipt, byHash, nonce (latest/pending)" --> TXB
    GW -- "eth_call, eth_getLogs, dst" --> CALLB
    GW -- "debug_*, trace_*,<br/>state-trie historis" --> ARCB

    TXB -- "PRIMARY" --> RPC1N
    TXB -. "BACKUP (hanya kalau rpc1 down,<br/>3x gagal healthcheck)" .-> RPC2N
    READB -- "round-robin" --> RPC1N
    READB -- "round-robin" --> RPC2N
    CALLB --> RPC2N
    ARCB -- "10rps/burst-20" --> ARCN
```

**Poin penting** (koreksi dari asumsi lama, diverifikasi live 2026-09-30):
- Write pool (`rpc_tx_backend`) **primary+backup**, BUKAN round-robin — `rpc2` cuma
  aktif kalau `rpc1` gagal healthcheck 3x berturut (~15 detik). Tidak ada skenario
  normal di mana 2 node menerima transaksi tulis bersamaan.
- Hanya `rpc_read_backend` (dipakai untuk `eth_call` dkk, BUKAN untuk kirim transaksi)
  yang genuinely round-robin antara `rpc1` dan `rpc2/call`.
- `rpc2` dan `call` sekarang **1 proses Besu yang sama** (sejak 2026-09-30) —
  container standalone `rpc2` sudah dihapus, perannya diserap node `call`.

---

## 3. Status Migrasi Gateway (2026-09-30)

```mermaid
flowchart LR
    DNS["DNS Route53<br/>rpc.* / dashboard.*"]
    OLD["<MAINNET_V2_IP><br/>(gateway lama)<br/>STANDBY — rollback instan"]
    NEW["<MAINNET_GATEWAY_IP><br/>(gateway baru)<br/>PRIMARY — menerima trafik nyata"]

    DNS -- "sudah diarahkan ke sini" --> NEW
    DNS -. "bisa dikembalikan kapan saja<br/>kalau ada masalah" .-> OLD

    style NEW fill:#1a7f37,color:#fff
    style OLD fill:#6e7781,color:#fff
```

Data Postgres tersinkron penuh ke host baru (row count exact match tervalidasi).
Sertifikat TLS asli (Let's Encrypt via certbot, `webroot` authenticator). Detail
lengkap: `BACKLOG.md` dan `docs/STATUS_TERDEPLOY_2026-08-20.md` §24-25.

---

*Sumber data: `docs/ARCHITECTURE.md` (2026-09-29, diperbarui 2026-09-30),
`docs/STATUS_TERDEPLOY_2026-08-20.md` §24-25, verifikasi live SSH+RPC 2026-09-30.*
