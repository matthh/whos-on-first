import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getSpotifyConfig } from "@/lib/spotify";

export async function GET(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) {
    return NextResponse.json({ connected: false, configured: false });
  }
  const configured = !!getSpotifyConfig();
  const [user] = await db
    .select({
      spotifyUserId: users.spotifyUserId,
      spotifyDisplayName: users.spotifyDisplayName,
      hasRefresh: users.spotifyRefreshToken,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const connected = !!(user?.hasRefresh);
  return NextResponse.json({
    configured,
    connected,
    spotifyUserId: connected ? user!.spotifyUserId : null,
    displayName: connected ? user!.spotifyDisplayName : null,
  });
}
