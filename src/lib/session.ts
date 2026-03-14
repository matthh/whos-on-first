import crypto from "crypto";

const MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days in ms

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET not set");
  return secret;
}

export function createSessionToken(userId: number): string {
  const timestamp = Date.now();
  const payload = `${userId}.${timestamp}`;
  const hmac = crypto
    .createHmac("sha256", getSecret())
    .update(payload)
    .digest("base64url");
  return Buffer.from(`${payload}.${hmac}`).toString("base64url");
}

export function validateSessionToken(token: string): number | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const parts = decoded.split(".");
    if (parts.length !== 3) return null;

    const [userIdStr, timestampStr, hmac] = parts;
    const payload = `${userIdStr}.${timestampStr}`;
    const expected = crypto
      .createHmac("sha256", getSecret())
      .update(payload)
      .digest("base64url");

    const hmacBuf = Buffer.from(hmac);
    const expectedBuf = Buffer.from(expected);
    if (hmacBuf.length !== expectedBuf.length) return null;
    if (!crypto.timingSafeEqual(hmacBuf, expectedBuf)) return null;

    const timestamp = parseInt(timestampStr, 10);
    if (Date.now() - timestamp > MAX_AGE) return null;

    return parseInt(userIdStr, 10);
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = "wof-session";

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
  path: "/",
};
