CREATE TABLE IF NOT EXISTS smartcredit_clicks (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  click_count INTEGER NOT NULL DEFAULT 1,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_clicked TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sc_clicks_user ON smartcredit_clicks(user_id);
