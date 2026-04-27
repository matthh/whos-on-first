import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getSpotifyConfig, getSpotifyServiceUserId } from "@/lib/spotify";

/**
 * Returns whether Spotify is wired up at the *app* level — used by both
 * the player editor (to decide whether to show the song picker) and the
 * admin page (to decide whether to show the "Link service account" button).
 */
export async function GET(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ configured: false, linked: false });
  const configured = !!getSpotifyConfig();
  const serviceUserId = await getSpotifyServiceUserId();
  return NextResponse.json({
    configured,
    linked: !!serviceUserId,
    serviceUserId,
  });
}
