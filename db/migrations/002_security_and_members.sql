CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique ON users(phone) WHERE phone IS NOT NULL AND phone <> '';
CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_unique ON products(tenant_id, barcode) WHERE barcode IS NOT NULL AND barcode <> '';
CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx ON auth_sessions(expires_at);
CREATE TABLE IF NOT EXISTS oauth_accounts (
  provider TEXT NOT NULL, subject TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id),
  created_at BIGINT NOT NULL, PRIMARY KEY(provider, subject), UNIQUE(provider, user_id)
);
CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash TEXT PRIMARY KEY, nonce TEXT NOT NULL, verifier TEXT NOT NULL,
  browser_hash TEXT NOT NULL, user_id TEXT REFERENCES users(id), expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS oauth_states_expiry_idx ON oauth_states(expires_at);
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL, UNIQUE(tenant_id, id)
);
CREATE INDEX IF NOT EXISTS customers_tenant_idx ON customers(tenant_id);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS request_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_iterations BIGINT NOT NULL DEFAULT 600000;
