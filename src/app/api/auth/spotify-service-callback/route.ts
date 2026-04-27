import { NextRequest, NextResponse } from "next/server";
import { verifyOAuthState, isAdmin } from "@/lib/auth";
import {
  fetchSpotifyMe,
  setSpotifyServiceTokens,
  SPOTIFY_TOKEN_URL,
  getSpotifyConfig,
} from "@/lib/spotify";

const OAUTH_STATE_COOKIE = "wof-spotify-service-oauth-state";

function redirectAdmin(request: NextRequest, params: Record<string, string>): NextResponse {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin;
  const url = new URL("/admin", baseUrl);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const response = NextResponse.redirect(url);
  response.cookies.delete(OAUTH_STATE_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) return redirectAdmin(request, { spotify_service: "error", reason: error });
  if (!code || !state) return redirectAdmin(request, { spotify_service: "error", reason: "missing_code" });

  const stateData = verifyOAuthState(state);
  if (!stateData || stateData.provider !== "spotify-service") {
    return redirectAdmin(request, { spotify_service: "error", reason: "invalid_state" });
  }
  const cookieNonce = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  if (
    typeof stateData.nonce !== "string" ||
    typeof stateData.exp !== "number" ||
    !cookieNonce ||
    stateData.nonce !== cookieNonce ||
    stateData.exp <= Date.now()
  ) {
    return redirectAdmin(request, { spotify_service: "error", reason: "invalid_state" });
  }

  const cfg = getSpotifyConfig();
  if (!cfg) return redirectAdmin(request, { spotify_service: "error", reason: "not_configured" });

  // Use the service-flow redirect URI for the token exchange.
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin;
  const redirectUri = `${baseUrl}/api/auth/spotify-service-callback`;

  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
  const tokenRes = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
  });
  if (!tokenRes.ok) {
    const body = await tokenRes.text().catch(() => "");
    console.error(`[spotify-service-callback] token exchange failed: ${body}`);
    return redirectAdmin(request, { spotify_service: "error", reason: "token_exchange" });
  }
  const tokens = (await tokenRes.json()) as { access_token: string; refresh_token: string };
  if (!tokens.refresh_token) {
    return redirectAdmin(request, { spotify_service: "error", reason: "no_refresh_token" });
  }

  const me = await fetchSpotifyMe(tokens.access_token);
  if (!me) return redirectAdmin(request, { spotify_service: "error", reason: "profile_fetch" });

  await setSpotifyServiceTokens(tokens.refresh_token, me.id);
  return redirectAdmin(request, { spotify_service: "linked", as: me.display_name || me.id });
}
