-- Onboarding v2 (Deon, 2026-09-12 23:39): fewer steps, counselor named Maren,
-- virtual counselor meetings, scheduled training with a pass check.

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_type_check;
ALTER TABLE appointments ADD CONSTRAINT appointments_type_check CHECK (type IN ('in_person','video','call','virtual'));
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS counselor_kind text NOT NULL DEFAULT 'person'
  CHECK (counselor_kind IN ('person','virtual'));

-- A guided meeting with the virtual counselor. Agenda is generated from the member's
-- file at start; completion marks the linked consultation appointment completed.
CREATE TABLE IF NOT EXISTS virtual_meetings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id       uuid NOT NULL REFERENCES members(id),
  appointment_id  uuid NOT NULL REFERENCES appointments(id),
  status          text NOT NULL DEFAULT 'started' CHECK (status IN ('started','completed','abandoned')),
  agenda          jsonb NOT NULL,
  recommended     jsonb NOT NULL DEFAULT '[]'::jsonb,
  chosen_plan     text,
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS virtual_meetings_member_idx ON virtual_meetings (member_id, started_at DESC);
CREATE TRIGGER virtual_meetings_set_updated_at BEFORE UPDATE ON virtual_meetings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Credit monitoring enrollment (SmartCredit) captured in-flow.
CREATE TABLE IF NOT EXISTS credit_monitoring_enrollments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    uuid NOT NULL REFERENCES members(id),
  provider     text NOT NULL DEFAULT 'smartcredit',
  status       text NOT NULL DEFAULT 'enrolled' CHECK (status IN ('enrolled','linked','declined')),
  external_ref text,
  enrolled_at  timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, provider)
);
CREATE TRIGGER credit_monitoring_enrollments_set_updated_at BEFORE UPDATE ON credit_monitoring_enrollments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Scheduled training: one lesson per slot, member approves the schedule, alert at start,
-- lesson ends in a pass check. Modules complete only on pass.
CREATE TABLE IF NOT EXISTS training_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id     uuid NOT NULL REFERENCES members(id),
  module_id     uuid NOT NULL REFERENCES modules(id),
  scheduled_at  timestamptz NOT NULL,
  status        text NOT NULL DEFAULT 'proposed'
                  CHECK (status IN ('proposed','approved','passed','failed','missed','rescheduled')),
  approved_at   timestamptz,
  alerted_at    timestamptz,
  attempts      smallint NOT NULL DEFAULT 0,
  last_score    smallint,
  passed_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX IF NOT EXISTS training_sessions_member_idx ON training_sessions (member_id, scheduled_at) WHERE deleted_at IS NULL;
CREATE TRIGGER training_sessions_set_updated_at BEFORE UPDATE ON training_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Member training preferences (approved schedule window).
ALTER TABLE members ADD COLUMN IF NOT EXISTS training_pref jsonb;
