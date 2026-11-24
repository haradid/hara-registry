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

-- Read-only user for Grafana (Postgres datasource)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'grafana_ro') THEN
        CREATE ROLE grafana_ro WITH LOGIN PASSWORD 'GrafanaReadOnly2026!';
    END IF;
END$$;

GRANT CONNECT ON DATABASE hara_gateway TO grafana_ro;
GRANT USAGE ON SCHEMA public TO grafana_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO grafana_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO grafana_ro;
