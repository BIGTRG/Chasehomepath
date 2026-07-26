-- 006_team_comms.sql
-- Team & communication (spec §3, §8).
-- Compliance: in-app communication only — no personal phone/email surfaces between
-- members and team. All comms flow through messages / appointments.

CREATE TABLE team_assignments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id             uuid NOT NULL REFERENCES members(id),
  -- Assignee is either a staff user or a partner user; store the user_id plus which kind.
  staff_or_partner_user uuid NOT NULL REFERENCES users(id),
  assignee_kind         text NOT NULL CHECK (assignee_kind IN ('staff','partner')),
  role_on_team          text NOT NULL,
  assigned_at           timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz
);
CREATE UNIQUE INDEX team_assignments_unique
  ON team_assignments (member_id, staff_or_partner_user, role_on_team) WHERE deleted_at IS NULL;
CREATE INDEX team_assignments_member_idx ON team_assignments (member_id) WHERE deleted_at IS NULL;
CREATE INDEX team_assignments_assignee_idx ON team_assignments (staff_or_partner_user) WHERE deleted_at IS NULL;
CREATE TRIGGER team_assignments_set_updated_at BEFORE UPDATE ON team_assignments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Threads group messages; a thread is scoped to a member's team conversation.
CREATE TABLE message_threads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   uuid NOT NULL REFERENCES members(id),
  subject     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX message_threads_member_idx ON message_threads (member_id) WHERE deleted_at IS NULL;
CREATE TRIGGER message_threads_set_updated_at BEFORE UPDATE ON message_threads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   uuid NOT NULL REFERENCES message_threads(id),
  sender_id   uuid NOT NULL REFERENCES users(id),
  body        text NOT NULL,
  sent_at     timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX messages_thread_idx ON messages (thread_id, sent_at) WHERE deleted_at IS NULL;
CREATE TRIGGER messages_set_updated_at BEFORE UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE appointments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id      uuid NOT NULL REFERENCES members(id),
  participant_id uuid NOT NULL REFERENCES users(id),
  type           text NOT NULL CHECK (type IN ('in_person','video','call')),
  scheduled_at   timestamptz NOT NULL,
  status         text NOT NULL DEFAULT 'scheduled'
                   CHECK (status IN ('scheduled','completed','cancelled','no_show')),
  -- Marks the "first consultation" that unlocks score visibility (§8 score-withheld rule).
  is_consultation boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);
CREATE INDEX appointments_member_idx ON appointments (member_id, scheduled_at) WHERE deleted_at IS NULL;
CREATE TRIGGER appointments_set_updated_at BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE ratings (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id            uuid NOT NULL REFERENCES members(id),
  rated_user_id        uuid NOT NULL REFERENCES users(id),
  responsiveness_score smallint NOT NULL CHECK (responsiveness_score BETWEEN 1 AND 5),
  submitted_at         timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);
CREATE INDEX ratings_rated_idx ON ratings (rated_user_id) WHERE deleted_at IS NULL;
CREATE TRIGGER ratings_set_updated_at BEFORE UPDATE ON ratings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
