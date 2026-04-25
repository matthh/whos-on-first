import { NextRequest, NextResponse } from "next/server";
import { verifyOAuthState } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { exchangeCodeForTokens, fetchSpotifyMe } from "@/lib/spotify";

const OAUTH_STATE_COOKIE = "wof-spotify-oauth-state";

function redirectHome(request: NextRequest, params: Record<string, string>): NextResponse {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin;
  const url = new URL("/settings", baseUrl);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const response = NextResponse.redirect(url);
  response.cookies.delete(OAUTH_STATE_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return redirectHome(request, { spotify: "error", reason: error });
  }
  if (!code || !state) {
    return redirectHome(request, { spotify: "error", reason: "missing_code" });
  }

  const stateData = verifyOAuthState(state);
  if (!stateData || stateData.provider !== "spotify") {
    return redirectHome(request, { spotify: "error", reason: "invalid_state" });
  }
  const cookieNonce = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  if (
    typeof stateData.nonce !== "string" ||
    typeof stateData.exp !== "number" ||
    !cookieNonce ||
    stateData.nonce !== cookieNonce ||
    stateData.exp <= Date.now()
  ) {
    return redirectHome(request, { spotify: "error", reason: "invalid_state" });
  }
  const userId = typeof stateData.userId === "number" ? stateData.userId : null;
  if (!userId) {
    return redirectHome(request, { spotify: "error", reason: "no_user" });
  }

  const tokens = await exchangeCodeForTokens(code);
  if (!tokens) {
    return redirectHome(request, { spotify: "error", reason: "token_exchange" });
  }

  const me = await fetchSpotifyMe(tokens.access_token);
  if (!me) {
    return redirectHome(request, { spotify: "error", reason: "profile_fetch" });
  }

  await db
    .update(users)
    .set({
      spotifyUserId: me.id,
      spotifyDisplayName: me.display_name,
      spotifyAccessToken: tokens.access_token,
      spotifyRefreshToken: tokens.refresh_token,
      spotifyExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    })
    .where(eq(users.id, userId));

  return redirectHome(request, { spotify: "connected" });
}
