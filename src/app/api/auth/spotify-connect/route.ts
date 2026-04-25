import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { signOAuthState, getUserId } from "@/lib/auth";
import { getSpotifyConfig, SPOTIFY_AUTHORIZE_URL, SPOTIFY_SCOPES } from "@/lib/spotify";

const OAUTH_STATE_COOKIE = "wof-spotify-oauth-state";
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

export async function GET(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const cfg = getSpotifyConfig();
  if (!cfg) {
    return NextResponse.json({ error: "Spotify not configured" }, { status: 500 });
  }

  const nonce = crypto.randomBytes(16).toString("base64url");
  const exp = Date.now() + OAUTH_STATE_MAX_AGE_MS;
  // Bake userId into the state so the callback knows which user to attach to
  // even if the session cookie is missing on the redirect (rare but possible).
  const state = signOAuthState({ provider: "spotify", nonce, exp, userId });

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: SPOTIFY_SCOPES,
    state,
    show_dialog: "false",
  });

  const response = NextResponse.redirect(`${SPOTIFY_AUTHORIZE_URL}?${params.toString()}`);
  response.cookies.set(OAUTH_STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: OAUTH_STATE_MAX_AGE_MS / 1000,
    path: "/",
  });
  return response;
}
