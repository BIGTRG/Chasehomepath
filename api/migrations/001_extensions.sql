-- 001_extensions.sql
-- Extensions and shared helpers used across the schema.

-- gen_random_uuid() for UUID primary keys (spec §3).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Case-insensitive text for emails.
CREATE EXTENSION IF NOT EXISTS citext;

-- Shared trigger: keep updated_at current on every UPDATE.
-- Every table carries created_at/updated_at (spec §3).
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
