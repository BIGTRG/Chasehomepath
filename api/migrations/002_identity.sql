-- 002_identity.sql
-- Identity & access (spec §3). One users table; role-specific profile tables hang off it.

CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          citext NOT NULL,
  phone          text,
  password_hash  text NOT NULL,
  role           text NOT NULL CHECK (role IN ('member','specialist','manager','admin','partner')),
  status         text NOT NULL DEFAULT 'active'
                   CHECK (status IN ('pending','active','suspended','disabled')),
  mfa_enabled    boolean NOT NULL DEFAULT false,
  mfa_secret     text,           -- encrypted (AES-256-GCM) TOTP secret; null until enrolled
  last_login_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);

-- Email is unique among the living (soft-deleted rows don't block re-registration).
CREATE UNIQUE INDEX users_email_unique ON users (email) WHERE deleted_at IS NULL;
CREATE INDEX users_role_idx ON users (role) WHERE deleted_at IS NULL;

CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Members — clients on a homeownership plan. plan_id FK added in 003 (plans references members).
CREATE TABLE members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id),
  plan_id         uuid,           -- FK constraint added after plans table exists
  membership_tier smallint NOT NULL DEFAULT 1 CHECK (membership_tier IN (1,2,3)),
  target_date     date,
  plan_day        integer NOT NULL DEFAULT 0 CHECK (plan_day >= 0),
  join_date       date NOT NULL DEFAULT CURRENT_DATE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE UNIQUE INDEX members_user_unique ON members (user_id) WHERE deleted_at IS NULL;
CREATE TRIGGER members_set_updated_at BEFORE UPDATE ON members
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Staff — specialists and managers inside an office.
CREATE TABLE staff (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id),
  title         text NOT NULL CHECK (title IN (
                  'home_specialist','credit_specialist','budget_specialist',
                  'realestate_specialist','manager')),
  office_id     uuid,
  license_refs  jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE UNIQUE INDEX staff_user_unique ON staff (user_id) WHERE deleted_at IS NULL;
CREATE INDEX staff_office_idx ON staff (office_id) WHERE deleted_at IS NULL;
CREATE TRIGGER staff_set_updated_at BEFORE UPDATE ON staff
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Partners — certified GC / realtor / lender / etc.
CREATE TABLE partners (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES users(id),
  company_name          text NOT NULL,
  partner_type          text NOT NULL CHECK (partner_type IN (
                          'gc','realtor','lender','insurance','attorney',
                          'architect','surveyor','design')),
  certification_status  text NOT NULL DEFAULT 'pending'
                          CHECK (certification_status IN ('pending','in_review','certified','revoked')),
  verified_authority    boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz
);
CREATE UNIQUE INDEX partners_user_unique ON partners (user_id) WHERE deleted_at IS NULL;
CREATE INDEX partners_type_idx ON partners (partner_type) WHERE deleted_at IS NULL;
CREATE TRIGGER partners_set_updated_at BEFORE UPDATE ON partners
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
