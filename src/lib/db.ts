import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const dbUrl = process.env.POSTGRES_DATABASE_URL;
if (!dbUrl) throw new Error("POSTGRES_DATABASE_URL not set");
const sql = neon(dbUrl);
export const db = drizzle(sql, { schema });
