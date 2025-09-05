-- Init DB for policy service

CREATE TABLE IF NOT EXISTS policies (
  id BIGINT PRIMARY KEY,
  holder TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS outbox (
  id BIGSERIAL PRIMARY KEY,
  aggregate_type TEXT NOT NULL,
  aggregate_id BIGINT NOT NULL,
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Index to help read unprocessed messages
CREATE INDEX IF NOT EXISTS idx_outbox_processed_created_at ON outbox (processed, created_at);
