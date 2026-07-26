-- 003_plan.sql
-- The plan and its six tracks (spec §3, §1: "The product is the plan").

CREATE TABLE plans (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    uuid NOT NULL REFERENCES members(id),
  target_date  date,
  status       text NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','on_hold','placement_ready','completed','cancelled')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
CREATE INDEX plans_member_idx ON plans (member_id) WHERE deleted_at IS NULL;
CREATE TRIGGER plans_set_updated_at BEFORE UPDATE ON plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Now that plans exists, wire members.plan_id -> plans.id (deferred from 002).
ALTER TABLE members
  ADD CONSTRAINT members_plan_fk FOREIGN KEY (plan_id) REFERENCES plans(id);

-- The six tracks. One row per (plan, track_type).
CREATE TABLE plan_tracks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id       uuid NOT NULL REFERENCES plans(id),
  track_type    text NOT NULL CHECK (track_type IN
                  ('credit','budget','savings','education','readiness','timeline')),
  status        text NOT NULL DEFAULT 'not_started'
                  CHECK (status IN ('not_started','in_progress','blocked','complete')),
  progress_pct  smallint NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE UNIQUE INDEX plan_tracks_unique ON plan_tracks (plan_id, track_type) WHERE deleted_at IS NULL;
CREATE TRIGGER plan_tracks_set_updated_at BEFORE UPDATE ON plan_tracks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE milestones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id       uuid NOT NULL REFERENCES plans(id),
  track_type    text NOT NULL CHECK (track_type IN
                  ('credit','budget','savings','education','readiness','timeline')),
  label         text NOT NULL,
  due_day       integer CHECK (due_day >= 0),   -- plan_day this milestone targets
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX milestones_plan_idx ON milestones (plan_id) WHERE deleted_at IS NULL;
CREATE TRIGGER milestones_set_updated_at BEFORE UPDATE ON milestones
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
