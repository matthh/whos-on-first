import crypto from "crypto";
import { NextRequest } from "next/server";
import { db } from "./db";
import { users } from "./schema";
import { eq } from "drizzle-orm";

function getSecret(): string {
  return process.env.SESSION_SECRET || "";
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

export function signOAuthState(data: Record<string, unknown>): string {
  const payload = JSON.stringify(data);
  const hmac = crypto
    .createHmac("sha256", getSecret())
    .update(payload)
    .digest("base64url");
  return Buffer.from(`${payload}.${hmac}`).toString("base64url");
}

export function verifyOAuthState(state: string): Record<string, unknown> | null {
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
    return JSON.parse(payload);
  } catch {
    return null;
  }
}
