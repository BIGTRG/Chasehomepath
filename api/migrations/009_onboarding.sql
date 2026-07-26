-- 009_onboarding.sql
-- Workforce onboarding (spec §3, §8 onboarding gate + license verification, Phase 12).
-- Compliance: no staff/partner touches a client until the case is complete and
-- all license_records are verified.

CREATE TABLE onboarding_cases (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id),
  role_type   text NOT NULL CHECK (role_type IN ('w2','contractor','partner')),
  stage       text NOT NULL DEFAULT 'application'
                CHECK (stage IN ('application','license_verify','background','agreement',
                                 'payroll','training','certification','provisioning','complete')),
  started_at  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX onboarding_cases_user_idx ON onboarding_cases (user_id) WHERE deleted_at IS NULL;
CREATE INDEX onboarding_cases_stage_idx ON onboarding_cases (stage) WHERE deleted_at IS NULL;
CREATE TRIGGER onboarding_cases_set_updated_at BEFORE UPDATE ON onboarding_cases
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE onboarding_steps (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      uuid NOT NULL REFERENCES onboarding_cases(id),
  step         text NOT NULL CHECK (step IN
                 ('application','license_verify','background','agreement',
                  'payroll','training','certification','provisioning')),
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','in_progress','passed','failed','waived')),
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
CREATE UNIQUE INDEX onboarding_steps_unique
  ON onboarding_steps (case_id, step) WHERE deleted_at IS NULL;
CREATE TRIGGER onboarding_steps_set_updated_at BEFORE UPDATE ON onboarding_steps
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE license_records (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id),
  license_type text NOT NULL CHECK (license_type IN ('nc_broker','bic','nmls_mlo','nmls_entity')),
  number       text,             -- may be encrypted at the service layer if treated as sensitive
  status       text NOT NULL DEFAULT 'unverified'
                 CHECK (status IN ('unverified','active','inactive','expired','revoked')),
  expires_at   date,
  verified_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
CREATE INDEX license_records_user_idx ON license_records (user_id) WHERE deleted_at IS NULL;
CREATE TRIGGER license_records_set_updated_at BEFORE UPDATE ON license_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE agreements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id),
  type         text NOT NULL CHECK (type IN ('w2','contractor','partner')),
  esigned_at   timestamptz,
  document_ref text,             -- ENCRYPTED reference to the executed document
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
CREATE INDEX agreements_user_idx ON agreements (user_id) WHERE deleted_at IS NULL;
CREATE TRIGGER agreements_set_updated_at BEFORE UPDATE ON agreements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
