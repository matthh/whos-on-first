import { pgTable, serial, text, timestamp, integer, boolean, json } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").unique().notNull(),
  name: text("name"),
  role: text("role").default("user").notNull(), // 'admin' | 'user'
  status: text("status").default("pending").notNull(), // 'pending' | 'approved' | 'suspended'
  authProvider: text("auth_provider"), // 'google'
  authProviderId: text("auth_provider_id"),
  teamName: text("team_name"),
  logoDataUrl: text("logo_data_url"),
  constraintConfig: json("constraint_config"), // ConstraintConfig JSON
  createdAt: timestamp("created_at").defaultNow(),
});

export const rosters = pgTable("rosters", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  players: json("players").notNull(), // Player[] JSON
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const gameHistory = pgTable("game_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  date: text("date").notNull(),
  players: json("players").notNull(), // HistoryEntry players JSON
  createdAt: timestamp("created_at").defaultNow(),
});

export const constraintOverrides = pgTable("constraint_overrides", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  constraintId: text("constraint_id").notNull(),
  enabled: boolean("enabled").notNull(),
});
