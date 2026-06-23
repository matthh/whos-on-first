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
import { users, appSettings } from "./schema";
import { eq } from "drizzle-orm";

const SPOTIFY_SERVICE_REFRESH_KEY = "spotify_service_refresh_token";
const SPOTIFY_SERVICE_USER_ID_KEY = "spotify_service_user_id";

async function getAppSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return row?.value ?? null;
}

async function setAppSetting(key: string, value: string | null): Promise<void> {
  if (value === null) {
    await db.delete(appSettings).where(eq(appSettings.key, key));
    return;
  }
  // Upsert
  await db
    .insert(appSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
}

export async function setSpotifyServiceTokens(refreshToken: string, spotifyUserId: string): Promise<void> {
  await setAppSetting(SPOTIFY_SERVICE_REFRESH_KEY, refreshToken);
  await setAppSetting(SPOTIFY_SERVICE_USER_ID_KEY, spotifyUserId);
}

export async function getSpotifyServiceUserId(): Promise<string | null> {
  return getAppSetting(SPOTIFY_SERVICE_USER_ID_KEY);
}

/**
 * Get a valid service-level Spotify access token by refreshing the stored
 * refresh token. Used for all walk-on-music playlist operations so coaches
 * never need to authorize Spotify themselves. Returns null if the service
 * account hasn't been linked yet.
 */
export async function getValidServiceAccessToken(): Promise<string | null> {
  const refreshToken = await getAppSetting(SPOTIFY_SERVICE_REFRESH_KEY);
  if (!refreshToken) return null;
  const result = await refreshAccessToken(refreshToken);
  if (!result.ok) {
    // Discard a permanently-dead refresh token so /admin prompts a re-link of
    // the service account (Spotify 6-month refresh-token expiry, 2026-07-20+).
    if (result.invalidGrant) await clearSpotifyServiceTokens();
    return null;
  }
  const fresh = result.tokens;
  // Persist the rotated refresh token if Spotify issued one.
  if (fresh.refresh_token && fresh.refresh_token !== refreshToken) {
    await setAppSetting(SPOTIFY_SERVICE_REFRESH_KEY, fresh.refresh_token);
  }
  return fresh.access_token;
}

export async function clearSpotifyServiceTokens(): Promise<void> {
  await setAppSetting(SPOTIFY_SERVICE_REFRESH_KEY, null);
  await setAppSetting(SPOTIFY_SERVICE_USER_ID_KEY, null);
}

export const SPOTIFY_AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
export const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
export const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

export const SPOTIFY_SCOPES = [
  "user-read-private",
  "user-read-email",
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

/**
 * Result of a refresh attempt. `invalidGrant` distinguishes a permanently dead
 * refresh token (Spotify returns HTTP 400 {"error":"invalid_grant"} when the
 * token is expired/revoked — note: refresh tokens expire after 6 months as of
 * 2026-07-20) from a transient failure. On invalidGrant the caller MUST discard
 * the stored token and re-auth the user; on a transient failure it should keep
 * the token and try again later.
 */
export type RefreshResult =
  | { ok: true; tokens: SpotifyTokens }
  | { ok: false; invalidGrant: boolean };

/** Refresh an expired access token. Spotify may rotate refresh tokens. */
export async function refreshAccessToken(refreshToken: string): Promise<RefreshResult> {
  const cfg = getSpotifyConfig();
  if (!cfg) return { ok: false, invalidGrant: false };
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
  if (!res.ok) {
    let invalidGrant = false;
    try {
      const body = (await res.json()) as { error?: string };
      invalidGrant = body?.error === "invalid_grant";
    } catch {
      /* non-JSON error body — treat as transient */
    }
    return { ok: false, invalidGrant };
  }
  const data = (await res.json()) as Partial<SpotifyTokens>;
  // Spotify sometimes omits refresh_token on refresh — keep the original.
  if (!data.access_token || typeof data.expires_in !== "number") return { ok: false, invalidGrant: false };
  return {
    ok: true,
    tokens: {
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? refreshToken,
      expires_in: data.expires_in,
      token_type: data.token_type ?? "Bearer",
      scope: data.scope ?? "",
    },
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

  const result = await refreshAccessToken(user.spotifyRefreshToken);
  if (!result.ok) {
    // Discard the expired refresh token so spotify-status reports disconnected
    // and the UI prompts the user to reconnect (Spotify 6-month expiry).
    if (result.invalidGrant) {
      await db
        .update(users)
        .set({ spotifyAccessToken: null, spotifyRefreshToken: null, spotifyExpiresAt: null })
        .where(eq(users.id, userId));
    }
    return null;
  }
  const fresh = result.tokens;
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

/**
 * Curated rotation of clean, beloved walk-up classics. Used as a fallback
 * when a player hasn't picked a song yet so the team playlist still has
 * something for everyone. We resolve each entry to a real Spotify track
 * at sync time (preferring non-explicit), so picks adjust to whatever
 * versions Spotify currently surfaces in the coach's market.
 */
export const DEFAULT_WALK_UP_SONGS: { title: string; artist: string }[] = [
  { title: "Welcome to the Jungle", artist: "Guns N' Roses" },
  { title: "Eye of the Tiger", artist: "Survivor" },
  { title: "We Will Rock You", artist: "Queen" },
  { title: "Enter Sandman", artist: "Metallica" },
  { title: "Thunderstruck", artist: "AC/DC" },
  { title: "Centerfield", artist: "John Fogerty" },
  { title: "Crazy Train", artist: "Ozzy Osbourne" },
  { title: "Sweet Caroline", artist: "Neil Diamond" },
  { title: "Don't Stop Believin'", artist: "Journey" },
  { title: "All Star", artist: "Smash Mouth" },
  { title: "Jump", artist: "Van Halen" },
  { title: "The Final Countdown", artist: "Europe" },
  { title: "Livin' on a Prayer", artist: "Bon Jovi" },
  { title: "Born in the U.S.A.", artist: "Bruce Springsteen" },
  { title: "Hells Bells", artist: "AC/DC" },
];

interface SpotifyTrackResult {
  id: string;
  uri: string;
  name: string;
  artists: { name: string }[];
  album: { images: { url: string; width: number; height: number }[] };
  preview_url: string | null;
  explicit: boolean;
}

/**
 * Find a clean version of a track by title + artist. Prefers non-explicit
 * results. Returns a WalkOnSong-compatible payload (without isDefaultPick)
 * or null if nothing matches.
 */
export async function findCleanTrack(
  accessToken: string,
  title: string,
  artist: string,
): Promise<{ spotifyId: string; uri: string; title: string; artist: string; albumArtUrl: string | null; previewUrl: string | null } | null> {
  const params = new URLSearchParams();
  params.set("q", `track:"${title}" artist:"${artist}"`);
  params.set("type", "track");
  params.set("limit", "5");
  const res = await fetch(`${SPOTIFY_API_BASE}/search?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { tracks?: { items?: SpotifyTrackResult[] } };
  const items = data.tracks?.items ?? [];
  if (items.length === 0) return null;
  const pick = items.find((t) => !t.explicit) ?? items[0];
  const imgs = pick.album?.images ?? [];
  const sorted = [...imgs].sort((a, b) => a.width - b.width);
  const small = sorted.find((i) => i.width >= 64) ?? sorted[sorted.length - 1] ?? null;
  return {
    spotifyId: pick.id,
    uri: pick.uri,
    title: pick.name,
    artist: pick.artists.map((a) => a.name).join(", "),
    albumArtUrl: small?.url ?? null,
    previewUrl: pick.preview_url ?? null,
  };
}
