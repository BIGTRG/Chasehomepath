-- 011_audit_and_auth.sql
-- Audit trail (spec §11 "Everything auditable. Who did what, when.") and auth support.

-- Append-only audit log. No updated_at / deleted_at: the trail is immutable.
CREATE TABLE audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id),   -- null only for genuine system events
  actor_role   text,
  action       text NOT NULL,                -- e.g. 'dispute.filed', 'onboarding.stage_advanced'
  entity_type  text,                         -- e.g. 'dispute', 'onboarding_case'
  entity_id    uuid,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip           text,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_entity_idx ON audit_log (entity_type, entity_id);
CREATE INDEX audit_log_actor_idx ON audit_log (actor_user_id);
CREATE INDEX audit_log_action_idx ON audit_log (action);
CREATE INDEX audit_log_created_idx ON audit_log (created_at);

-- Refresh tokens (rotating). We store only a hash; the raw token lives client-side.
CREATE TABLE refresh_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id),
  token_hash   text NOT NULL,
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  replaced_by  uuid REFERENCES refresh_tokens(id),
  user_agent   text,
  ip           text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX refresh_tokens_hash_unique ON refresh_tokens (token_hash);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);
