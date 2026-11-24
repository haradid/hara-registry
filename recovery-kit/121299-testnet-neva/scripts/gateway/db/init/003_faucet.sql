CREATE TABLE faucet_claims (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    address      VARCHAR(42) NOT NULL,
    ip_address   VARCHAR(45),
    amount_wei   NUMERIC(78,0) NOT NULL,
    tx_hash      VARCHAR(66),
    status       VARCHAR(20) NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'sent', 'failed')),
    error        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_faucet_claims_address ON faucet_claims (address, created_at DESC);
CREATE INDEX idx_faucet_claims_ip ON faucet_claims (ip_address, created_at DESC);
