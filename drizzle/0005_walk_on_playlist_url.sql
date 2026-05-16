-- Coach-supplied Spotify playlist URL for the walk-on music QR code on
-- the printable sheet. Distinct from spotify_playlist_id (which the app
-- manages automatically when the coach connects Spotify) — this field
-- lets a coach paste any public playlist URL even if they haven't
-- connected the in-app Spotify integration. Walk-up PDF prefers this
-- when present, otherwise derives one from spotify_playlist_id.

BEGIN;

ALTER TABLE teams ADD COLUMN IF NOT EXISTS walk_on_playlist_url TEXT;

COMMIT;
