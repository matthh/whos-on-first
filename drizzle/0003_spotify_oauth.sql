-- Spotify OAuth — per-coach connection so walk-on music playlists live in
-- the coach's own account. All columns nullable so existing rows keep
-- working; presence of refresh_token signals "Spotify connected".

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS spotify_user_id        TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS spotify_display_name   TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS spotify_access_token   TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS spotify_refresh_token  TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS spotify_expires_at     TIMESTAMP;

ALTER TABLE teams ADD COLUMN IF NOT EXISTS spotify_playlist_id    TEXT;

COMMIT;
