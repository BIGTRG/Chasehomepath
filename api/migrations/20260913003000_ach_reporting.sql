-- ACH auto-draft as the default payment method (Deon, 2026-09-12) + payment-reporting hook.
ALTER TABLE subscriptions ADD COLUMN payment_method_type text NOT NULL DEFAULT 'card' CHECK (payment_method_type IN ('card','bank'));

-- Payment reporting: each on-time plan payment becomes a reportable event once the member opts in.
-- Furnishing itself happens through an adapter (PAYMENT_REPORTING_ADAPTER); nothing leaves without consent.
ALTER TABLE members ADD COLUMN payment_reporting_opt_in_at timestamptz;
ALTER TABLE members ADD COLUMN payment_reporting_consent_text text;

CREATE TABLE payment_reporting_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id      uuid NOT NULL REFERENCES members(id),
  payment_id     uuid NOT NULL REFERENCES payments(id),
  period_start   date NOT NULL,
  period_end     date NOT NULL,
  amount_cents   integer NOT NULL,
  paid_on        date NOT NULL,
  due_on         date NOT NULL,
  on_time        boolean NOT NULL,
  status         text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','acknowledged','failed','withheld')),
  adapter        text,
  external_ref   text,
  error          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX payment_reporting_events_payment ON payment_reporting_events (payment_id);
CREATE INDEX payment_reporting_events_status ON payment_reporting_events (status) WHERE status = 'queued';
CREATE TRIGGER payment_reporting_events_set_updated_at BEFORE UPDATE ON payment_reporting_events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Readiness engine assigns extra training by content_ref; make it idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS modules_content_ref_unique ON modules (content_ref) WHERE deleted_at IS NULL;
