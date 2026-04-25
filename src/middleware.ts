import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/auth/google-login", "/api/auth/logout", "/api/admin/users/action", "/api/auth/spotify-callback"];
const STATIC_PATHS = ["/_next/", "/favicon.ico", "/favicon.png", "/logo.png"];

const SESSION_COOKIE = "wof-session";
const MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days
const USER_ID_HEADER = "x-user-id";

function stripUserIdHeader(headers: Headers): Headers {
  const newHeaders = new Headers(headers);
  newHeaders.delete(USER_ID_HEADER);
  return newHeaders;
}

function forwardHeaders(newHeaders: Headers): NextResponse {
  return NextResponse.next({ request: { headers: newHeaders } });
}

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

    // Constant-time comparison (Edge runtime has no crypto.timingSafeEqual).
    let diff = hmac.length ^ expected.length;
    for (let i = 0; i < Math.min(hmac.length, expected.length); i++) {
      diff |= hmac.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    if (diff !== 0) return null;

    const timestamp = parseInt(timestampStr, 10);
    if (Date.now() - timestamp > MAX_AGE) return null;

    return parseInt(userIdStr, 10);
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always start by stripping any client-supplied x-user-id so it can never
  // be forged on any request path (static, public, or authenticated).
  const forwardedHeaders = stripUserIdHeader(request.headers);

  // Allow static assets
  if (STATIC_PATHS.some((p) => pathname.startsWith(p))) {
    return forwardHeaders(forwardedHeaders);
  }

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return forwardHeaders(forwardedHeaders);
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

  // Forward the verified user id via request headers so downstream handlers
  // can read it. We use the documented NextResponse.next({ request }) form
  // instead of setting it on response headers.
  forwardedHeaders.set(USER_ID_HEADER, String(userId));
  return forwardHeaders(forwardedHeaders);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
