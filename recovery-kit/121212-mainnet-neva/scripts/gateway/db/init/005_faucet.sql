-- Faucet: ported from the standalone Go app (hara-faucet-app) that used to run
-- on its own host/containers. See gateway/dashboard/src/lib/faucetChain.ts for
-- the on-chain whitelist contract interaction this replaces.

CREATE TABLE faucet_claims (
    address       VARCHAR(42) PRIMARY KEY,
    tx_hash       VARCHAR(66),
    signer        VARCHAR(42),
    amount        VARCHAR(64) NOT NULL,
    confirmed     BOOLEAN NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Off-chain mirror of the on-chain whitelist (HaraFaucetWhitelist.sol) — the
-- contract is the actual access-control source of truth; this table just
-- carries human-readable metadata (name/email/note) and an audit trail of the
-- tx that changed each wallet's on-chain status.
CREATE TABLE faucet_recipients (
    wallet        VARCHAR(42) PRIMARY KEY,
    name          VARCHAR(255) NOT NULL DEFAULT 'Unnamed recipient',
    label         VARCHAR(255),
    email         VARCHAR(255),
    expiration    VARCHAR(64),
    note          TEXT,
    allowed       BOOLEAN NOT NULL DEFAULT true,
    tx_hash       VARCHAR(66),
    added_by      VARCHAR(255),
    added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE faucet_activity (
    id            BIGSERIAL PRIMARY KEY,
    type          VARCHAR(32) NOT NULL,
    wallet        VARCHAR(42),
    message       TEXT,
    tx_hash       VARCHAR(66),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_faucet_activity_created ON faucet_activity (created_at DESC);
