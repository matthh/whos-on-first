import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/auth/google-login", "/api/auth/logout", "/api/admin/users/action"];
const STATIC_PATHS = ["/_next/", "/favicon.ico", "/favicon.png", "/logo.png"];

const SESSION_COOKIE = "wof-session";
const MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

async function validateToken(token: string, secret: string): Promise<number | null> {
  try {
    const decoded = atob(token.replace(/-/g, "+").replace(/_/g, "/"));
    const parts = decoded.split(".");
    if (parts.length !== 3) return null;

    const [userIdStr, timestampStr, hmac] = parts;
    const payload = `${userIdStr}.${timestampStr}`;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
    const expected = btoa(String.fromCharCode(...new Uint8Array(sig)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    if (hmac !== expected) return null;

    const timestamp = parseInt(timestampStr, 10);
    if (Date.now() - timestamp > MAX_AGE) return null;

    return parseInt(userIdStr, 10);
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow static assets
  if (STATIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const userId = await validateToken(token, secret);
  if (!userId) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const response = NextResponse.next();
  response.headers.set("x-user-id", String(userId));
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
