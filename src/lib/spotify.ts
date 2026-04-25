/**
 * Spotify OAuth + API helpers.
 *
 * Per-coach OAuth so the walk-on playlist is created in the coach's own
 * account. Tokens are stored on the users row. Access tokens last 1 hour
 * and we transparently refresh via the refresh token when expired.
 *
 * Soft-fail philosophy: if Spotify is unreachable, env vars missing, or a
 * refresh fails, every helper returns null so the caller can continue
 * without Spotify rather than block the user.
 */

import { db } from "./db";
import { users } from "./schema";
import { eq } from "drizzle-orm";

export const SPOTIFY_AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
export const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
export const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

export const SPOTIFY_SCOPES = [
  "user-read-private",
  "playlist-read-private",
  "playlist-modify-public",
  "playlist-modify-private",
].join(" ");

export interface SpotifyTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  token_type: string;
  scope: string;
}

export function getSpotifyConfig(): { clientId: string; clientSecret: string; redirectUri: string } | null {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://whos-on-first.vercel.app";
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI || `${baseUrl}/api/auth/spotify-callback`;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri };
}

/** Exchange an authorization code for tokens. Used by the callback route. */
export async function exchangeCodeForTokens(code: string): Promise<SpotifyTokens | null> {
  const cfg = getSpotifyConfig();
  if (!cfg) return null;
  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: cfg.redirectUri,
    }),
  });
  if (!res.ok) return null;
  return res.json() as Promise<SpotifyTokens>;
}

/** Refresh an expired access token. Spotify may rotate refresh tokens. */
export async function refreshAccessToken(refreshToken: string): Promise<SpotifyTokens | null> {
  const cfg = getSpotifyConfig();
  if (!cfg) return null;
  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as Partial<SpotifyTokens>;
  // Spotify sometimes omits refresh_token on refresh — keep the original.
  if (!data.access_token || typeof data.expires_in !== "number") return null;
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? refreshToken,
    expires_in: data.expires_in,
    token_type: data.token_type ?? "Bearer",
    scope: data.scope ?? "",
  };
}

/**
 * Get a valid access token for the user, refreshing if necessary. Returns
 * null if the user hasn't connected Spotify or the refresh failed.
 */
export async function getValidAccessToken(userId: number): Promise<string | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !user.spotifyRefreshToken) return null;

  const expiresAt = user.spotifyExpiresAt;
  // Refresh if expired or expiring within 60 seconds
  if (user.spotifyAccessToken && expiresAt && expiresAt.getTime() > Date.now() + 60_000) {
    return user.spotifyAccessToken;
  }

  const fresh = await refreshAccessToken(user.spotifyRefreshToken);
  if (!fresh) return null;
  const newExpiresAt = new Date(Date.now() + fresh.expires_in * 1000);
  await db
    .update(users)
    .set({
      spotifyAccessToken: fresh.access_token,
      spotifyRefreshToken: fresh.refresh_token,
      spotifyExpiresAt: newExpiresAt,
    })
    .where(eq(users.id, userId));
  return fresh.access_token;
}

export interface SpotifyMe {
  id: string;
  display_name: string | null;
  email?: string;
}

/** Fetch the connected user's profile. */
export async function fetchSpotifyMe(accessToken: string): Promise<SpotifyMe | null> {
  const res = await fetch(`${SPOTIFY_API_BASE}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.json() as Promise<SpotifyMe>;
}
