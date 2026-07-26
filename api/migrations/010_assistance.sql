-- 010_assistance.sql
-- Assistance programs (spec §3, §7.3).
-- Compliance: program rules are DATA (rules_json), refreshed from source, never
-- hardcoded into logic — because program terms change.

CREATE TABLE assistance_programs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  source      text NOT NULL CHECK (source IN ('nchfa','cplp','mcc','fha','dpa')),
  rules_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX assistance_programs_active_idx ON assistance_programs (active) WHERE deleted_at IS NULL;
CREATE TRIGGER assistance_programs_set_updated_at BEFORE UPDATE ON assistance_programs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE program_matches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    uuid NOT NULL REFERENCES members(id),
  program_id   uuid NOT NULL REFERENCES assistance_programs(id),
  eligible     boolean NOT NULL,
  amount       numeric(14,2),
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
CREATE UNIQUE INDEX program_matches_unique
  ON program_matches (member_id, program_id) WHERE deleted_at IS NULL;
CREATE TRIGGER program_matches_set_updated_at BEFORE UPDATE ON program_matches
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
