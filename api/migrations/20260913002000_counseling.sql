-- Counseling as its own product (Deon, 2026-09-12): single ($89) and group sessions,
-- a topic picker, and a built-in video room for virtual meetings. Also: tax returns
-- and W-2s join the pre-visit document checklist.

ALTER TABLE member_documents DROP CONSTRAINT IF EXISTS member_documents_doc_type_check;
ALTER TABLE member_documents ADD CONSTRAINT member_documents_doc_type_check CHECK (doc_type IN
  ('photo_id','pay_stub_1','pay_stub_2','employment','co_applicant_id',
   'tax_return_1','tax_return_2','w2_1','w2_2','other'));

CREATE TABLE counseling_topics (
  code        text PRIMARY KEY,
  name        text NOT NULL,
  blurb       text NOT NULL,
  sort_order  smallint NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true
);
INSERT INTO counseling_topics (code, name, blurb, sort_order) VALUES
  ('food_spending',  'I spend too much on food',            'Groceries, takeout, and delivery add up fast. Find where it goes and build a food budget you can live with.', 1),
  ('cannot_save',    'I cannot seem to save',               'Money comes in and goes out. Set up a savings rhythm that survives real life and builds your down payment.', 2),
  ('impulse_buying', 'Why do I keep buying shoes, watches, clothes', 'Understand the triggers behind impulse purchases and set guardrails without giving up what you enjoy.', 3),
  ('budget_101',     'Budget 101, with a real person',      'Build your first working budget side by side with a specialist. Leave with numbers, not theory.', 4),
  ('family_income',  'Managing my family on a new income',  'New job, new baby, new household. Re-plan the money so the home goal stays on track.', 5),
  ('credit_file',    'Walk through my credit file',         'Go item by item. Learn what each line means and decide for yourself what to question.', 6),
  ('lender_ready',   'Get lender-ready',                    'What underwriters look for, what to gather, and how to present your file.', 7),
  ('other',          'Something else',                      'Tell us what is on your mind.', 99);

ALTER TABLE counseling_sessions
  ADD COLUMN format      text NOT NULL DEFAULT 'single' CHECK (format IN ('single','group')),
  ADD COLUMN topic_code  text REFERENCES counseling_topics(code),
  ADD COLUMN room_code   text UNIQUE DEFAULT encode(gen_random_bytes(9), 'hex'),
  ADD COLUMN group_session_id uuid;

-- Group sessions: a scheduled topic class hosted by staff; members buy seats.
CREATE TABLE group_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_code    text NOT NULL REFERENCES counseling_topics(code),
  title         text NOT NULL,
  host_user_id  uuid NOT NULL REFERENCES users(id),
  scheduled_at  timestamptz NOT NULL,
  duration_min  smallint NOT NULL DEFAULT 60,
  capacity      smallint NOT NULL DEFAULT 12 CHECK (capacity BETWEEN 2 AND 200),
  price_cents   integer NOT NULL,
  room_code     text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(9), 'hex'),
  status        text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX group_sessions_upcoming ON group_sessions (scheduled_at) WHERE status = 'scheduled';
CREATE TRIGGER group_sessions_set_updated_at BEFORE UPDATE ON group_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE counseling_sessions
  ADD CONSTRAINT counseling_sessions_group_fk FOREIGN KEY (group_session_id) REFERENCES group_sessions(id);
CREATE UNIQUE INDEX counseling_sessions_one_seat ON counseling_sessions (member_id, group_session_id)
  WHERE group_session_id IS NOT NULL AND status IN ('booked','completed');

-- Group price is a PLACEHOLDER until Deon sets it.
INSERT INTO billing_settings (key, value) VALUES
  ('group_session', '{"priceCents": 4900, "durationMin": 60, "name": "Group counseling session", "placeholder": true}');

-- Every appointment (including the first consultation) gets its own video room.
ALTER TABLE appointments ADD COLUMN room_code text UNIQUE DEFAULT encode(gen_random_bytes(9), 'hex');
UPDATE appointments SET room_code = encode(gen_random_bytes(9), 'hex') WHERE room_code IS NULL;
