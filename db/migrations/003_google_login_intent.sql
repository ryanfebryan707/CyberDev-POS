ALTER TABLE oauth_states
  ADD COLUMN IF NOT EXISTS intent TEXT NOT NULL DEFAULT 'client'
  CHECK (intent IN ('client', 'admin'));
