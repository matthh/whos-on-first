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
    config: user?.constraintConfig || null,
  });
}

export async function PUT(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { players, config, coachName } = body;

  // Upsert roster
  if (players !== undefined) {
    const [existing] = await db.select().from(rosters).where(eq(rosters.userId, userId)).limit(1);
    if (existing) {
      await db.update(rosters).set({ players, updatedAt: new Date() }).where(eq(rosters.id, existing.id));
    } else {
      await db.insert(rosters).values({ userId, players });
    }
  }

  // Update user record
  const userUpdates: Record<string, unknown> = {};
  if (config !== undefined) {
    userUpdates.constraintConfig = config;
    if (config.teamName !== undefined) userUpdates.teamName = config.teamName;
    if (config.logoDataUrl !== undefined) userUpdates.logoDataUrl = config.logoDataUrl;
  }
  if (coachName !== undefined) userUpdates.name = coachName;
  if (Object.keys(userUpdates).length > 0) {
    await db.update(users).set(userUpdates).where(eq(users.id, userId));
  }

  return NextResponse.json({ ok: true });
}
