-- Track last login per user so admins can see which coaches are active.
-- Nullable: existing rows have no recorded login until next sign-in.

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;

COMMIT;
