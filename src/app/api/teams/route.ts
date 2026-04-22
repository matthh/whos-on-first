import { NextRequest, NextResponse } from "next/server";
import { getUserId, getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { teams, users } from "@/lib/schema";
import { and, eq } from "drizzle-orm";

function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().replace(/<[^>]*>/g, "").slice(0, 60);
  return t.length > 0 ? t : null;
}

export async function GET(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await getUser(request);
  if (!user || (user.status !== "approved" && user.role !== "admin")) {
    return NextResponse.json({ error: "Account not approved" }, { status: 403 });
  }

  const rows = await db
    .select({ id: teams.id, name: teams.name, createdAt: teams.createdAt })
    .from(teams)
    .where(eq(teams.userId, userId))
    .orderBy(teams.createdAt);

  return NextResponse.json({ teams: rows, activeTeamId: user.activeTeamId ?? null });
}

export async function POST(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await getUser(request);
  if (!user || (user.status !== "approved" && user.role !== "admin")) {
    return NextResponse.json({ error: "Account not approved" }, { status: 403 });
  }

  const body = await request.json();
  const name = sanitizeName(body?.name);
  if (!name) return NextResponse.json({ error: "Team name is required" }, { status: 400 });

  const existing = await db
    .select({ id: teams.id })
    .from(teams)
    .where(and(eq(teams.userId, userId), eq(teams.name, name)))
    .limit(1);
  if (existing.length > 0) {
    return NextResponse.json({ error: "You already have a team with that name" }, { status: 409 });
  }

  const [created] = await db
    .insert(teams)
    .values({ userId, name })
    .returning();

  // Auto-switch to the newly-created team
  await db.update(users).set({ activeTeamId: created.id }).where(eq(users.id, userId));

  return NextResponse.json({ ok: true, team: created });
}
