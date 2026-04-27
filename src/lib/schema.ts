import { pgTable, serial, text, timestamp, integer, boolean, json, uniqueIndex } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").unique().notNull(),
  name: text("name"),
  role: text("role").default("user").notNull(), // 'admin' | 'user'
  status: text("status").default("pending").notNull(), // 'pending' | 'approved' | 'suspended'
  authProvider: text("auth_provider"), // 'google'
  authProviderId: text("auth_provider_id"),
  // Legacy team fields — superseded by the teams table. Kept so older rows
  // read gracefully; new writes go through teams.
  teamName: text("team_name"),
  logoDataUrl: text("logo_data_url"),
  constraintConfig: json("constraint_config"),
  activeTeamId: integer("active_team_id"),
  createdAt: timestamp("created_at").defaultNow(),
  lastLoginAt: timestamp("last_login_at"),
  // Spotify integration — per-coach OAuth so the walk-on playlist lives in
  // the coach's own account. Never blocking — every Spotify call should
  // soft-fail if these are missing or expired and unable to refresh.
  spotifyUserId: text("spotify_user_id"),
  spotifyDisplayName: text("spotify_display_name"),
  spotifyAccessToken: text("spotify_access_token"),
  spotifyRefreshToken: text("spotify_refresh_token"),
  spotifyExpiresAt: timestamp("spotify_expires_at"),
});

export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  logoDataUrl: text("logo_data_url"),
  constraintConfig: json("constraint_config"),
  // Cached id of the team's "{TeamName} Walk On Music" playlist so we update
  // the same playlist every game instead of creating duplicates. Cleared
  // when the user disconnects Spotify or renames the team.
  spotifyPlaylistId: text("spotify_playlist_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  userNameUniq: uniqueIndex("teams_user_id_name_uniq").on(t.userId, t.name),
}));

export const rosters = pgTable("rosters", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  teamId: integer("team_id").references(() => teams.id, { onDelete: "cascade" }),
  players: json("players").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const gameHistory = pgTable("game_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  teamId: integer("team_id").references(() => teams.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  players: json("players").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

/**
 * App-wide settings keyed by a string. Used for service-account credentials
 * that aren't scoped to a single user — e.g. the Spotify refresh token used
 * to create walk-on-music playlists in the app owner's account on behalf
 * of every coach. One row per setting.
 */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const constraintOverrides = pgTable("constraint_overrides", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  teamId: integer("team_id").references(() => teams.id, { onDelete: "cascade" }),
  constraintId: text("constraint_id").notNull(),
  enabled: boolean("enabled").notNull(),
});
