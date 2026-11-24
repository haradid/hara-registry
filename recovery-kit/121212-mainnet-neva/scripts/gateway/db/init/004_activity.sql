-- Dashboard-side activity: every admin/user-facing action (user/key management, faucet claims).
CREATE TABLE audit_log (
    id          BIGSERIAL PRIMARY KEY,
    actor       VARCHAR(255),            -- admin email, or 'public' for unauthenticated faucet claims
    action      VARCHAR(64) NOT NULL,    -- e.g. 'user.create', 'apikey.revoke', 'faucet.claim'
    target      VARCHAR(255),            -- e.g. user email, api key prefix, wallet address
    detail      JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_log_created ON audit_log (created_at DESC);

-- RPC-side activity: individual request log (rolling window — see cleanup below),
-- complements the hourly-aggregated usage_hourly table with per-request granularity.
CREATE TABLE rpc_activity_log (
    id           BIGSERIAL PRIMARY KEY,
    api_key_id   UUID REFERENCES api_keys(id) ON DELETE SET NULL,
    key_prefix   VARCHAR(20),
    method       VARCHAR(64),
    status_code  INTEGER,
    duration_ms  INTEGER,
    ip_address   VARCHAR(45),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rpc_activity_created ON rpc_activity_log (created_at DESC);
CREATE INDEX idx_rpc_activity_key ON rpc_activity_log (api_key_id, created_at DESC);
