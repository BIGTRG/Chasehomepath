-- Members' names were only captured in the register audit row. Maren greets people by
-- name, so store it on the user and backfill from the audit log.
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name text;
UPDATE users u SET display_name = a.metadata->>'name'
  FROM audit_log a
 WHERE a.action = 'auth.register' AND a.entity_type = 'user' AND a.entity_id = u.id
   AND u.display_name IS NULL AND a.metadata->>'name' IS NOT NULL;
