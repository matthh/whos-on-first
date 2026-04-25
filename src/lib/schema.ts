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
});

export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  logoDataUrl: text("logo_data_url"),
  constraintConfig: json("constraint_config"),
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

export const constraintOverrides = pgTable("constraint_overrides", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  teamId: integer("team_id").references(() => teams.id, { onDelete: "cascade" }),
  constraintId: text("constraint_id").notNull(),
  enabled: boolean("enabled").notNull(),
});
