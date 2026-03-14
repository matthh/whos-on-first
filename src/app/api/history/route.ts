import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { gameHistory } from "@/lib/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entries = await db
    .select()
    .from(gameHistory)
    .where(eq(gameHistory.userId, userId))
    .orderBy(desc(gameHistory.createdAt));

  return NextResponse.json({ entries });
}

export async function POST(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { date, players } = body;

  await db.insert(gameHistory).values({ userId, date, players });
  return NextResponse.json({ ok: true });
}
