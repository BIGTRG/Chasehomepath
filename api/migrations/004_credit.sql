-- 004_credit.sql
-- Credit self-help engine (spec §3, §7.1, §8).
-- Compliance: disputes are member-initiated only and never system-created;
-- every dispute row records the actor. Enforced in code + traced in audit_log.

CREATE TABLE credit_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   uuid NOT NULL REFERENCES members(id),
  pulled_at   timestamptz NOT NULL DEFAULT now(),
  source      text NOT NULL,          -- bureau / pull-provider identifier
  raw_ref     text,                   -- ENCRYPTED reference to the raw report (GLBA)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX credit_reports_member_idx ON credit_reports (member_id) WHERE deleted_at IS NULL;
CREATE TRIGGER credit_reports_set_updated_at BEFORE UPDATE ON credit_reports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE credit_items (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id                uuid NOT NULL REFERENCES credit_reports(id),
  creditor                 text,
  type                     text,       -- tradeline type (revolving, installment, collection, ...)
  balance                  numeric(14,2),
  member_recorded_balance  numeric(14,2),
  -- Rules-engine output (deterministic, §7.1). Accuracy-first: never mislabel to pad numbers.
  classification           text CHECK (classification IN ('disputable','accurate')),
  guidance_text            text,       -- honest guidance; NO outcome promises (§8)
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  deleted_at               timestamptz
);
CREATE INDEX credit_items_report_idx ON credit_items (report_id) WHERE deleted_at IS NULL;
CREATE TRIGGER credit_items_set_updated_at BEFORE UPDATE ON credit_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE disputes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_item_id uuid NOT NULL REFERENCES credit_items(id),
  member_id      uuid NOT NULL REFERENCES members(id),
  -- initiated_by: the user who clicked. NON-NULL by design — no system-initiated disputes (§8).
  initiated_by   uuid NOT NULL REFERENCES users(id),
  filed_at       timestamptz NOT NULL DEFAULT now(),
  status         text NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','filed','investigating','resolved','withdrawn')),
  method         text CHECK (method IN ('online','mail','phone')),
  day_count      integer NOT NULL DEFAULT 0 CHECK (day_count >= 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);
CREATE INDEX disputes_member_idx ON disputes (member_id) WHERE deleted_at IS NULL;
CREATE INDEX disputes_item_idx ON disputes (credit_item_id) WHERE deleted_at IS NULL;
CREATE TRIGGER disputes_set_updated_at BEFORE UPDATE ON disputes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
