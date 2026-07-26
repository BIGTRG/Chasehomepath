-- 015_homeowner.sql
-- Homeowner mode (spec §4.16, §9 Phase 13): post-purchase surface. Value tracking here is a
-- simple estimate — the full property valuation product is explicitly out of v1 (spec §12).

CREATE TABLE homeownerships (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id         uuid NOT NULL REFERENCES members(id),
  listing_id        uuid REFERENCES listings(id),
  address           text,
  purchase_price    numeric(14,2) NOT NULL CHECK (purchase_price >= 0),
  purchase_date     date NOT NULL DEFAULT CURRENT_DATE,
  mortgage_balance  numeric(14,2) CHECK (mortgage_balance >= 0),
  interest_rate     numeric(6,4) CHECK (interest_rate >= 0),   -- stored as a fraction, e.g. 0.0675
  monthly_escrow    numeric(14,2) CHECK (monthly_escrow >= 0),
  monthly_taxes     numeric(14,2) CHECK (monthly_taxes >= 0),
  monthly_insurance numeric(14,2) CHECK (monthly_insurance >= 0),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE UNIQUE INDEX homeownerships_member_unique ON homeownerships (member_id) WHERE deleted_at IS NULL;
CREATE TRIGGER homeownerships_set_updated_at BEFORE UPDATE ON homeownerships
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE maintenance_tasks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id      uuid NOT NULL REFERENCES members(id),
  label          text NOT NULL,
  category       text,
  due_date       date,
  cadence_months smallint CHECK (cadence_months >= 0),
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done')),
  completed_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);
CREATE INDEX maintenance_tasks_member_idx ON maintenance_tasks (member_id) WHERE deleted_at IS NULL;
CREATE TRIGGER maintenance_tasks_set_updated_at BEFORE UPDATE ON maintenance_tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
