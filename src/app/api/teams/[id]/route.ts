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

async function requireOwnedTeam(request: NextRequest, idStr: string) {
  const userId = getUserId(request);
  if (!userId) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const user = await getUser(request);
  if (!user || (user.status !== "approved" && user.role !== "admin")) {
    return { error: NextResponse.json({ error: "Account not approved" }, { status: 403 }) };
  }
  const teamId = parseInt(idStr, 10);
  if (!teamId || isNaN(teamId)) {
    return { error: NextResponse.json({ error: "Invalid team id" }, { status: 400 }) };
  }
  const [team] = await db
    .select()
    .from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.userId, userId)))
    .limit(1);
  if (!team) return { error: NextResponse.json({ error: "Team not found" }, { status: 404 }) };
  return { userId, team };
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const guard = await requireOwnedTeam(request, id);
  if ("error" in guard) return guard.error;
  const { userId, team } = guard;

  const body = await request.json();
  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = sanitizeName(body.name);
    if (!name) return NextResponse.json({ error: "Team name is required" }, { status: 400 });
    const conflict = await db
      .select({ id: teams.id })
      .from(teams)
      .where(and(eq(teams.userId, userId), eq(teams.name, name)))
      .limit(1);
    if (conflict[0] && conflict[0].id !== team.id) {
      return NextResponse.json({ error: "You already have a team with that name" }, { status: 409 });
    }
    updates.name = name;
  }

  if (body.walkOnPlaylistUrl !== undefined) {
    const raw = body.walkOnPlaylistUrl;
    if (raw === null || raw === "") {
      updates.walkOnPlaylistUrl = null;
    } else if (typeof raw === "string") {
      const trimmed = raw.trim().slice(0, 500);
      // Light validation — must look like a Spotify playlist link. We accept
      // share URLs with ?si=... query strings; the QR renders the URL as-is.
      if (!/^https?:\/\/(open\.)?spotify\.com\/playlist\/[A-Za-z0-9?=&._-]+/i.test(trimmed)) {
        return NextResponse.json(
          { error: "Must be a Spotify playlist URL (e.g. https://open.spotify.com/playlist/...)" },
          { status: 400 }
        );
      }
      updates.walkOnPlaylistUrl = trimmed;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true, team });
  }

  const [updated] = await db.update(teams).set(updates).where(eq(teams.id, team.id)).returning();
  return NextResponse.json({ ok: true, team: updated });
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // POST /api/teams/:id — "switch to this team". No body required.
  const { id } = await ctx.params;
  const guard = await requireOwnedTeam(request, id);
  if ("error" in guard) return guard.error;
  const { userId, team } = guard;

  await db.update(users).set({ activeTeamId: team.id }).where(eq(users.id, userId));
  return NextResponse.json({ ok: true, activeTeamId: team.id });
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const guard = await requireOwnedTeam(request, id);
  if ("error" in guard) return guard.error;
  const { userId, team } = guard;

  // Prevent deleting the last team — user should always have at least one
  const count = await db.select({ id: teams.id }).from(teams).where(eq(teams.userId, userId));
  if (count.length <= 1) {
    return NextResponse.json({ error: "Cannot delete your only team" }, { status: 400 });
  }

  await db.delete(teams).where(eq(teams.id, team.id));

  // If the deleted team was active, pick another
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (u?.activeTeamId === team.id) {
    const [next] = await db
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.userId, userId))
      .orderBy(teams.createdAt)
      .limit(1);
    await db.update(users).set({ activeTeamId: next?.id ?? null }).where(eq(users.id, userId));
  }

  return NextResponse.json({ ok: true });
}
