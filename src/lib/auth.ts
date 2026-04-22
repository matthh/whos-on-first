import crypto from "crypto";
import { NextRequest } from "next/server";
import { db } from "./db";
import { users, teams } from "./schema";
import { eq, and } from "drizzle-orm";

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET not set");
  return s;
}

export function getUserId(request: NextRequest): number | null {
  const header = request.headers.get("x-user-id");
  if (!header) return null;
  const id = parseInt(header, 10);
  return isNaN(id) ? null : id;
}

export async function getUser(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return null;
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return user || null;
}

export async function isAdmin(request: NextRequest): Promise<boolean> {
  const user = await getUser(request);
  return user?.role === "admin";
}

/**
 * Returns the user's currently-active team row, or null if they have none.
 * If the user has teams but no activeTeamId set (stale row), picks the oldest
 * team and pins it so we don't wander.
 */
export async function getActiveTeam(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return null;
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;

  if (user.activeTeamId) {
    const [team] = await db
      .select()
      .from(teams)
      .where(and(eq(teams.id, user.activeTeamId), eq(teams.userId, userId)))
      .limit(1);
    if (team) return team;
  }

  // Fallback: pick the oldest team and pin it as active.
  const [firstTeam] = await db
    .select()
    .from(teams)
    .where(eq(teams.userId, userId))
    .orderBy(teams.id)
    .limit(1);
  if (firstTeam) {
    await db.update(users).set({ activeTeamId: firstTeam.id }).where(eq(users.id, userId));
    return firstTeam;
  }

  return null;
}

export type OAuthStatePayload = {
  provider?: string;
  nonce?: string;
  exp?: number;
  [key: string]: unknown;
};

export function signOAuthState(data: OAuthStatePayload): string {
  const payload = JSON.stringify(data);
  const hmac = crypto
    .createHmac("sha256", getSecret())
    .update(payload)
    .digest("base64url");
  return Buffer.from(`${payload}.${hmac}`).toString("base64url");
}

export function verifyOAuthState(state: string): OAuthStatePayload | null {
  try {
    const decoded = Buffer.from(state, "base64url").toString();
    const lastDot = decoded.lastIndexOf(".");
    if (lastDot === -1) return null;
    const payload = decoded.slice(0, lastDot);
    const hmac = decoded.slice(lastDot + 1);
    const expected = crypto
      .createHmac("sha256", getSecret())
      .update(payload)
      .digest("base64url");
    const hmacBuf = Buffer.from(hmac);
    const expectedBuf = Buffer.from(expected);
    if (hmacBuf.length !== expectedBuf.length) return null;
    if (!crypto.timingSafeEqual(hmacBuf, expectedBuf)) return null;
    return JSON.parse(payload) as OAuthStatePayload;
  } catch {
    return null;
  }
}
