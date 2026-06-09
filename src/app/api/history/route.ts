import { NextRequest, NextResponse } from "next/server";
import { getUserId, getUser, getActiveTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { gameHistory } from "@/lib/schema";
import { eq, desc, and } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getUser(request);
  if (!user || (user.status !== "approved" && user.role !== "admin")) {
    return NextResponse.json({ error: "Account not approved" }, { status: 403 });
  }

  const team = await getActiveTeam(request);
  if (!team) return NextResponse.json({ entries: [] });

  const entries = await db
    .select()
    .from(gameHistory)
    .where(and(eq(gameHistory.userId, userId), eq(gameHistory.teamId, team.id)))
    .orderBy(desc(gameHistory.createdAt));

  return NextResponse.json({ entries });
}

export async function POST(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getUser(request);
  if (!user || (user.status !== "approved" && user.role !== "admin")) {
    return NextResponse.json({ error: "Account not approved" }, { status: 403 });
  }

  const team = await getActiveTeam(request);
  if (!team) return NextResponse.json({ error: "No active team" }, { status: 400 });

  const body = await request.json();
  const { date, players } = body;

  if (typeof date !== "string" || date.trim().length === 0 || date.length > 100) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  if (!Array.isArray(players) || players.length > 20) {
    return NextResponse.json({ error: "Invalid players: must be array with max 20 items" }, { status: 400 });
  }
  for (const p of players) {
    if (
      typeof p.id !== "string" ||
      typeof p.name !== "string" ||
      typeof p.rank !== "number" ||
      typeof p.absent !== "boolean"
    ) {
      return NextResponse.json(
        { error: "Invalid player entry: each must have id (string), name (string), rank (number), absent (boolean)" },
        { status: 400 },
      );
    }
  }

  const [inserted] = await db
    .insert(gameHistory)
    .values({ userId, teamId: team.id, date: date.trim(), players })
    .returning();
  return NextResponse.json({ ok: true, id: inserted.id });
}

export async function DELETE(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getUser(request);
  if (!user || (user.status !== "approved" && user.role !== "admin")) {
    return NextResponse.json({ error: "Account not approved" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = parseInt(searchParams.get("id") || "", 10);
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  const team = await getActiveTeam(request);
  if (!team) return NextResponse.json({ error: "No active team" }, { status: 400 });

  await db.delete(gameHistory).where(
    and(eq(gameHistory.id, id), eq(gameHistory.userId, userId), eq(gameHistory.teamId, team.id))
  );
  return NextResponse.json({ ok: true });
}
