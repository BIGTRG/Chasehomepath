-- Intake funnel (walkthrough screens 2-5): self-service qualify data, credit-pull
-- authorization, and the pre-visit document checklist. Spec §4.2-§4.6.

CREATE TABLE intake_profiles (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id            uuid NOT NULL REFERENCES members(id),
  household_income     numeric(12,2) CHECK (household_income IS NULL OR household_income >= 0),
  target_area          text,
  co_applicant         jsonb,
  -- Member-initiated authorization to pull credit (fee disclosed, score withheld — §8).
  credit_authorized_at timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);
CREATE UNIQUE INDEX intake_profiles_member_unique ON intake_profiles (member_id) WHERE deleted_at IS NULL;
CREATE TRIGGER intake_profiles_set_updated_at BEFORE UPDATE ON intake_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Pre-visit documents: camera capture, not printing and scanning (§4.6).
CREATE TABLE member_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   uuid NOT NULL REFERENCES members(id),
  doc_type    text NOT NULL CHECK (doc_type IN
                ('photo_id','pay_stub_1','pay_stub_2','employment','co_applicant_id','other')),
  file_name   text NOT NULL,
  mime_type   text NOT NULL,
  size_bytes  integer NOT NULL CHECK (size_bytes >= 0),
  storage_key text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX member_documents_member ON member_documents (member_id) WHERE deleted_at IS NULL;
CREATE TRIGGER member_documents_set_updated_at BEFORE UPDATE ON member_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
