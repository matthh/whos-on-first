import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getValidAccessToken, SPOTIFY_API_BASE } from "@/lib/spotify";

interface SpotifyArtist {
  name: string;
}

interface SpotifyImage {
  url: string;
  width: number;
  height: number;
}

interface SpotifyAlbum {
  images: SpotifyImage[];
}

interface SpotifyTrack {
  id: string;
  uri: string;
  name: string;
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
  preview_url: string | null;
  duration_ms: number;
}

interface SpotifySearchResponse {
  tracks?: { items?: SpotifyTrack[] };
}

export async function GET(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ tracks: [] });

  const token = await getValidAccessToken(userId);
  if (!token) {
    return NextResponse.json({ error: "Spotify not connected", tracks: [] }, { status: 412 });
  }

  const params = new URLSearchParams({ q, type: "track", limit: "20" });
  const res = await fetch(`${SPOTIFY_API_BASE}/search?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[spotify/search] ${res.status}: ${body.slice(0, 400)}`);
    return NextResponse.json(
      { error: `Spotify search failed (${res.status}): ${body.slice(0, 200)}`, tracks: [] },
      { status: 502 },
    );
  }
  const data = (await res.json()) as SpotifySearchResponse;
  const tracks = (data.tracks?.items ?? []).map((t) => {
    // Pick the smallest album image >= 64px, falling back to last (smallest) image.
    const imgs = t.album?.images ?? [];
    const sorted = [...imgs].sort((a, b) => a.width - b.width);
    const small = sorted.find((i) => i.width >= 64) ?? sorted[sorted.length - 1] ?? null;
    return {
      spotifyId: t.id,
      uri: t.uri,
      title: t.name,
      artist: t.artists.map((a) => a.name).join(", "),
      albumArtUrl: small?.url ?? null,
      previewUrl: t.preview_url ?? null,
      durationMs: t.duration_ms,
    };
  });
  return NextResponse.json({ tracks });
}
