-- Budget setup + credit score history (Deon, 2026-09-13 00:41):
-- "Make sure we have the setup for the budget. They need to set up their bank account
--  solution. They can monitor that. Also monitoring a credit report through SmartCredit
--  needs to be a display, to see the improvements on the app."
CREATE TABLE IF NOT EXISTS credit_score_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   uuid NOT NULL REFERENCES members(id),
  source      text NOT NULL CHECK (source IN ('report','smartcredit','member')),
  bureau      text NOT NULL DEFAULT 'tri-merge',   -- experian | equifax | transunion | tri-merge
  score       integer NOT NULL CHECK (score BETWEEN 300 AND 850),
  recorded_at date NOT NULL DEFAULT CURRENT_DATE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, source, bureau, recorded_at)
);
CREATE INDEX IF NOT EXISTS credit_score_history_member_idx ON credit_score_history (member_id, recorded_at);

ALTER TABLE budget_targets ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'spend'
  CHECK (kind IN ('spend','save'));
ALTER TABLE members ADD COLUMN IF NOT EXISTS budget_setup_at timestamptz;
