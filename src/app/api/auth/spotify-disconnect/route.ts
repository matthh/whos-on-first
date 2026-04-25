import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, teams } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Clear all Spotify state from the user. We do NOT delete the playlist
  // from Spotify itself — the coach can keep or remove it from their
  // account at their discretion. Forget the cached playlist id on each
  // of their teams so a future reconnect creates a fresh playlist (the
  // old id may belong to a deleted/orphaned playlist).
  await db
    .update(users)
    .set({
      spotifyUserId: null,
      spotifyDisplayName: null,
      spotifyAccessToken: null,
      spotifyRefreshToken: null,
      spotifyExpiresAt: null,
    })
    .where(eq(users.id, userId));

  await db
    .update(teams)
    .set({ spotifyPlaylistId: null })
    .where(eq(teams.userId, userId));

  return NextResponse.json({ ok: true });
}
