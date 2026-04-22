-- Multi-team support.
-- Extract team metadata from users into a dedicated teams table, add teamId
-- FKs to child tables, and an activeTeamId pointer on users so a coach can
-- switch between teams they own.
--
-- Safe for existing data: every user that has team_name, logo_data_url, OR
-- constraint_config gets one team row auto-created, and all their existing
-- rosters/game_history/constraint_overrides are linked to that team.

BEGIN;

CREATE TABLE IF NOT EXISTS teams (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  logo_data_url TEXT,
  constraint_config JSON,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS teams_user_id_idx ON teams(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS teams_user_id_name_uniq ON teams(user_id, name);

-- Backfill: create exactly one team row per existing user that has any team data
INSERT INTO teams (user_id, name, logo_data_url, constraint_config, created_at)
SELECT
  id,
  COALESCE(NULLIF(team_name, ''), 'My Team'),
  logo_data_url,
  constraint_config,
  COALESCE(created_at, NOW())
FROM users
WHERE team_name IS NOT NULL
   OR logo_data_url IS NOT NULL
   OR constraint_config IS NOT NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS active_team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL;

UPDATE users u SET active_team_id = t.id
FROM teams t
WHERE t.user_id = u.id AND u.active_team_id IS NULL;

ALTER TABLE rosters              ADD COLUMN IF NOT EXISTS team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE game_history         ADD COLUMN IF NOT EXISTS team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE constraint_overrides ADD COLUMN IF NOT EXISTS team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE;

UPDATE rosters r              SET team_id = t.id FROM teams t WHERE t.user_id = r.user_id AND r.team_id IS NULL;
UPDATE game_history h         SET team_id = t.id FROM teams t WHERE t.user_id = h.user_id AND h.team_id IS NULL;
UPDATE constraint_overrides o SET team_id = t.id FROM teams t WHERE t.user_id = o.user_id AND o.team_id IS NULL;

CREATE INDEX IF NOT EXISTS rosters_team_id_idx      ON rosters(team_id);
CREATE INDEX IF NOT EXISTS game_history_team_id_idx ON game_history(team_id);

COMMIT;
