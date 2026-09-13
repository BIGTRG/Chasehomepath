-- Do-it-yourself dispute workflow (Deon, 2026-09-13 09:09): the member picks the item and
-- the reason, Maren drafts the letters, the member reviews, signs, sends, and records the
-- answer. Every send is a member action; nothing is filed by the system (spec §8, CROA).

ALTER TABLE intake_profiles
  ADD COLUMN mailing_address jsonb,          -- {line1,line2,city,state,zip}
  ADD COLUMN date_of_birth   date;           -- bureaus require it on a mailed dispute

ALTER TABLE disputes
  ADD COLUMN reason_code  text,
  ADD COLUMN details      text,
  ADD COLUMN bureaus      text[] NOT NULL DEFAULT '{}',
  ADD COLUMN round        smallint NOT NULL DEFAULT 1 CHECK (round BETWEEN 1 AND 6),
  ADD COLUMN due_at       date,               -- 30 days after the first letter went out
  ADD COLUMN outcome      text CHECK (outcome IS NULL OR outcome IN ('deleted','updated','verified','no_response')),
  ADD COLUMN outcome_at   timestamptz,
  ADD COLUMN outcome_note text;

CREATE TABLE dispute_letters (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id     uuid NOT NULL REFERENCES disputes(id),
  member_id      uuid NOT NULL REFERENCES members(id),
  round          smallint NOT NULL DEFAULT 1,
  kind           text NOT NULL CHECK (kind IN ('bureau_dispute','mov_request','furnisher_direct','debt_validation','cfpb_complaint')),
  recipient_key  text NOT NULL,               -- experian | equifax | transunion | furnisher | cfpb
  recipient_name text NOT NULL,
  recipient_addr text,                        -- multi-line postal address; null for online-only
  body           text NOT NULL,               -- member-editable letter text
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','sent')),
  signed_name    text,                        -- typed signature at approval
  approved_at    timestamptz,
  sent_at        date,
  sent_method    text CHECK (sent_method IS NULL OR sent_method IN ('certified_mail','mail','online','fax')),
  tracking       text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);
CREATE INDEX dispute_letters_dispute_idx ON dispute_letters (dispute_id) WHERE deleted_at IS NULL;
CREATE TRIGGER dispute_letters_set_updated_at BEFORE UPDATE ON dispute_letters
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Timeline the member and Maren both read.
CREATE TABLE dispute_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id  uuid NOT NULL REFERENCES disputes(id),
  kind        text NOT NULL,                  -- started | letter_approved | letter_sent | response | next_round | withdrawn | note
  text        text NOT NULL,
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dispute_events_dispute_idx ON dispute_events (dispute_id);
