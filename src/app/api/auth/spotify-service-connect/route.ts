import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { signOAuthState, isAdmin } from "@/lib/auth";
import { getSpotifyConfig, SPOTIFY_AUTHORIZE_URL, SPOTIFY_SCOPES } from "@/lib/spotify";

const OAUTH_STATE_COOKIE = "wof-spotify-service-oauth-state";
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * Admin-only — initiates OAuth to capture the service-level Spotify
 * refresh token used for ALL walk-on-music playlist operations across
 * every coach. The admin (app owner) authorizes once; coaches never
 * need to authorize Spotify themselves.
 */
export async function GET(request: NextRequest) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cfg = getSpotifyConfig();
  if (!cfg) {
    return NextResponse.json({ error: "Spotify not configured" }, { status: 500 });
  }

  // Use a separate redirect URI for the service flow so it can't be confused
  // with the (legacy) per-user flow if both ever coexist.
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://whos-on-first.vercel.app";
  const redirectUri = `${baseUrl}/api/auth/spotify-service-callback`;

  const nonce = crypto.randomBytes(16).toString("base64url");
  const exp = Date.now() + OAUTH_STATE_MAX_AGE_MS;
  const state = signOAuthState({ provider: "spotify-service", nonce, exp });

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SPOTIFY_SCOPES,
    state,
    show_dialog: "true",
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
