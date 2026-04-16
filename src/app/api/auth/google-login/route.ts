import crypto from "crypto";
import { NextResponse } from "next/server";
import { signOAuthState } from "@/lib/auth";

const OAUTH_STATE_COOKIE = "wof-oauth-state";
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Google OAuth not configured" }, { status: 500 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://whos-on-first.vercel.app";
  const redirectUri =
    process.env.GOOGLE_LOGIN_REDIRECT_URI || `${baseUrl}/api/auth/google-login-callback`;

  const nonce = crypto.randomBytes(16).toString("base64url");
  const exp = Date.now() + OAUTH_STATE_MAX_AGE_MS;
  const state = signOAuthState({ provider: "google", nonce, exp });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
    access_type: "online",
  });

  const response = NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
  response.cookies.set(OAUTH_STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: OAUTH_STATE_MAX_AGE_MS / 1000,
    path: "/",
  });
  return response;
}
