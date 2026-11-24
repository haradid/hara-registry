CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE admins (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(255) NOT NULL,
    email         VARCHAR(255) UNIQUE NOT NULL,
    organization  VARCHAR(255),
    status        VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','suspended')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_prefix      VARCHAR(20) NOT NULL,
    key_hash        TEXT NOT NULL,
    label           VARCHAR(255),
    rps_limit       INTEGER NOT NULL DEFAULT 10,
    daily_quota     BIGINT NOT NULL DEFAULT 100000,
    status          VARCHAR(20) NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','revoked')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at      TIMESTAMPTZ,
    last_used_at    TIMESTAMPTZ,
    UNIQUE (key_hash)
);
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);

CREATE TABLE usage_hourly (
    id            BIGSERIAL PRIMARY KEY,
    api_key_id    UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    bucket_start  TIMESTAMPTZ NOT NULL,
    method        VARCHAR(64),
    request_count BIGINT NOT NULL DEFAULT 0,
    error_count   BIGINT NOT NULL DEFAULT 0,
    rate_limited_count BIGINT NOT NULL DEFAULT 0,
    UNIQUE (api_key_id, bucket_start, method)
);
CREATE INDEX idx_usage_hourly_key_time ON usage_hourly(api_key_id, bucket_start);

CREATE TABLE usage_daily_quota (
    api_key_id   UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    usage_date   DATE NOT NULL,
    request_count BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (api_key_id, usage_date)
);
