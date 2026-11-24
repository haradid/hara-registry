CREATE TABLE alert_recipients (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email      VARCHAR(255) NOT NULL UNIQUE,
    severity   VARCHAR(20) NOT NULL DEFAULT 'all'
                 CHECK (severity IN ('all', 'critical', 'warning')),
    active     BOOLEAN NOT NULL DEFAULT true,
    note       TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON alert_recipients (active, severity);

-- Catatan: cloud_1 punya provisioning role read-only untuk Grafana di sini (grafana_ro)
-- dengan password HARDCODED dan nama database yang beda dari testnet ini (hara_gateway
-- vs hara_tesnet_gateway) — dihapus 2026-08-27 karena testnet ini tidak jalankan Grafana
-- terhadap Postgres ini, dan password hardcoded di file yang ke-commit adalah masalah
-- keamanan. Kalau nanti benar-benar perlu akses read-only Grafana ke DB ini, buat role
-- baru dengan password random (generate saat itu, taruh di .env, JANGAN hardcode di SQL).
