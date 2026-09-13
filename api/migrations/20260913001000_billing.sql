-- Billing: monthly plan subscriptions + pay-per-session 1:1 counseling.
-- Fee model approved 2026-09-12: education and planning toward homeownership (not
-- credit repair). Plan fees are MONTHLY, cancel anytime. Counseling is an
-- independent add-on on every tier, billed per 45-minute session. Nothing bundled.
-- Processor-agnostic: `processor` + `processor_*` refs let Stripe be swapped.

CREATE TABLE billing_plans (
  code           text PRIMARY KEY,                  -- steady | focused | express
  name           text NOT NULL,
  target_months  smallint NOT NULL CHECK (target_months > 0),
  price_cents    integer NOT NULL CHECK (price_cents >= 0),
  interval       text NOT NULL DEFAULT 'month' CHECK (interval IN ('month')),
  tagline        text NOT NULL DEFAULT '',
  features       jsonb NOT NULL DEFAULT '[]'::jsonb,
  highlight      boolean NOT NULL DEFAULT false,
  sort_order     smallint NOT NULL DEFAULT 0,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER billing_plans_set_updated_at BEFORE UPDATE ON billing_plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO billing_plans (code, name, target_months, price_cents, tagline, features, highlight, sort_order) VALUES
  ('steady',  'Steady',  12, 14900, 'Target: 12 months',
   '["Full HomePath plan and six tracks","AI guidance and dispute-letter drafting","Marketplace and lender-ready file","1:1 counseling at $89 per session"]', false, 1),
  ('focused', 'Focused',  9, 18900, 'Target: 9 months',
   '["Everything in Steady","Faster milestone schedule","Priority specialist response","1:1 counseling at $89 per session"]', false, 2),
  ('express', 'Express',  6, 24900, 'Target: 6 months',
   '["Everything in Focused","Six-month milestone schedule","Fastest specialist response","1:1 counseling at $89 per session"]', true, 3);

-- Per-session counseling price lives in config (single row) so HQ can change it.
CREATE TABLE billing_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO billing_settings (key, value) VALUES
  ('session', '{"priceCents": 8900, "durationMin": 45, "name": "1:1 counseling session"}'),
  ('terms_version', '"2026-09-13"');

CREATE TABLE subscriptions (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id                 uuid NOT NULL REFERENCES members(id),
  plan_code                 text NOT NULL REFERENCES billing_plans(code),
  status                    text NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active','past_due','cancelled')),
  price_cents               integer NOT NULL,            -- locked at signup
  processor                 text NOT NULL,               -- mock | stripe
  processor_customer_id     text,
  processor_subscription_id text,
  payment_method_label      text,                        -- "Visa ending 4242"
  current_period_start      timestamptz NOT NULL DEFAULT now(),
  current_period_end        timestamptz NOT NULL,
  cancel_at_period_end      boolean NOT NULL DEFAULT false,
  cancelled_at              timestamptz,
  -- FTC negative-option rule: keep proof of what the member agreed to.
  consent_text              text NOT NULL,
  consent_terms_version     text NOT NULL,
  consent_at                timestamptz NOT NULL DEFAULT now(),
  consent_ip                inet,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  deleted_at                timestamptz
);
-- One live subscription per member.
CREATE UNIQUE INDEX subscriptions_member_live ON subscriptions (member_id)
  WHERE deleted_at IS NULL AND status <> 'cancelled';
CREATE INDEX subscriptions_member_idx ON subscriptions (member_id) WHERE deleted_at IS NULL;
CREATE INDEX subscriptions_processor_idx ON subscriptions (processor_subscription_id);
CREATE TRIGGER subscriptions_set_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE payments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id        uuid NOT NULL REFERENCES members(id),
  subscription_id  uuid REFERENCES subscriptions(id),
  kind             text NOT NULL CHECK (kind IN ('subscription','session')),
  amount_cents     integer NOT NULL CHECK (amount_cents >= 0),
  currency         text NOT NULL DEFAULT 'usd',
  status           text NOT NULL DEFAULT 'succeeded'
                     CHECK (status IN ('pending','succeeded','failed','refunded')),
  description      text NOT NULL,
  processor        text NOT NULL,
  processor_ref    text,                                  -- charge / invoice id
  failure_reason   text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_member_idx ON payments (member_id, created_at DESC);
CREATE UNIQUE INDEX payments_processor_ref_unique ON payments (processor, processor_ref)
  WHERE processor_ref IS NOT NULL;
CREATE TRIGGER payments_set_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Paid 1:1 counseling sessions. Each maps to an appointment (the calendar row) and a payment.
CREATE TABLE counseling_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id       uuid NOT NULL REFERENCES members(id),
  appointment_id  uuid NOT NULL REFERENCES appointments(id),
  payment_id      uuid REFERENCES payments(id),
  price_cents     integer NOT NULL,
  duration_min    smallint NOT NULL DEFAULT 45,
  topic           text,
  status          text NOT NULL DEFAULT 'booked'
                    CHECK (status IN ('booked','completed','cancelled','refunded')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX counseling_sessions_member_idx ON counseling_sessions (member_id, created_at DESC);
CREATE TRIGGER counseling_sessions_set_updated_at BEFORE UPDATE ON counseling_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Raw processor webhook log (idempotency + audit).
CREATE TABLE billing_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processor     text NOT NULL,
  event_id      text NOT NULL,
  event_type    text NOT NULL,
  payload       jsonb NOT NULL,
  processed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX billing_events_unique ON billing_events (processor, event_id);

-- Team role editor (screen 24): managers set title + per-specialist capacity target.
ALTER TABLE staff ADD COLUMN capacity_target smallint NOT NULL DEFAULT 12 CHECK (capacity_target BETWEEN 1 AND 60);
