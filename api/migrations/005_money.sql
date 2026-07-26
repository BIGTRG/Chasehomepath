-- 005_money.sql
-- Money: bank links, transactions, budget, savings (spec §3, Phase 4 fills the logic).

CREATE TABLE bank_links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id     uuid NOT NULL REFERENCES members(id),
  plaid_item_id text,               -- ENCRYPTED Plaid item id / access token ref (GLBA)
  institution   text,
  status        text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','error','disconnected')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX bank_links_member_idx ON bank_links (member_id) WHERE deleted_at IS NULL;
CREATE TRIGGER bank_links_set_updated_at BEFORE UPDATE ON bank_links
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE transactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   uuid NOT NULL REFERENCES members(id),
  date        date NOT NULL,
  amount      numeric(14,2) NOT NULL,
  category    text,
  merchant    text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX transactions_member_date_idx ON transactions (member_id, date) WHERE deleted_at IS NULL;
CREATE TRIGGER transactions_set_updated_at BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE budget_targets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id      uuid NOT NULL REFERENCES members(id),
  category       text NOT NULL,
  monthly_target numeric(14,2) NOT NULL CHECK (monthly_target >= 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);
CREATE UNIQUE INDEX budget_targets_unique ON budget_targets (member_id, category) WHERE deleted_at IS NULL;
CREATE TRIGGER budget_targets_set_updated_at BEFORE UPDATE ON budget_targets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE savings_goals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id      uuid NOT NULL REFERENCES members(id),
  label          text NOT NULL,
  target_amount  numeric(14,2) NOT NULL CHECK (target_amount >= 0),
  current_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (current_amount >= 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);
CREATE INDEX savings_goals_member_idx ON savings_goals (member_id) WHERE deleted_at IS NULL;
CREATE TRIGGER savings_goals_set_updated_at BEFORE UPDATE ON savings_goals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
