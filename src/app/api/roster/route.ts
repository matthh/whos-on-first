import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { rosters, users } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [roster] = await db.select().from(rosters).where(eq(rosters.userId, userId)).limit(1);
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

  return NextResponse.json({
    players: roster?.players || [],
    teamName: user?.teamName || "",
    logoDataUrl: user?.logoDataUrl || null,
  });
}

export async function PUT(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { players, teamName, logoDataUrl } = body;

  // Upsert roster
  const [existing] = await db.select().from(rosters).where(eq(rosters.userId, userId)).limit(1);
  if (existing) {
    await db.update(rosters).set({ players, updatedAt: new Date() }).where(eq(rosters.id, existing.id));
  } else {
    await db.insert(rosters).values({ userId, players });
  }

  // Update team name and logo on user record
  const updates: Record<string, unknown> = {};
  if (teamName !== undefined) updates.teamName = teamName;
  if (logoDataUrl !== undefined) updates.logoDataUrl = logoDataUrl;
  if (Object.keys(updates).length > 0) {
    await db.update(users).set(updates).where(eq(users.id, userId));
  }

  return NextResponse.json({ ok: true });
}
