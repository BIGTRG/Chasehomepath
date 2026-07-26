-- 007_education.sql
-- Education: modules and per-member assignments (spec §3, Phase 6 fills lock/unlock logic).

CREATE TABLE modules (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  phase        text NOT NULL CHECK (phase IN ('before','during','after')),
  duration_min integer CHECK (duration_min >= 0),
  content_ref  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
CREATE INDEX modules_phase_idx ON modules (phase) WHERE deleted_at IS NULL;
CREATE TRIGGER modules_set_updated_at BEFORE UPDATE ON modules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE module_assignments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id         uuid NOT NULL REFERENCES members(id),
  module_id         uuid NOT NULL REFERENCES modules(id),
  status            text NOT NULL DEFAULT 'locked'
                      CHECK (status IN ('locked','available','done')),
  unlock_condition  jsonb,      -- data-driven gate evaluated by the plan engine
  completed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE UNIQUE INDEX module_assignments_unique
  ON module_assignments (member_id, module_id) WHERE deleted_at IS NULL;
CREATE INDEX module_assignments_member_idx ON module_assignments (member_id) WHERE deleted_at IS NULL;
CREATE TRIGGER module_assignments_set_updated_at BEFORE UPDATE ON module_assignments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
