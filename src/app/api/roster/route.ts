import { NextRequest, NextResponse } from "next/server";
import { getUserId, getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { rosters, users } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getUser(request);
  if (!user || (user.status !== "approved" && user.role !== "admin")) {
    return NextResponse.json({ error: "Account not approved" }, { status: 403 });
  }

  const [roster] = await db.select().from(rosters).where(eq(rosters.userId, userId)).limit(1);

  return NextResponse.json({
    players: roster?.players || [],
    config: user?.constraintConfig || null,
  });
}

function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, "");
}

export async function PUT(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getUser(request);
  if (!user || (user.status !== "approved" && user.role !== "admin")) {
    return NextResponse.json({ error: "Account not approved" }, { status: 403 });
  }

  const body = await request.json();
  const { players, config, coachName } = body;

  // Validate players input
  if (players !== undefined) {
    if (!Array.isArray(players) || players.length > 20) {
      return NextResponse.json({ error: "Invalid players: must be an array with max 20 items" }, { status: 400 });
    }
    for (const p of players) {
      if (typeof p.id !== "string" || typeof p.name !== "string" || typeof p.rank !== "number" || typeof p.absent !== "boolean") {
        return NextResponse.json({ error: "Invalid player: each must have id (string), name (string), rank (number), absent (boolean)" }, { status: 400 });
      }
      if (p.name.length > 50) {
        return NextResponse.json({ error: "Player name must be 50 characters or less" }, { status: 400 });
      }
      p.name = stripHtml(p.name);
    }
  }

  // Validate config
  if (config !== undefined && (typeof config !== "object" || config === null || Array.isArray(config))) {
    return NextResponse.json({ error: "Invalid config: must be an object" }, { status: 400 });
  }

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
